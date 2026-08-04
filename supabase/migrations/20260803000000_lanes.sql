-- =============================================
-- Migration: configurable board lanes
-- Lanes stop being the hardcoded MAIN_LANES in lib/types.ts and become rows
-- here; the board renders active lanes in sort_order and dispatchers manage
-- them from the new Lanes modal. TEXT ids keep the existing slugs so no
-- drivers row needs rewriting (deliberate deviation from ridecrew's uuid PKs).
-- Idempotent: safe to re-run. Auto-applied to preview branch DBs from this
-- directory; must ALSO be run manually in the prod SQL editor (see PREVIEW.md).
-- Backward compatible with currently-deployed code (it writes only the six
-- seeded slugs and never reads this table), so run this in prod FIRST, then
-- deploy the code.
-- =============================================

-- ---------------------------------------------
-- 1. The lanes themselves.
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS lanes (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lanes_sort_order ON lanes(sort_order);

-- ---------------------------------------------
-- 2. Seed the six existing lanes in current board order. downtown_hotel is
--    seeded INACTIVE: legacy rows may still reference it, but it is not shown
--    for 2026. ON CONFLICT DO NOTHING so re-runs never clobber renames or
--    reorders made through the UI since the first run.
-- ---------------------------------------------
INSERT INTO lanes (id, label, sort_order, active) VALUES
  ('tennis_centre',  'Tennis Centre',  0, true),
  ('uptown_hotel',   'Uptown Hotel',   1, true),
  ('airport',        'Airport',        2, true),
  ('other',          'Other',          3, true),
  ('meals',          'Meals',          4, true),
  ('downtown_hotel', 'Downtown Hotel', 5, false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------
-- 3. RLS — same single-policy shape as every other table.
-- ---------------------------------------------
ALTER TABLE lanes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated access" ON lanes;
CREATE POLICY "authenticated access" ON lanes
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------
-- 4. Realtime — the board refetches lanes on any change. (ALTER PUBLICATION
--    ADD TABLE has no IF NOT EXISTS, so skip if already present.)
-- ---------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'lanes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE lanes;
  END IF;
END $$;

-- ---------------------------------------------
-- 5. Replace the hardcoded drivers.lane CHECK with a foreign key, so lanes
--    added through the UI are writable without another migration.
--
--    The CHECK was created inline in the initial schema, so its name is
--    whatever Postgres generated — find it in the catalog (same approach as
--    the away_reason migration). Matched on 'tennis_centre', a string only
--    this constraint's definition contains, NOT on 'lane', which would also
--    catch any future lane_order / lane_entered_at constraint.
-- ---------------------------------------------
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
      AND pg_get_constraintdef(con.oid) ILIKE '%tennis_centre%'
  LOOP
    EXECUTE format('ALTER TABLE public.drivers DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- No ON DELETE action: deleting a lane that still holds drivers must fail.
-- The UI only ever hides lanes — this FK is the backstop against SQL-editor
-- deletes. Validation cannot fail: the old CHECK guaranteed every existing
-- drivers.lane value is one of the six ids seeded above.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'drivers_lane_fkey'
  ) THEN
    ALTER TABLE public.drivers
      ADD CONSTRAINT drivers_lane_fkey
      FOREIGN KEY (lane) REFERENCES lanes(id);
  END IF;
END $$;

-- roster.lane (free text, no CHECK) and dispatcher_assignments (its own
-- narrow CHECK) are deliberately untouched.
