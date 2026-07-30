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

/**
 * Elapsed milliseconds → "<1m", "47m", "1h 05m".
 *
 * Clamped at zero: the elapsed time is measured against the *browser's* clock
 * while the stamp comes from the database's, so a dispatcher device running a
 * little behind would otherwise render a negative duration right after a move.
 */
export function formatDurationShort(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

/**
 * An ISO timestamp → "14:15" in the tournament timezone. Empty string on bad data.
 *
 * Same 24-hour format as the board's LiveClock, so "since 14:15" can be read
 * straight against the clock in the header.
 */
export function formatClockTime(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleTimeString('en-CA', {
    timeZone: TOURNAMENT_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
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
