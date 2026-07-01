export type ShiftType = 'morning' | 'afternoon' | 'evening';

export type DriverStatus = 'unassigned' | 'assigned' | 'away';

export type LocationStatus = 'at_location' | 'en_route';

export type AwayReason = 'gas' | 'carwash' | 'practice' | 'parking';

export type LaneId =
  | 'tennis_centre'
  | 'uptown_hotel'
  | 'downtown_hotel'
  | 'airport'
  | 'other'
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

export const AWAY_ICONS: Record<AwayReason, string> = {
  gas: '⛽',
  carwash: '🧼',
  practice: '🎾',
  parking: '🚐',
};

export const AWAY_LABELS: Record<AwayReason, string> = {
  gas: 'Gas Station',
  carwash: 'Car Wash',
  practice: 'Practice Courts',
  parking: 'Parking Lot Shuttle',
};

export const MAIN_LANES: LaneId[] = [
  'tennis_centre',
  'uptown_hotel',
  'downtown_hotel',
  'airport',
  'other',
];

export const SHIFT_TYPES: ShiftType[] = ['morning', 'afternoon', 'evening'];
