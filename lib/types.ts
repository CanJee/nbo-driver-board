export type ShiftType = 'morning' | 'afternoon' | 'evening' | 'nightowl';

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

export interface Driver {
  id: string;
  name: string;
  phone: string;
  shift_type: ShiftType;
  shift_time: string;
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

export interface RosterEntry {
  id: string;
  name: string;
  phone: string;
  shift_type: ShiftType;
  shift_time: string;
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
  nightowl: '#1E293B',
};

export const SHIFT_LABELS: Record<ShiftType, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  nightowl: 'Nightowl',
};

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
