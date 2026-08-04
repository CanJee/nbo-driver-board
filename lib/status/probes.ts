'use client';

import type { HostProbeResult } from '@/lib/supabase/hosts';

/**
 * Probes and provider feeds for the /status page.
 *
 * Everything here runs in the *viewer's* browser on purpose. The question this
 * page answers is "what can THIS device reach", which a server-side check can
 * never answer: a venue filter that blocks a hostname does so for the laptop at
 * the front desk, not for Vercel's edge.
 */

/** Statuspage's severity vocabulary, shared by Supabase and Vercel. */
export type FeedIndicator = 'none' | 'minor' | 'major' | 'critical';

export interface FeedComponent {
  id: string;
  name: string;
  status: string;
}

export interface StatuspageFeed {
  indicator: FeedIndicator;
  description: string;
  /** When the provider last touched the page — a frozen feed is worth seeing. */
  updatedAt: string | null;
  components: FeedComponent[];
}

export const SUPABASE_SUMMARY_URL = 'https://status.supabase.com/api/v2/summary.json';
export const SUPABASE_STATUS_PAGE = 'https://status.supabase.com';
export const VERCEL_STATUS_URL = 'https://www.vercel-status.com/api/v2/status.json';
export const VERCEL_STATUS_PAGE = 'https://www.vercel-status.com';

/**
 * Namecheap publishes no machine-readable status: status.namecheap.com does not
 * resolve, and their real page is HTML with no CORS. (`nc.statuspage.io` looks
 * like a feed and is NOT theirs — it has been stale since April — so wiring it
 * in would show a permanently green light for something we aren't watching.)
 * A link is the honest option.
 */
export const NAMECHEAP_STATUS_PAGE = 'https://www.namecheap.com/status-updates/';

/** The Supabase components this board actually depends on, by Statuspage id. */
export const SUPABASE_COMPONENTS: Record<string, string> = {
  fznyj00kpng2: 'Auth',
  l3gnd4rfxc2y: 'Realtime',
  yz6pcnlscwpb: 'Database',
  '43453sylqk7v': 'API Gateway',
};

const FEED_TIMEOUT_MS = 8_000;

/** Fetch an Atlassian Statuspage v2 feed (both providers use the same shape). */
export async function fetchStatuspage(
  url: string,
  opts: { signal?: AbortSignal; componentIds?: Record<string, string> } = {}
): Promise<StatuspageFeed> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onOuterAbort);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as {
      page?: { updated_at?: string };
      status?: { indicator?: string; description?: string };
      components?: { id: string; name: string; status: string }[];
    };
    const wanted = opts.componentIds;
    return {
      indicator: (json.status?.indicator as FeedIndicator) ?? 'none',
      description: json.status?.description ?? 'Unknown',
      updatedAt: json.page?.updated_at ?? null,
      components: wanted
        ? (json.components ?? [])
            .filter((c) => c.id in wanted)
            .map((c) => ({ id: c.id, name: wanted[c.id] ?? c.name, status: c.status }))
        : [],
    };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onOuterAbort);
  }
}

const WS_TIMEOUT_MS = 5_000;

/**
 * Can this device open the realtime websocket to a host?
 *
 * Worth probing separately from REST: filters and proxies routinely pass HTTPS
 * while silently dropping websocket upgrades, which is exactly the failure that
 * leaves a board looking fine but never updating. Reaching `open` is the whole
 * test — no channel is joined, and the socket is closed immediately.
 */
export function probeRealtime(
  url: string,
  opts: { signal?: AbortSignal } = {}
): Promise<HostProbeResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    let ws: WebSocket | null = null;

    const finish = (result: HostProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      try {
        ws?.close();
      } catch {
        /* already closing */
      }
      resolve(result);
    };

    const timer = setTimeout(() => finish({ ok: false, ms: null, error: 'timed out' }), WS_TIMEOUT_MS);
    const onAbort = () => finish({ ok: false, ms: null, error: 'cancelled' });
    opts.signal?.addEventListener('abort', onAbort);

    try {
      const wsUrl =
        url.replace(/^http/, 'ws') +
        `/realtime/v1/websocket?apikey=${encodeURIComponent(
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
        )}&vsn=1.0.0`;
      ws = new WebSocket(wsUrl);
      ws.onopen = () => finish({ ok: true, ms: Date.now() - started, error: null });
      // The browser withholds the reason a websocket failed (by design), so
      // "blocked" is the most honest label we can put on it.
      ws.onerror = () => finish({ ok: false, ms: null, error: 'blocked' });
      ws.onclose = () => finish({ ok: false, ms: null, error: 'closed before connecting' });
    } catch (e) {
      finish({ ok: false, ms: null, error: e instanceof Error ? e.message : 'failed' });
    }
  });
}
