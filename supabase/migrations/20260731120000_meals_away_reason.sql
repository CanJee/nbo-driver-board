-- =============================================
-- Migration: 'meals' replaces 'uptown_shuttle' as an away reason
-- Idempotent: safe to re-run. Supabase Branching applies it — to this PR's preview
-- branch DB on every commit, and to prod when the PR merges to main (see PREVIEW.md).
-- =============================================

-- Two changes land together, because they are the same change:
--   · The Uptown Shuttle away reason (added the day before, never used) is gone.
--   · A meal break is an away reason now instead of a lane, so the Meals column
--     is off the board and anyone sitting in it has to come back to a real lane.
--
-- The away buttons on a driver card come straight from AWAY_ICONS in lib/types.ts,
-- so a reason listed there is written to drivers.away_reason as-is. Without the
-- constraint below matching that list, the CHECK rejects the update and the new
-- button silently does nothing.
--
-- The old constraint is dropped by looking it up in the catalog rather than by
-- name: the original was created inline in the initial schema, so its name is
-- whatever Postgres generated. Dropping a name that doesn't exist would leave the
-- real constraint in place and the ADD below would still "succeed", which fails
-- only later, on the board, as an away button that does nothing.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public'
      AND rel.relname = 'drivers'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%away_reason%'
  LOOP
    EXECUTE format('ALTER TABLE public.drivers DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- Any driver still marked Uptown Shuttle comes back on duty: the new constraint
-- is validated against existing rows, so leaving one behind would fail the ADD at
-- the bottom and abort the whole migration. Status follows the card's own rule —
-- a driver with no car is unassigned, not assigned.
UPDATE public.drivers
SET away_reason = NULL,
    status = CASE WHEN car_number IS NULL THEN 'unassigned' ELSE 'assigned' END
WHERE away_reason = 'uptown_shuttle';

-- Empty the Meals lane, which no longer has a column to render in — without this
-- everyone parked there simply vanishes from the board. They keep the fact that
-- they are on a meal break (now as an away status) but lose the lane they were in
-- before it, which the old board never recorded, so they land in Tennis Centre for
-- a dispatcher to drag on from. Appended after the last card there rather than
-- keeping their old lane_order, which would interleave them into the queue.
--
-- lane_entered_at is reset by trg_set_lane_entered_at, which is right: their
-- time-in-lane now counts from the lane they are actually in.
--
-- Checked-out rows are left alone — they are history, and `meals` stays a legal
-- lane value precisely so they still read back.
WITH tail AS (
  SELECT COALESCE(MAX(lane_order), -1) AS last_order
  FROM public.drivers
  WHERE lane = 'tennis_centre' AND checked_out_at IS NULL
),
moved AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY lane_order, checked_in_at) AS n
  FROM public.drivers
  WHERE lane = 'meals' AND checked_out_at IS NULL
)
UPDATE public.drivers d
SET lane = 'tennis_centre',
    lane_order = tail.last_order + moved.n,
    status = 'away',
    away_reason = 'meals'
FROM moved, tail
WHERE d.id = moved.id;

ALTER TABLE public.drivers
  ADD CONSTRAINT drivers_away_reason_check
  CHECK (away_reason IN ('gas', 'carwash', 'practice', 'parking', 'meals'));
