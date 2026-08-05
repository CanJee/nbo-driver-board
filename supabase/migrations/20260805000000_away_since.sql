-- =============================================
-- Migration: away_since (how long a driver has been away)
-- Idempotent: safe to re-run. Auto-applied to preview branch DBs from this
-- directory; must ALSO be run manually in the prod SQL editor (see PREVIEW.md).
-- =============================================

-- ---------------------------------------------
-- 1. When the driver's current away spell started.
--    No default and deliberately NOT backfilled, unlike lane_entered_at: a row
--    is never inserted away (check-in is assigned/unassigned), and a driver who
--    is already away when this runs has no recorded start time. Inventing one —
--    the migration time, or their check-in — would put a confidently wrong
--    number on a dispatch screen. They stay NULL, the card hides the timer, and
--    their next status change starts a real clock.
-- ---------------------------------------------
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS away_since TIMESTAMPTZ;

-- ---------------------------------------------
-- 2. Stamp on the way into away, clear on the way out.
--
--    A trigger rather than client code, for the same reasons as
--    set_lane_entered_at(): more than one write path moves a driver in and out
--    of away — the away buttons and Returned (handleSetAway), and ASSIGN, which
--    force-clears away as a side effect (handleAssign) — so one rule in the
--    database covers them all, including any added later. It also stamps from
--    the database clock, so a dispatcher device running fast or slow can't
--    corrupt it.
--
--    Semantics: switching reason while already away restarts the clock, because
--    the timer answers "how long on THIS errand", not "how long off the board".
--    Re-asserting the same status and reason (two dispatcher tabs racing) keeps
--    the original stamp.
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION set_away_since()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'away' THEN
    IF OLD.status IS DISTINCT FROM 'away'
       OR NEW.away_reason IS DISTINCT FROM OLD.away_reason THEN
      NEW.away_since := NOW();
    END IF;
  ELSE
    NEW.away_since := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- OF status, away_reason: skip the call for the updates that can't change the
-- away spell — notes, location status, and the {lane, lane_order} rewrites a
-- drag fires for every driver in both affected lanes. That last one is why a
-- driver keeps their timer when they are moved between lanes mid-errand.
DROP TRIGGER IF EXISTS trg_set_away_since ON drivers;
CREATE TRIGGER trg_set_away_since
  BEFORE UPDATE OF status, away_reason ON drivers
  FOR EACH ROW
  EXECUTE FUNCTION set_away_since();
