-- =============================================
-- NBO Driver Board - Supabase Schema
-- Run this in the Supabase SQL Editor
-- =============================================

-- Driver roster (pre-imported from Excel)
CREATE TABLE IF NOT EXISTS roster (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  shift_type TEXT NOT NULL CHECK (shift_type IN ('morning', 'afternoon', 'evening', 'nightowl')),
  shift_time TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Active drivers on the board
CREATE TABLE IF NOT EXISTS drivers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  roster_id UUID REFERENCES roster(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  shift_type TEXT NOT NULL CHECK (shift_type IN ('morning', 'afternoon', 'evening', 'nightowl')),
  shift_time TEXT NOT NULL DEFAULT '',
  walkie_number TEXT,
  car_number TEXT,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('unassigned', 'assigned', 'away')),
  away_reason TEXT CHECK (away_reason IN ('gas', 'carwash', 'practice', 'parking')),
  lane TEXT NOT NULL DEFAULT 'tennis_centre' CHECK (lane IN ('tennis_centre', 'uptown_hotel', 'downtown_hotel', 'airport', 'other', 'meals')),
  lane_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  checked_in_at TIMESTAMPTZ DEFAULT NOW(),
  checked_out_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dispatcher assignments (who is managing which hotel route)
CREATE TABLE IF NOT EXISTS dispatcher_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lane TEXT NOT NULL CHECK (lane IN ('uptown_hotel', 'downtown_hotel')),
  dispatcher_name TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default dispatcher slots (idempotent — only inserts lanes not already present;
-- there is no UNIQUE(lane), so ON CONFLICT can't guard this)
INSERT INTO dispatcher_assignments (lane, dispatcher_name)
SELECT v.lane, ''
FROM (VALUES ('uptown_hotel'), ('downtown_hotel')) AS v(lane)
WHERE NOT EXISTS (
  SELECT 1 FROM dispatcher_assignments d WHERE d.lane = v.lane
);

-- =============================================
-- Enable Realtime (idempotent — ALTER PUBLICATION ADD TABLE has no IF NOT EXISTS,
-- so skip tables already in the publication)
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'drivers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE drivers;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dispatcher_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE dispatcher_assignments;
  END IF;
END $$;

-- =============================================
-- Indexes for performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_drivers_lane ON drivers(lane);
CREATE INDEX IF NOT EXISTS idx_drivers_checked_out ON drivers(checked_out_at);
CREATE INDEX IF NOT EXISTS idx_drivers_lane_order ON drivers(lane, lane_order);
