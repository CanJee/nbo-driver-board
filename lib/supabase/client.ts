'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useMemo, useSyncExternalStore } from 'react';
import { AUTH_COOKIE_NAME, getActiveUrl, getPrimaryUrl, subscribe } from './hosts';

/**
 * The browser's Supabase client — one per host, because a client's REST and
 * websocket endpoints are both derived from its base URL at construction and
 * cannot be repointed afterwards. Failing over to the other hostname therefore
 * means building a second client and moving the board's subscriptions onto it
 * (see lib/supabase/hosts.ts for when and why that happens).
 *
 * Cached per URL rather than rebuilt: a client owns a websocket and an auth
 * refresh loop, and the demoted one is kept ready for the fail-back.
 */
const clients = new Map<string, SupabaseClient>();

function build(url: string): SupabaseClient {
  return createBrowserClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    // @supabase/ssr otherwise hands every caller one module-level singleton,
    // which would pin the whole app to whichever host happened to be first.
    isSingleton: false,
    // Both hosts must read and write the same session cookie — see the constant.
    cookieOptions: { name: AUTH_COOKIE_NAME },
  });
}

/**
 * Unchanged signature: modals and the import page call this per render and get
 * whichever host is currently active.
 */
export function createClient(): SupabaseClient {
  const url = getActiveUrl();
  // On the server there is no host preference and no reuse across requests.
  if (typeof window === 'undefined') return build(url);
  let client = clients.get(url);
  if (!client) {
    client = build(url);
    clients.set(url, client);
  }
  return client;
}

/**
 * Keeps exactly one client "live" when the active host changes: the newcomer
 * refreshes tokens, the loser stops refreshing and drops its channels.
 *
 * Board's effects are what actually re-subscribe (their cleanup removes the old
 * channels using the old client, captured in the closure) — this is the safety
 * net for any client the component tree isn't watching, and it stops two auth
 * clients racing each other to refresh the one shared cookie.
 */
function applyActiveClient() {
  const active = getActiveUrl();
  for (const [url, client] of clients) {
    if (url === active) {
      client.auth.startAutoRefresh();
    } else {
      void client.removeAllChannels();
      client.auth.stopAutoRefresh();
    }
  }
}

if (typeof window !== 'undefined') subscribe(applyActiveClient);

/**
 * The client, plus which host it belongs to. `activeUrl` doubles as the
 * generation key: put it (or the client) in a dependency array and the effect
 * re-runs on failover.
 */
export function useSupabase(): {
  supabase: SupabaseClient;
  activeUrl: string;
  isPrimary: boolean;
} {
  // Server snapshot is the primary, so the first client render matches the
  // server's even on a device that has failed over (React reconciles right
  // after mount).
  const activeUrl = useSyncExternalStore(subscribe, getActiveUrl, getPrimaryUrl);
  const supabase = useMemo(() => createClient(), [activeUrl]);
  return { supabase, activeUrl, isPrimary: activeUrl === getPrimaryUrl() };
}
