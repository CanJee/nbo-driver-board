/**
 * Clones prod data into the current Vercel PREVIEW branch database.
 *
 * Runs during preview builds (VERCEL_ENV === "preview"), after Supabase Branching
 * has created + migrated the branch DB. Idempotent: skips if the preview DB is
 * already populated. Refuses to run if source and target are the same project.
 *
 * Source: PROD_SUPABASE_URL + PROD_SUPABASE_SERVICE_ROLE_KEY  (set in Vercel, Preview scope)
 * Target: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY            (injected by the Supabase–Vercel integration)
 *
 * Service-role keys are required so the copy bypasses RLS.
 */
import { createClient } from '@supabase/supabase-js';

// FK-safe insert order: drivers.lane references lanes(id) and drivers.roster_id
// references roster(id), so lanes and roster come before drivers.
const TABLES = ['lanes', 'roster', 'dispatcher_assignments', 'drivers'];
const PAGE = 1000;

async function readAll(client, table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client.from(table).select('*').range(from, from + PAGE - 1);
    if (error) throw new Error(`read ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function main() {
  if (process.env.VERCEL_ENV !== 'preview') {
    console.log('[clone-prod] Not a preview deploy — skipping.');
    return;
  }

  const prodUrl = process.env.PROD_SUPABASE_URL;
  const prodKey = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY;
  const targetUrl = process.env.SUPABASE_URL;
  const targetKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!prodUrl || !prodKey) {
    console.log('[clone-prod] PROD_SUPABASE_URL / PROD_SUPABASE_SERVICE_ROLE_KEY not set — skipping.');
    return;
  }
  if (!targetUrl || !targetKey) {
    throw new Error('[clone-prod] Preview SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — is the Supabase integration connected?');
  }
  if (prodUrl === targetUrl) {
    throw new Error('[clone-prod] Refusing to clone: source and target URLs are identical (would target prod).');
  }

  const source = createClient(prodUrl, prodKey, { auth: { persistSession: false } });
  const target = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

  console.log(`[clone-prod] Source ${prodUrl}  →  Target ${targetUrl}`);

  // Idempotency: if the preview DB already holds data, don't clobber it on
  // redeploys. Exception: an empty lanes table means an earlier failed build
  // cleared it mid-clone (migrations only seed lanes at branch creation), so
  // whatever else is present is a half-finished clone — redo it in full.
  const { count: laneCount, error: laneCountErr } = await target
    .from('lanes')
    .select('*', { count: 'exact', head: true });
  const lanesWrecked = !laneCountErr && (laneCount ?? 0) === 0;
  if (lanesWrecked) {
    console.log('[clone-prod] Preview "lanes" is empty — treating the DB as half-cloned and re-cloning.');
  } else {
    for (const table of ['roster', 'drivers']) {
      const { count, error } = await target.from(table).select('*', { count: 'exact', head: true });
      if (error) throw new Error(`count ${table}: ${error.message}`);
      if ((count ?? 0) > 0) {
        console.log(`[clone-prod] Preview "${table}" already has ${count} rows — skipping (idempotent).`);
        return;
      }
    }
  }

  // Prod may not have the lanes table yet — its migration is pasted into the
  // prod SQL editor by hand (see PREVIEW.md), which can land after this branch
  // exists. Probe first: when it's missing, keep the preview's migration-seeded
  // lanes instead of clearing them, which also keeps the drivers.lane FK
  // satisfied — a pre-migration prod only holds the six seeded slugs.
  let tables = TABLES;
  {
    // A real GET, not a HEAD probe: PostgREST reports a missing table in the
    // response BODY, so a bodyless HEAD comes back with no error attached and
    // the probe would pass right up until the actual read throws.
    const { error } = await source.from('lanes').select('id').limit(1);
    if (error) {
      console.log(`[clone-prod] Prod has no "lanes" table yet (${error.message}) — keeping the migration-seeded lanes.`);
      tables = TABLES.filter((t) => t !== 'lanes');
    }
  }

  // When lanes aren't cloned they must still exist in the target, or inserting
  // drivers trips drivers_lane_fkey. Normally the migration's seed covers this,
  // but migrations only run at branch creation — a failed earlier build can
  // leave the table cleared. Re-seed the defaults (mirrors the migration).
  if (!tables.includes('lanes')) {
    const { count, error } = await target.from('lanes').select('*', { count: 'exact', head: true });
    if (!error && (count ?? 0) === 0) {
      const { error: seedErr } = await target.from('lanes').insert([
        { id: 'tennis_centre',  label: 'Tennis Centre',  sort_order: 0, active: true },
        { id: 'uptown_hotel',   label: 'Uptown Hotel',   sort_order: 1, active: true },
        { id: 'airport',        label: 'Airport',        sort_order: 2, active: true },
        { id: 'other',          label: 'Other',          sort_order: 3, active: true },
        { id: 'meals',          label: 'Meals',          sort_order: 4, active: true },
        { id: 'downtown_hotel', label: 'Downtown Hotel', sort_order: 5, active: false },
      ]);
      if (seedErr) throw new Error(`seed lanes: ${seedErr.message}`);
      console.log('[clone-prod] Re-seeded default lanes (target had none).');
    }
  }

  // Clear any migration-seeded rows (e.g. default dispatcher slots) so the
  // preview is an exact mirror of prod. Reverse order respects the FKs.
  for (const table of [...tables].reverse()) {
    const { error } = await target.from(table).delete().not('id', 'is', null);
    if (error) throw new Error(`clear ${table}: ${error.message}`);
  }

  for (const table of tables) {
    const rows = await readAll(source, table);
    if (rows.length === 0) {
      console.log(`  · ${table}: 0 rows`);
      continue;
    }
    // The preview DB is on the current schema, but prod may still hold legacy data
    // from before a migration reached it. Normalize known-incompatible values so a
    // not-yet-migrated prod can still seed the preview (mirrors the migrations).
    for (const row of rows) {
      if (row.shift_type === 'nightowl') row.shift_type = 'evening';
    }
    for (let i = 0; i < rows.length; i += PAGE) {
      const { error } = await target.from(table).insert(rows.slice(i, i + PAGE));
      if (error) throw new Error(`insert ${table}: ${error.message}`);
    }
    console.log(`  ✓ ${table}: ${rows.length} rows`);
  }

  console.log('[clone-prod] Done.');
}

main().catch((err) => {
  console.error('[clone-prod] Failed:', err?.message ?? err);
  process.exit(1);
});
