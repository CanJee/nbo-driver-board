/**
 * Seeds the shared dispatcher login into the Vercel PREVIEW branch database.
 *
 * Supabase auth users live in the `auth` schema, which the Data-API clone
 * (clone-prod-to-preview.mjs) cannot touch — so a fresh preview DB has no users
 * and nobody could log in. This recreates the dispatcher account via the Admin API.
 *
 * Passwords can't be copied from prod (the Admin API never exposes password hashes),
 * so preview uses its own PREVIEW_DISPATCHER_PASSWORD. Idempotent: if the user
 * already exists, its password is reset to the preview password.
 *
 * Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (injected on preview),
 *      DISPATCHER_EMAIL (same var the app logs in with),
 *      PREVIEW_DISPATCHER_PASSWORD (set in Vercel, Preview scope).
 */
import { createClient } from '@supabase/supabase-js';

async function main() {
  if (process.env.VERCEL_ENV !== 'preview') {
    console.log('[seed-user] Not a preview deploy — skipping.');
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  const email = process.env.DISPATCHER_EMAIL ?? 'dispatcher@nbotennis.com';
  const password = process.env.PREVIEW_DISPATCHER_PASSWORD;

  if (!url || !key) {
    throw new Error('[seed-user] Preview SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing.');
  }
  if (!password) {
    console.log('[seed-user] PREVIEW_DISPATCHER_PASSWORD not set — skipping (no preview login will exist).');
    return;
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listErr) throw new Error(`[seed-user] listUsers: ${listErr.message}`);

  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password });
    if (error) throw new Error(`[seed-user] updateUser: ${error.message}`);
    console.log(`[seed-user] Dispatcher "${email}" already exists — reset to preview password.`);
    return;
  }

  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`[seed-user] createUser: ${error.message}`);
  console.log(`[seed-user] Created dispatcher "${email}" with the preview password.`);
}

main().catch((err) => {
  console.error('[seed-user] Failed:', err?.message ?? err);
  process.exit(1);
});
