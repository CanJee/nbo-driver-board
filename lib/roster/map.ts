import { LaneId, ShiftType, FLEET_DRIVER_ROLE } from '@/lib/types';

// ── ShiftCrew "Period" → app shift type ──
// ShiftCrew uses Morning / Day / Evening; the board uses morning/afternoon/evening.
// "Day" (the midday block) maps to afternoon. Matches on inclusion so decorated
// labels ("Morning Shift", "Day (Midday)") still resolve. Order matters: check
// evening before "day" so "evening" isn't mis-bucketed.
export function mapPeriod(raw: string): ShiftType | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v.includes('morning')) return 'morning';
  if (v.includes('evening') || v.includes('night')) return 'evening';
  if (v.includes('afternoon') || v.includes('midday') || v.includes('day')) return 'afternoon';
  if (/\bpm\b/.test(v)) return 'afternoon';
  if (/\bam\b/.test(v)) return 'morning';
  return null;
}

/** Collapse irregular whitespace in a name ("Erik  Iesalins", "Don Rambajan ") → canonical form. */
export function normalizeName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

// ── Location / role → lane ──
// Tries the raw location first, then falls back to the role text
// (e.g. an "Airport Greeter" with a blank location still maps to the airport lane).
const LANE_KEYWORDS: [RegExp, LaneId][] = [
  [/tennis/i, 'tennis_centre'],
  [/uptown/i, 'uptown_hotel'],
  // `downtown` intentionally unmapped for 2026 (no downtown hotel) — such rows fall
  // through to the "Other" lane with a warning. Restore this line to re-enable it.
  [/airport/i, 'airport'],
  [/meal/i, 'meals'],
];

export function mapLane(sourceLocation: string, role = ''): LaneId | null {
  for (const [re, lane] of LANE_KEYWORDS) {
    if (re.test(sourceLocation)) return lane;
  }
  for (const [re, lane] of LANE_KEYWORDS) {
    if (re.test(role)) return lane;
  }
  return null;
}

export function isFleetDriver(role: string): boolean {
  return role.trim().toLowerCase() === FLEET_DRIVER_ROLE.toLowerCase();
}

/** "7:00 AM" / "07:00" / "4:00 PM" → minutes since midnight (for sorting). NaN if unparseable. */
export function parseTimeToMinutes(time: string): number {
  const m = time.trim().match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/i);
  if (!m) return NaN;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const mer = m[3]?.toLowerCase();
  if (mer === 'pm' && h !== 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  return h * 60 + min;
}

/** Build the display label for a shift's time range. */
export function shiftLabel(start: string, end: string): string {
  const s = start.trim();
  const e = end.trim();
  if (s && e) return `${s} – ${e}`;
  return s || e || '';
}
