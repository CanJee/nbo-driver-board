-- =============================================
-- Migration: Location Status + RLS + Auth
-- Run this in the Supabase SQL Editor
-- =============================================

-- 1. Add location_status column to drivers
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS location_status TEXT
  CHECK (location_status IN ('at_location', 'en_route'))
  DEFAULT NULL;

-- =============================================
-- 2. Enable Row-Level Security on all tables
-- =============================================
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatcher_assignments ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 3. RLS Policies — authenticated users only
--    (requires Supabase Auth login to read/write)
--    DROP ... IF EXISTS first so this is idempotent (CREATE POLICY has no IF NOT EXISTS)
-- =============================================

-- drivers
DROP POLICY IF EXISTS "authenticated access" ON drivers;
CREATE POLICY "authenticated access" ON drivers
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- roster
DROP POLICY IF EXISTS "authenticated access" ON roster;
CREATE POLICY "authenticated access" ON roster
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- dispatcher_assignments
DROP POLICY IF EXISTS "authenticated access" ON dispatcher_assignments;
CREATE POLICY "authenticated access" ON dispatcher_assignments
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
