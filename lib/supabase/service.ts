import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * SERVER ONLY. Bypasses Row-Level Security.
 *
 * Never import this from a client component, and never expose the key under a
 * NEXT_PUBLIC_* name — anything NEXT_PUBLIC_ is inlined into the browser bundle.
 *
 * It exists because viewer mode has no Supabase session: RLS grants access to
 * `authenticated` only (see supabase/migrations/*_location_status_rls.sql), so a
 * viewer's anon-key client can read nothing. Opening anon SELECT instead would
 * hand driver rows to anyone who lifted the anon key out of the page, so viewer
 * reads go through our own cookie-gated route handler using this client.
 *
 * Env is read inside the function, not at module scope, so a build on a machine
 * with no service key still compiles.
 */
export function createServiceClient() {
  // SUPABASE_URL is what the Supabase-Vercel integration injects on preview
  // deploys (the per-branch DB); production has only NEXT_PUBLIC_SUPABASE_URL.
  // Taking the branch DB first is what keeps preview viewers off prod data.
  // Deliberately NOT PROD_SUPABASE_*: those are the preview clone's *source*.
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Viewer mode needs SUPABASE_SERVICE_ROLE_KEY (and a Supabase URL) on the server.'
    );
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
