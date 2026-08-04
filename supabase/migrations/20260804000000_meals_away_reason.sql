-- =============================================
-- Migration: allow 'meals' as an away reason
-- Idempotent: safe to re-run. Auto-applied to preview branch DBs from this
-- directory; must ALSO be run manually in the prod SQL editor (see PREVIEW.md).
-- =============================================

-- The away buttons on a driver card come straight from AWAY_ICONS in lib/types.ts,
-- so a reason added there is written to drivers.away_reason as-is. Without this the
-- CHECK constraint rejects the update and the new button silently does nothing.
--
-- 'meals' here is drivers.away_reason, NOT the lanes row that happens to share the
-- slug. They are separate columns with separate constraints: hiding or deleting the
-- Meals lane has no effect on this value, which is the point of adding it — a driver
-- eating is marked away in the lane they already sit in, instead of being moved.
--
-- The old constraint is dropped by looking it up in the catalog rather than by name:
-- it was created inline in the initial schema, so its name is whatever Postgres
-- generated, and the rename to drivers_away_reason_check only happened on databases
-- that have already run the uptown_shuttle migration. Dropping a name that doesn't
-- exist would leave the original constraint in place and the ADD below would still
-- "succeed", which fails only later, on the board, as an away button that does nothing.
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

ALTER TABLE public.drivers
  ADD CONSTRAINT drivers_away_reason_check
  CHECK (away_reason IN ('gas', 'carwash', 'practice', 'parking', 'uptown_shuttle', 'meals'));
