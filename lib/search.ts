import { Driver } from './types';

/** Which driver field a search query matched. Visible fields (name/walkie/car)
 *  are checked first so the card needs no extra explanation; phone/notes are
 *  hidden on collapsed cards, so a hit there drives a "why it matched" snippet. */
export type SearchMatchField = 'name' | 'walkie' | 'car' | 'phone' | 'notes';

/** Case-insensitive substring match across the fields dispatchers ask for.
 *  Phone matching is digits-only ("4165550182" matches "(416) 555-0182") and
 *  requires 3+ digits so short numeric queries like walkie "12" don't light up
 *  every phone number containing that pair. Returns the first matched field,
 *  or null if the driver doesn't match (or the query is blank). */
export function matchDriver(driver: Driver, query: string): SearchMatchField | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  if (driver.name.toLowerCase().includes(q)) return 'name';
  if (driver.walkie_number?.toLowerCase().includes(q)) return 'walkie';
  if (driver.car_number?.toLowerCase().includes(q)) return 'car';

  const qDigits = q.replace(/\D/g, '');
  if (qDigits.length >= 3 && driver.phone.replace(/\D/g, '').includes(qDigits)) {
    return 'phone';
  }

  if (driver.notes?.toLowerCase().includes(q)) return 'notes';
  return null;
}

/** Per-lane and board-wide search context passed down from Board. `null` when
 *  no search is active (so components can skip all search styling). */
export interface SearchState {
  query: string;
  matches: Map<string, SearchMatchField>;
}
