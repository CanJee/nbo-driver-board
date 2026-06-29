// All "today" logic is anchored to the tournament's local timezone, NOT the
// server/UTC clock. Using UTC would roll the date over at 8pm Toronto (the
// evening dispatch window), making that day's roster vanish from check-in.
export const TOURNAMENT_TZ = 'America/Toronto';

/** Today's date in the tournament timezone, as `YYYY-MM-DD` (en-CA format). */
export function getTournamentDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TOURNAMENT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** A `YYYY-MM-DD` string → "Friday, July 31, 2026". Returns the input on bad data. */
export function formatRosterDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  // Anchor at UTC noon so the weekday/day never shift under timezone formatting.
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(dt);
}
