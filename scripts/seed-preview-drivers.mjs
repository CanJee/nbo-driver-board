/**
 * Tops up the Vercel PREVIEW branch database with synthetic drivers, so previews
 * always have a board worth testing on.
 *
 * The clone in clone-prod-to-preview.mjs mirrors prod exactly, which is the right
 * default — but between tournament days prod can be nearly empty, and several
 * board behaviours only show up on a *crowded* lane: cards wrapping into columns,
 * lane widths reweighting, and cross-lane drag/drop landing where it was released.
 * This fills each lane up to a minimum so those are always reachable.
 *
 * Preview-only and idempotent: it skips entirely on non-preview builds, and once
 * its drivers exist it never adds more (so a redeploy can't compound them after a
 * tester has dragged cards around).
 *
 * Target: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (injected by the Supabase–Vercel
 * integration). Service-role so the inserts bypass RLS.
 */
import { createClient } from '@supabase/supabase-js';

// Shared surname on every seeded driver: the idempotency marker, and an obvious
// "not a real person" signal on the board and in search.
const MARKER = 'Testcase';

// Enough per lane to exercise the crowded-lane layout on a 1080p TV, where a lane
// column holds roughly a dozen cards: tennis_centre wraps to 3 columns (the
// MAX_LANE_COLS cap), uptown_hotel to 2, and airport stays single-column. `other`
// is deliberately absent so there is always an empty lane to drag into — a drop on
// bare lane background is its own code path, and the Meals lane used to cover it.
const MIN_PER_LANE = {
  tennis_centre: 26,
  uptown_hotel: 14,
  airport: 7,
};

const FIRST_NAMES = [
  'Amara', 'Devon', 'Priya', 'Mateo', 'Noor', 'Kwame', 'Elena', 'Rashid',
  'Yuki', 'Farid', 'Lucia', 'Omar', 'Ingrid', 'Tariq', 'Sofia', 'Idris',
  'Mei', 'Andre', 'Zara', 'Pavel', 'Hana', 'Bruno', 'Leila', 'Kofi',
  'Nadia', 'Viktor', 'Aisha', 'Tomas', 'Reem', 'Gustav', 'Simone', 'Jamal',
];

const SHIFTS = [
  { shift_type: 'morning', start_time: '7:00 AM', end_time: '1:00 PM' },
  { shift_type: 'afternoon', start_time: '1:00 PM', end_time: '7:00 PM' },
  { shift_type: 'evening', start_time: '7:00 PM', end_time: '1:00 AM' },
];

const ROLES = ['Fleet Driver', 'Airport Greeter', 'Player Shuttle', 'Support Driver'];
const AWAY_REASONS = ['gas', 'carwash', 'practice', 'parking'];

/**
 * A spread of "entered this lane N minutes ago" stamps, so the expanded card's
 * time-in-lane readout has something to show on a fresh preview instead of a
 * board where every card says "<1m". Covers all three formats: under a minute,
 * minutes, and hours. Deterministic so redeploys don't churn the numbers.
 */
const LANE_MINUTES_AGO = [0, 4, 18, 47, 96, 152, 213];

/** One synthetic driver row. `i` is its index within the lane, and drives the variety. */
function makeDriver(lane, i, laneOrder) {
  const shift = SHIFTS[i % SHIFTS.length];
  const label = `${shift.start_time} – ${shift.end_time}`;
  const role = ROLES[i % ROLES.length];
  // A double shift every fifth card, so the multi-colour shift bar is covered too.
  const shifts = [{ ...shift, label, lane, role, source_location: 'preview seed' }];
  if (i % 5 === 4) {
    const second = SHIFTS[(i + 1) % SHIFTS.length];
    shifts.push({
      ...second,
      label: `${second.start_time} – ${second.end_time}`,
      lane,
      role,
      source_location: 'preview seed',
    });
  }

  // Spread the card states so the preview shows assigned, unassigned and away
  // cards rather than a wall of identical ones.
  const unassigned = i % 7 === 6;
  const away = i % 11 === 10;

  return {
    name: `${FIRST_NAMES[i % FIRST_NAMES.length]} ${MARKER}`,
    phone: `555-01${String(i).padStart(2, '0')}`,
    shift_type: shift.shift_type,
    shift_time: label,
    shifts,
    role,
    walkie_number: unassigned ? null : `W${String(laneOrder + 1).padStart(2, '0')}`,
    car_number: unassigned ? null : `C${String(laneOrder + 1).padStart(2, '0')}`,
    status: away ? 'away' : unassigned ? 'unassigned' : 'assigned',
    away_reason: away ? AWAY_REASONS[i % AWAY_REASONS.length] : null,
    lane,
    lane_order: laneOrder,
    lane_entered_at: new Date(
      Date.now() - LANE_MINUTES_AGO[i % LANE_MINUTES_AGO.length] * 60_000
    ).toISOString(),
    notes: i % 9 === 8 ? 'Preview seed note — safe to edit.' : null,
  };
}

async function main() {
  if (process.env.VERCEL_ENV !== 'preview') {
    console.log('[seed-drivers] Not a preview deploy — skipping.');
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.log('[seed-drivers] Preview SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — skipping.');
    return;
  }
  if (process.env.PROD_SUPABASE_URL && url === process.env.PROD_SUPABASE_URL) {
    throw new Error('[seed-drivers] Refusing to seed: target URL is the prod project.');
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  const { count: existing, error: markerErr } = await db
    .from('drivers')
    .select('*', { count: 'exact', head: true })
    .like('name', `%${MARKER}`);
  if (markerErr) throw new Error(`count seeded: ${markerErr.message}`);
  if ((existing ?? 0) > 0) {
    console.log(`[seed-drivers] ${existing} seeded drivers already present — skipping (idempotent).`);
    return;
  }

  // Only drivers still on the board count towards the minimum; checked-out ones
  // are history and aren't rendered.
  const { data: onBoard, error: readErr } = await db
    .from('drivers')
    .select('lane, lane_order')
    .is('checked_out_at', null);
  if (readErr) throw new Error(`read drivers: ${readErr.message}`);

  const rows = [];
  for (const [lane, min] of Object.entries(MIN_PER_LANE)) {
    const inLane = (onBoard ?? []).filter((d) => d.lane === lane);
    const shortfall = min - inLane.length;
    if (shortfall <= 0) {
      console.log(`  · ${lane}: already has ${inLane.length} (min ${min})`);
      continue;
    }
    // Append after the last card. Derived from the highest lane_order, not the
    // count, because real data has holes wherever someone was checked out.
    let next = inLane.reduce((max, d) => Math.max(max, d.lane_order), -1) + 1;
    for (let i = 0; i < shortfall; i++) rows.push(makeDriver(lane, i, next++));
    console.log(`  ✓ ${lane}: +${shortfall} (had ${inLane.length}, min ${min})`);
  }

  if (rows.length === 0) {
    console.log('[seed-drivers] Every lane already meets its minimum — nothing to do.');
    return;
  }

  const { error: insertErr } = await db.from('drivers').insert(rows);
  if (insertErr) throw new Error(`insert drivers: ${insertErr.message}`);
  console.log(`[seed-drivers] Added ${rows.length} synthetic drivers.`);
}

main().catch((err) => {
  console.error('[seed-drivers] Failed:', err?.message ?? err);
  process.exit(1);
});
