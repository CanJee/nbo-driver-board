-- =============================================
-- Migration 2: Per-day roster + multi-shift drivers
-- Run in the Supabase SQL Editor AFTER supabase-schema.sql + supabase-migration.sql.
-- Idempotent: safe to re-run. ALTERs existing tables (never DROPs) so the
-- "authenticated access" RLS policies and the drivers.roster_id FK are preserved.
-- =============================================

-- ---------------------------------------------
-- 1. drivers: carry ALL of a driver's shifts for the day + their roster role.
--    The existing realtime publication already covers new columns — no change there.
-- ---------------------------------------------
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS shifts JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS role   TEXT;

-- ---------------------------------------------
-- 2. roster: becomes per-day, one row per assignment.
--    shift_type keeps its meaning (the period: morning/afternoon/evening).
-- ---------------------------------------------
ALTER TABLE roster
  ADD COLUMN IF NOT EXISTS shift_date      DATE,
  ADD COLUMN IF NOT EXISTS start_time      TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS end_time        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shift_label     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS role            TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS lane            TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS source_location TEXT NOT NULL DEFAULT '';

-- Stamp legacy (date-less) roster rows with a sentinel so shift_date can be NOT NULL
-- and the unique index can be applied. Real imports always carry a real date.
UPDATE roster SET shift_date = DATE '2000-01-01' WHERE shift_date IS NULL;
ALTER TABLE roster ALTER COLUMN shift_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_roster_shift_date ON roster(shift_date);

-- The old roster had no unique constraint, so legacy rows (now all stamped with the
-- sentinel date) may share a key. Collapse duplicates first, otherwise the UNIQUE
-- index below cannot be created and the whole migration aborts.
DELETE FROM roster a
USING roster b
WHERE a.ctid < b.ctid
  AND a.shift_date = b.shift_date
  AND a.name = b.name
  AND a.shift_type = b.shift_type
  AND a.source_location = b.source_location;

-- One assignment per (day, person, period, location). Enables ON CONFLICT upsert
-- so re-importing a day is idempotent and never severs checked-in drivers.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'roster_day_assignment_unique'
  ) THEN
    ALTER TABLE roster
      ADD CONSTRAINT roster_day_assignment_unique
      UNIQUE (shift_date, name, shift_type, source_location);
  END IF;
END $$;

-- ---------------------------------------------
-- 3. Remove 'nightowl' everywhere.
--    Migrate any live rows first (narrowing a CHECK with violating rows aborts),
--    then drop whatever shift_type CHECK exists (regardless of its auto name) and
--    re-add the tightened one.
-- ---------------------------------------------
UPDATE drivers SET shift_type = 'evening' WHERE shift_type = 'nightowl';
UPDATE roster  SET shift_type = 'evening' WHERE shift_type = 'nightowl';

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname, conrelid::regclass AS tbl
    FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid IN ('drivers'::regclass, 'roster'::regclass)
      AND pg_get_constraintdef(oid) ILIKE '%shift_type%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;

ALTER TABLE drivers
  ADD CONSTRAINT drivers_shift_type_check
  CHECK (shift_type IN ('morning', 'afternoon', 'evening'));

ALTER TABLE roster
  ADD CONSTRAINT roster_shift_type_check
  CHECK (shift_type IN ('morning', 'afternoon', 'evening'));
