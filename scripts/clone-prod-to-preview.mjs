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

// FK-safe insert order: drivers.roster_id references roster(id), so roster first.
const TABLES = ['roster', 'dispatcher_assignments', 'drivers'];
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

  // Idempotency: if the preview DB already holds data, don't clobber it on redeploys.
  for (const table of ['roster', 'drivers']) {
    const { count, error } = await target.from(table).select('*', { count: 'exact', head: true });
    if (error) throw new Error(`count ${table}: ${error.message}`);
    if ((count ?? 0) > 0) {
      console.log(`[clone-prod] Preview "${table}" already has ${count} rows — skipping (idempotent).`);
      return;
    }
  }

  // Clear any migration-seeded rows (e.g. default dispatcher slots) so the
  // preview is an exact mirror of prod. Reverse order respects the FK.
  for (const table of [...TABLES].reverse()) {
    const { error } = await target.from(table).delete().not('id', 'is', null);
    if (error) throw new Error(`clear ${table}: ${error.message}`);
  }

  for (const table of TABLES) {
    const rows = await readAll(source, table);
    if (rows.length === 0) {
      console.log(`  · ${table}: 0 rows`);
      continue;
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
