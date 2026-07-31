export type ShiftType = 'morning' | 'afternoon' | 'evening';

export type DriverStatus = 'unassigned' | 'assigned' | 'away';

export type LocationStatus = 'at_location' | 'en_route';

export type AwayReason = 'gas' | 'carwash' | 'practice' | 'parking' | 'meals';

export type LaneId =
  | 'tennis_centre'
  | 'uptown_hotel'
  // Retained as a valid lane for legacy data and a future re-add, but NOT shown for
  // 2026 (no downtown hotel this year) — intentionally left out of MAIN_LANES below.
  | 'downtown_hotel'
  | 'airport'
  | 'other'
  // Meals is an away status now, not a place drivers get parked (see AWAY_ICONS).
  // Kept as a valid lane purely so rows and roster entries written before that
  // change still resolve to a label instead of rendering "undefined".
  | 'meals';

/** One scheduled shift for a driver on a given day (a single roster assignment). */
export interface DriverShift {
  shift_type: ShiftType;       // the period (morning/afternoon/evening)
  label: string;               // "7:00 AM – 1:00 PM"
  start_time: string;          // "7:00 AM"
  end_time: string;            // "1:00 PM"
  lane: LaneId;                // mapped from the assignment's location
  role: string;                // "Fleet Driver", "Airport Greeter", …
  source_location: string;     // raw location, e.g. "Uptown Hotel (Hilton Suites Markham)"
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  shift_type: ShiftType;       // primary (earliest) shift — kept for sorting/back-compat
  shift_time: string;          // primary shift label
  shifts: DriverShift[];       // all of the day's shifts (drives the multi-color card bar)
  role: string | null;         // primary role
  walkie_number: string | null;
  car_number: string | null;
  status: DriverStatus;
  away_reason: AwayReason | null;
  lane: LaneId;
  lane_order: number;
  location_status: LocationStatus | null;
  notes: string | null;
  checked_in_at: string;
  checked_out_at: string | null;
  // When they entered their current lane — reset by a DB trigger on every lane
  // change (see supabase/migrations/*_lane_entered_at.sql), never written by the
  // client. Nullable because prod serves rows without it until that SQL is run.
  lane_entered_at: string | null;
}

/** A single assignment row from an imported daily roster. */
export interface RosterEntry {
  id: string;
  shift_date: string;          // YYYY-MM-DD
  name: string;
  phone: string;
  shift_type: ShiftType;       // the period
  start_time: string;
  end_time: string;
  shift_label: string;         // "7:00 AM – 1:00 PM"
  role: string;
  lane: LaneId;
  source_location: string;
}

export const LANE_LABELS: Record<LaneId, string> = {
  tennis_centre: 'Tennis Centre',
  uptown_hotel: 'Uptown Hotel',
  downtown_hotel: 'Downtown Hotel',
  airport: 'Airport',
  other: 'Other',
  meals: 'Meals',
};

export const SHIFT_COLORS: Record<ShiftType, string> = {
  morning: '#3B82F6',
  afternoon: '#10B981',
  evening: '#8B5CF6',
};

export const SHIFT_LABELS: Record<ShiftType, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

/** Sort order for picking a driver's primary (earliest) shift. */
export const SHIFT_ORDER: Record<ShiftType, number> = {
  morning: 0,
  afternoon: 1,
  evening: 2,
};

export const FLEET_DRIVER_ROLE = 'Fleet Driver';

// Order here is the order of the buttons on the card — keep the three maps below
// in step, and remember the away_reason CHECK constraint in the database has to
// allow any key added here (see supabase/migrations/*_meals_away_reason.sql).
export const AWAY_ICONS: Record<AwayReason, string> = {
  gas: '⛽',
  carwash: '🧼',
  practice: '🎾',
  parking: '🚐',
  meals: '🍔',
};

export const AWAY_LABELS: Record<AwayReason, string> = {
  gas: 'Gas Station',
  carwash: 'Car Wash',
  practice: 'Practice Courts',
  parking: 'Parking Lot Shuttle',
  meals: 'Meal Break',
};

/** One-word captions under the away buttons — the full labels are too wide to fit
 *  five buttons across a card. Spelled out rather than derived from the first word
 *  of AWAY_LABELS, so a label reworded for the tooltip can't silently reshuffle
 *  what dispatchers read on the buttons. */
export const AWAY_SHORT_LABELS: Record<AwayReason, string> = {
  gas: 'Gas',
  carwash: 'Car',
  practice: 'Practice',
  parking: 'Parking',
  meals: 'Meals',
};

// The board's columns, and the lane options at check-in and on a card's "Move To".
// `downtown_hotel` is intentionally omitted for 2026 — re-add it here to restore the
// column. `meals` was a column until drivers on a meal break became an away status
// instead, which keeps them in the lane they will come back to.
export const MAIN_LANES: LaneId[] = [
  'tennis_centre',
  'uptown_hotel',
  'airport',
  'other',
];

export const SHIFT_TYPES: ShiftType[] = ['morning', 'afternoon', 'evening'];
