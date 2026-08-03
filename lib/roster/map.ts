import { Lane, ShiftType, FLEET_DRIVER_ROLE } from '@/lib/types';

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
// Ported from ridecrew's matchZone (packages/shared/src/imports.ts): lanes are
// DB rows now, so the match is generic instead of the old hardcoded regexes —
// a lane added through the UI maps roster rows with no code change. A lane
// claims a row when its whole label appears in the location text (pass 1),
// else when a distinctive word of its label appears in the location (pass 2),
// else in the role (pass 3 — an "Airport Greeter" with a blank location still
// maps to the Airport lane). Whole-label beats word so "Airport Hotel" lands
// on Airport, not on a hotel lane.
//
// "Distinctive" = the word appears in exactly ONE lane's label across ALL
// lanes, hidden ones included. Both hotels share "hotel", so with
// downtown_hotel merely hidden, "Downtown Hotel (Marriott)" falls through to
// the fallback — matching the old regexes, which never cross-matched — instead
// of word-matching Uptown.

const LANE_STOPWORDS = new Set(['the', 'and', 'for', 'with', 'des', 'les', 'de', 'la', 'le']);

function laneWords(label: string): string[] {
  return label
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4 && !LANE_STOPWORDS.has(w));
}

/** "Meals" claims "Meal break" too — plural lane labels match their singular. */
function containsWord(text: string, word: string): boolean {
  if (text.includes(word)) return true;
  return word.endsWith('s') && text.includes(word.slice(0, -1));
}

export function matchLane(
  candidates: Lane[],
  allLanes: Lane[],
  sourceLocation: string,
  role = ''
): Lane | null {
  const loc = sourceLocation.trim().toLowerCase();
  const roleText = role.trim().toLowerCase();

  // Word → how many lane labels contain it; >1 means non-distinctive.
  const counts = new Map<string, number>();
  for (const l of allLanes) {
    for (const w of new Set(laneWords(l.label))) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const distinctive = (l: Lane) => laneWords(l.label).filter((w) => (counts.get(w) ?? 0) <= 1);

  if (loc) {
    for (const l of candidates) {
      const label = l.label.trim().toLowerCase();
      if (label && loc.includes(label)) return l;
    }
    for (const l of candidates) {
      if (distinctive(l).some((w) => containsWord(loc, w))) return l;
    }
  }
  if (roleText) {
    for (const l of candidates) {
      if (distinctive(l).some((w) => containsWord(roleText, w))) return l;
    }
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
