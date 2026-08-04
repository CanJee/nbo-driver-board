/**
 * Which database host this device talks to, and how it recovers when that host
 * stops working *for this device*.
 *
 * The Supabase project answers on more than one hostname (the custom domain and
 * the original `*.supabase.co` one) — same project, same data, same JWTs. That
 * redundancy exists because venue security stacks have blocked one hostname
 * outright, mid-tournament, on some machines and not others: a filter verdict
 * lands per device, so the recovery has to be per device too. Nothing here is
 * shared state; each browser picks its own host and remembers it.
 *
 * Not a 'use client' module: the server files import AUTH_COOKIE_NAME. Every
 * browser API is guarded the way lib/board-prefs.ts guards localStorage.
 */

/**
 * The auth cookie's name, pinned rather than derived.
 *
 * supabase-js names it after the host (`sb-<first-label>-auth-token`), so the
 * two hostnames would otherwise disagree about where the session lives and
 * switching hosts would silently log everyone out. Pinning it to the name
 * production already uses (api.tennistransport.com → `sb-api-auth-token`) keeps
 * existing sessions valid across the deploy that introduces this.
 *
 * All three creators must pass it: the browser client, lib/supabase/server.ts
 * and proxy.ts. Changing this value signs every device out, once.
 */
export const AUTH_COOKIE_NAME = 'sb-api-auth-token';

/** Board-prefs naming convention; bump the suffix if the shape ever changes. */
const HOST_PREF_KEY = 'nbo-board.dbHost.v1';

/** A probe is a health check, not a page load — fail fast and try elsewhere. */
const PROBE_TIMEOUT_MS = 4_000;
/** Floor between probe sweeps, so a flapping host can't spam the network. */
const PROBE_COOLDOWN_MS = 15_000;
/** Two REST failures inside this window mean the host, not one bad request. */
const REST_FAILURE_WINDOW_MS = 30_000;
const REST_FAILURES_BEFORE_PROBE = 2;
/** How often a device on the backup re-tests the primary. */
const FAILBACK_INTERVAL_MS = 60_000;
/** Consecutive primary successes before failing back — one is noise. */
const FAILBACK_CONSECUTIVE_OK = 2;

/**
 * How long realtime may be down before we suspect the host rather than the
 * connection. Twice SyncStatus's DOWN_GRACE_MS, so the "Not live" banner always
 * appears before a swap: a dispatcher sees the explanation, then the recovery.
 */
export const REALTIME_FAILOVER_MS = 20_000;

/** Retry cadence while realtime stays down (findHealthyHost self-throttles). */
export const FAILOVER_RETRY_MS = 15_000;

export interface HostProbeResult {
  ok: boolean;
  /** Round-trip in ms, or null when the probe never completed. */
  ms: number | null;
  error: string | null;
}

const trimUrl = (u: string) => u.trim().replace(/\/+$/, '');

/**
 * Every host this build may talk to, primary first.
 *
 * NEXT_PUBLIC_* are inlined at build time, so this is a compile-time constant
 * list — and preview builds blank the fallback var (scripts/vercel-build.sh) so
 * a preview can never fail over into production data.
 */
export function getCandidateUrls(): string[] {
  const primary = trimUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  const extra = (process.env.NEXT_PUBLIC_SUPABASE_FALLBACK_URLS ?? '')
    .split(',')
    .map(trimUrl)
    .filter(Boolean);
  return [...new Set([primary, ...extra].filter(Boolean))];
}

export function getPrimaryUrl(): string {
  return getCandidateUrls()[0] ?? '';
}

interface HostPref {
  v: 1;
  url: string;
  /** A human chose this host on /status; don't auto-fail-back away from it. */
  pinned: boolean;
}

function readPref(): HostPref | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(HOST_PREF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HostPref;
    // A stored host that is no longer a candidate (env changed, or this is a
    // preview build) must not strand the device on a host it can't use.
    if (parsed?.v !== 1 || !getCandidateUrls().includes(parsed.url)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** The host in use on this device. Always the primary during SSR. */
export function getActiveUrl(): string {
  return readPref()?.url ?? getPrimaryUrl();
}

export function isPinned(): boolean {
  return readPref()?.pinned ?? false;
}

// ── Change notification ───────────────────────────────────────────────────────
// Subscribers are React (useSyncExternalStore) and the client-cache lifecycle.

const listeners = new Set<() => void>();
let storageBound = false;

function notify() {
  for (const l of listeners) l();
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  // Another tab (usually /status) overriding the host should flip this tab too,
  // rather than leaving two tabs of the same board on different connections.
  if (!storageBound && typeof window !== 'undefined') {
    storageBound = true;
    window.addEventListener('storage', (e) => {
      if (e.key === HOST_PREF_KEY) {
        ensureFailbackWatch();
        notify();
      }
    });
  }
  return () => {
    listeners.delete(cb);
  };
}

export function setActiveUrl(url: string, opts: { pinned?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  if (!getCandidateUrls().includes(url)) return; // never persist an unknown host
  const pref: HostPref = { v: 1, url, pinned: opts.pinned ?? false };
  try {
    window.localStorage.setItem(HOST_PREF_KEY, JSON.stringify(pref));
  } catch {
    /* private mode / quota — the switch still applies for this page's lifetime */
  }
  ensureFailbackWatch();
  notify();
}

/** Drop a manual override and immediately re-evaluate (usually back to primary). */
export function clearPin(): void {
  const current = getActiveUrl();
  setActiveUrl(current, { pinned: false });
  void findHealthyHost('manual-auto', { force: true });
}

// ── Probing ───────────────────────────────────────────────────────────────────

/**
 * Is this host reachable from here?
 *
 * /auth/v1/health with the anon key: the key is public (it ships in every
 * bundle), the endpoint is CORS-open, and a 200 proves DNS, TLS, the gateway
 * and auth all answer — which is exactly what a blocked hostname fails.
 *
 * AbortController rather than AbortSignal.timeout: venue TVs run old WebKit.
 */
export async function probeRest(
  url: string,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<HostProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? PROBE_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onOuterAbort);
  const started = Date.now();
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' },
      cache: 'no-store',
      signal: controller.signal,
    });
    return {
      ok: res.ok,
      ms: Date.now() - started,
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      ok: false,
      ms: null,
      error: controller.signal.aborted ? 'timed out' : e instanceof Error ? e.message : 'blocked',
    };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onOuterAbort);
  }
}

// ── Failure accounting ────────────────────────────────────────────────────────

let restFailures: number[] = [];

/**
 * Called by the board's fetchers when a read fails at the network layer
 * (postgrest resolves those as status 0 rather than throwing). One failure is
 * a blip; two inside the window is a host worth re-checking.
 */
export function noteRestFailure(): void {
  if (typeof window === 'undefined') return;
  // A device that is simply offline would only churn hosts pointlessly.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const now = Date.now();
  restFailures = [...restFailures, now].filter((t) => now - t < REST_FAILURE_WINDOW_MS);
  if (restFailures.length >= REST_FAILURES_BEFORE_PROBE) {
    restFailures = [];
    void findHealthyHost('rest-failed');
  }
}

// ── The failover decision ─────────────────────────────────────────────────────

let lastProbeAt = 0;
let inFlight: Promise<string | null> | null = null;

/**
 * Find a host this device can actually reach, switching to it if the current
 * one is dead.
 *
 * Deliberately keyed on REST reachability alone. When Supabase's realtime
 * *service* has an incident, every hostname is equally affected and swapping
 * would just add churn — so a healthy active host means "stay put" even while
 * the board shows Not Live. The rarer case (a filter that blocks websockets but
 * allows HTTPS) is a judgement call, and /status offers a manual override for
 * it rather than guessing here.
 */
export function findHealthyHost(
  reason: string,
  opts: { force?: boolean } = {}
): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(null);
  if (inFlight) return inFlight; // coalesce concurrent triggers
  if (!opts.force && Date.now() - lastProbeAt < PROBE_COOLDOWN_MS) return Promise.resolve(null);

  lastProbeAt = Date.now();
  inFlight = (async () => {
    try {
      const candidates = getCandidateUrls();
      const active = getActiveUrl();

      const activeResult = await probeRest(active);
      if (activeResult.ok) return active;

      const others = candidates.filter((u) => u !== active);
      if (others.length === 0) return null;

      const results = await Promise.all(others.map((u) => probeRest(u)));
      // Candidate order, so a recovering primary is preferred over any backup.
      const healthy = others.find((_, i) => results[i].ok);
      if (!healthy) return null; // everything is down: stay, don't thrash

      // A pinned host that has gone hard down loses its pin — staying reachable
      // matters more than honouring a choice made when it was working.
      console.info(`[db-host] switching to ${healthy} (${reason})`);
      setActiveUrl(healthy, { pinned: false });
      return healthy;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

// ── Fail-back ─────────────────────────────────────────────────────────────────

let failbackTimer: ReturnType<typeof setInterval> | null = null;
let failbackOks = 0;

/**
 * While this device is on a backup host, keep testing the primary and return to
 * it once it looks solid — otherwise a device that failed over during a blip
 * would sit on the backup for the rest of the tournament.
 *
 * A pinned (human-chosen) host is left alone.
 */
function ensureFailbackWatch(): void {
  if (typeof window === 'undefined') return;
  const onBackup = getActiveUrl() !== getPrimaryUrl();
  const shouldWatch = onBackup && !isPinned();

  if (!shouldWatch) {
    if (failbackTimer) clearInterval(failbackTimer);
    failbackTimer = null;
    failbackOks = 0;
    return;
  }
  if (failbackTimer) return;

  failbackOks = 0;
  failbackTimer = setInterval(async () => {
    if (getActiveUrl() === getPrimaryUrl() || isPinned()) {
      ensureFailbackWatch(); // conditions changed under us — re-evaluate
      return;
    }
    const result = await probeRest(getPrimaryUrl());
    failbackOks = result.ok ? failbackOks + 1 : 0;
    if (failbackOks >= FAILBACK_CONSECUTIVE_OK) {
      console.info('[db-host] primary healthy again, failing back');
      setActiveUrl(getPrimaryUrl(), { pinned: false });
    }
  }, FAILBACK_INTERVAL_MS);
}

// A device that reloads while on a backup still needs the watcher running.
if (typeof window !== 'undefined') ensureFailbackWatch();
