-- =============================================
-- Migration: lane_entered_at (time-in-lane timer)
-- Applies to EVERY lane, not just meals.
-- Idempotent: safe to re-run. Auto-applied to preview branch DBs from this
-- directory; must ALSO be run manually in the prod SQL editor (see PREVIEW.md).
-- =============================================

-- ---------------------------------------------
-- 1. When the driver entered their current lane.
--    Added without a default on purpose: existing rows must stay NULL here so
--    the backfill below can give them a real value (their check-in time)
--    instead of stamping every card on the board with the migration time.
-- ---------------------------------------------
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS lane_entered_at TIMESTAMPTZ;

-- ---------------------------------------------
-- 2. Backfill rows that predate the column. Check-in time is the best available
--    approximation of when they entered the lane they are sitting in now.
-- ---------------------------------------------
UPDATE drivers
  SET lane_entered_at = COALESCE(checked_in_at, created_at)
  WHERE lane_entered_at IS NULL;

-- ---------------------------------------------
-- 3. New check-ins start their timer at insert time.
-- ---------------------------------------------
ALTER TABLE drivers
  ALTER COLUMN lane_entered_at SET DEFAULT NOW();

-- ---------------------------------------------
-- 4. Reset the stamp when a row's lane actually changes, and only then.
--
--    A trigger rather than client code, because the board's drag handler
--    rewrites {lane, lane_order} for EVERY driver in both affected lanes — the
--    write payload alone cannot tell "moved into this lane" apart from
--    "renumbered in place", but NEW.lane IS DISTINCT FROM OLD.lane can. It also
--    covers tap-to-move and any future write path for free, and stamps from the
--    DB clock so a dispatcher device with a skewed clock can't corrupt it.
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION set_lane_entered_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lane IS DISTINCT FROM OLD.lane THEN
    NEW.lane_entered_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- OF lane: skip the call entirely for the many updates that never touch the
-- lane at all (notes, away status, location status, walkie/car assignment).
DROP TRIGGER IF EXISTS trg_set_lane_entered_at ON drivers;
CREATE TRIGGER trg_set_lane_entered_at
  BEFORE UPDATE OF lane ON drivers
  FOR EACH ROW
  EXECUTE FUNCTION set_lane_entered_at();
