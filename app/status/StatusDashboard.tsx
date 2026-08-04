'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react';
import { useSupabase } from '@/lib/supabase/client';
import {
  clearPin,
  getCandidateUrls,
  getPrimaryUrl,
  isPinned,
  probeRest,
  setActiveUrl,
  type HostProbeResult,
} from '@/lib/supabase/hosts';
import {
  NAMECHEAP_STATUS_PAGE,
  SUPABASE_COMPONENTS,
  SUPABASE_STATUS_PAGE,
  SUPABASE_SUMMARY_URL,
  VERCEL_STATUS_PAGE,
  VERCEL_STATUS_URL,
  fetchStatuspage,
  probeRealtime,
  type StatuspageFeed,
} from '@/lib/status/probes';
import { formatClockTime } from '@/lib/date';
import LiveClock from '@/components/board/LiveClock';
import NboLogo from '@/components/ui/NboLogo';
import ThemeToggle from '@/components/ui/ThemeToggle';

/** Connection probes are cheap and this page is only open while someone watches. */
const PROBE_INTERVAL_MS = 15_000;
/** Provider feeds are edge-cached for ~10s; a minute is plenty. */
const FEED_INTERVAL_MS = 60_000;

type HostState = { rest: HostProbeResult | null; ws: HostProbeResult | null };

/** Green when it works, red when it doesn't — no in-between for a yes/no test. */
function dotColor(result: HostProbeResult | null): string {
  if (!result) return 'var(--surface-badge-muted)';
  return result.ok ? 'var(--status-success)' : 'var(--status-error-fg)';
}

function ProbeLine({ label, result }: { label: string; result: HostProbeResult | null }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: dotColor(result) }}
      />
      <span className="text-fg-soft">{label}</span>
      <span className="ml-auto tabular-nums text-fg-muted">
        {!result ? 'Checking…' : result.ok ? `${result.ms} ms` : (result.error ?? 'failed')}
      </span>
    </div>
  );
}

/** Statuspage severity → the house status colors. */
function indicatorColor(feed: StatuspageFeed | null, failed: boolean): string {
  if (failed || !feed) return 'var(--status-warn)';
  if (feed.indicator === 'none') return 'var(--status-success)';
  if (feed.indicator === 'minor') return 'var(--status-warn)';
  return 'var(--status-error-fg)';
}

function ProviderRow({
  name,
  role,
  feed,
  failed,
  link,
}: {
  name: string;
  role: string;
  feed: StatuspageFeed | null;
  /** The feed itself was unreachable — not the same as the provider being down. */
  failed: boolean;
  link: string;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ backgroundColor: 'var(--surface-panel)', border: '1px solid var(--edge)' }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: indicatorColor(feed, failed) }}
        />
        <span className="font-bold text-fg-strong">{name}</span>
        <span className="text-[11px] text-fg-faint uppercase tracking-wider">{role}</span>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1 text-[11px] text-fg-faint hover:text-fg-soft transition-colors"
        >
          Status page <ExternalLink size={11} />
        </a>
      </div>
      <div className="text-sm text-fg-soft mt-1.5">
        {failed
          ? 'Feed unreachable from this device — check the status page directly.'
          : (feed?.description ?? 'Loading…')}
      </div>
      {feed && feed.components.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
          {feed.components.map((c) => (
            <span key={c.id} className="text-[11px] text-fg-muted">
              {c.name}:{' '}
              <span
                style={{
                  color:
                    c.status === 'operational'
                      ? 'var(--status-success-bright)'
                      : 'var(--status-warn-fg)',
                }}
              >
                {c.status.replace(/_/g, ' ')}
              </span>
            </span>
          ))}
        </div>
      )}
      {feed?.updatedAt && (
        <div className="text-[10px] text-fg-ghost mt-2">
          Provider last updated {formatClockTime(feed.updatedAt)}
        </div>
      )}
    </div>
  );
}

export default function StatusDashboard() {
  const { activeUrl } = useSupabase();
  const [candidates] = useState(() => getCandidateUrls());
  const primary = getPrimaryUrl();

  const [hosts, setHosts] = useState<Record<string, HostState>>({});
  const [checking, setChecking] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [supabaseFeed, setSupabaseFeed] = useState<StatuspageFeed | null>(null);
  const [vercelFeed, setVercelFeed] = useState<StatuspageFeed | null>(null);
  const [feedFailed, setFeedFailed] = useState({ supabase: false, vercel: false });

  const runRef = useRef<AbortController | null>(null);

  // Mount-gated: isPinned reads localStorage, which the server render can't.
  useEffect(() => setPinned(isPinned()), [activeUrl]);

  const runProbes = useCallback(async () => {
    runRef.current?.abort(); // supersede an in-flight sweep
    const controller = new AbortController();
    runRef.current = controller;
    setChecking(true);
    setHosts({});
    await Promise.all(
      candidates.map(async (url) => {
        const [rest, ws] = await Promise.all([
          probeRest(url, { signal: controller.signal }),
          probeRealtime(url, { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        setHosts((prev) => ({ ...prev, [url]: { rest, ws } }));
      })
    );
    if (!controller.signal.aborted) setChecking(false);
  }, [candidates]);

  useEffect(() => {
    void runProbes();
    const id = setInterval(() => void runProbes(), PROBE_INTERVAL_MS);
    return () => {
      clearInterval(id);
      runRef.current?.abort();
    };
  }, [runProbes]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const feed = await fetchStatuspage(SUPABASE_SUMMARY_URL, {
          signal: controller.signal,
          componentIds: SUPABASE_COMPONENTS,
        });
        setSupabaseFeed(feed);
        setFeedFailed((p) => ({ ...p, supabase: false }));
      } catch {
        setFeedFailed((p) => ({ ...p, supabase: true }));
      }
      try {
        const feed = await fetchStatuspage(VERCEL_STATUS_URL, { signal: controller.signal });
        setVercelFeed(feed);
        setFeedFailed((p) => ({ ...p, vercel: false }));
      } catch {
        setFeedFailed((p) => ({ ...p, vercel: true }));
      }
    };
    void load();
    const id = setInterval(() => void load(), FEED_INTERVAL_MS);
    return () => {
      clearInterval(id);
      controller.abort();
    };
  }, []);

  const hostName = (url: string) => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  };

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--surface-page)' }}>
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <NboLogo width={160} height={58} />
          <LiveClock className="text-2xl" />
        </div>

        <h1 className="text-2xl font-black text-fg-strong tracking-wide uppercase">
          Connection Status
        </h1>
        <p className="text-sm text-fg-muted mt-1 mb-6">
          Everything here is tested from <em>this</em> device, so it shows what this
          screen can reach — which may differ from the machine beside it.
        </p>

        {/* ── Database connections ── */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[11px] font-bold tracking-widest uppercase" style={{ color: 'var(--brand)' }}>
            Database connections
          </h2>
          <button
            type="button"
            onClick={() => void runProbes()}
            disabled={checking}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold text-fg-soft hover:text-fg-strong transition-colors disabled:opacity-50"
            style={{ border: '1px solid var(--edge)' }}
          >
            <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
            Re-check now
          </button>
        </div>

        <div className="space-y-3">
          {candidates.map((url) => {
            const state = hosts[url];
            const inUse = url === activeUrl;
            return (
              <div
                key={url}
                className="rounded-lg p-4"
                style={{
                  backgroundColor: 'var(--surface-panel)',
                  border: `1px solid ${inUse ? 'var(--brand)' : 'var(--edge)'}`,
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold text-fg-strong">
                    {url === primary ? 'Primary connection' : 'Backup connection'}
                  </span>
                  {inUse && (
                    <span
                      className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: 'var(--brand)' }}
                    >
                      In use
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-fg-faint mb-3 break-all">{hostName(url)}</div>

                <div className="space-y-1.5">
                  <ProbeLine label="Data (HTTPS)" result={state?.rest ?? null} />
                  <ProbeLine label="Live updates (websocket)" result={state?.ws ?? null} />
                </div>

                {!inUse && (
                  <button
                    type="button"
                    onClick={() => setActiveUrl(url, { pinned: true })}
                    className="mt-3 w-full h-11 rounded-lg text-xs font-black tracking-widest uppercase text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: 'var(--brand)' }}
                  >
                    Use this connection
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {candidates.length < 2 && (
          <p className="text-[11px] text-fg-ghost mt-2">
            Only one connection is configured for this deployment.
          </p>
        )}

        {pinned ? (
          <button
            type="button"
            onClick={() => {
              clearPin();
              setPinned(false);
            }}
            className="mt-3 w-full h-11 rounded-lg text-xs font-bold uppercase tracking-widest text-fg-soft hover:text-fg-strong transition-colors"
            style={{ border: '1px solid var(--edge)' }}
          >
            Back to automatic (recommended)
          </button>
        ) : (
          <p className="text-[11px] text-fg-ghost mt-3">
            The board switches connections on its own when one stops working. Only
            override that if you are testing something.
          </p>
        )}

        {/* ── Providers ── */}
        <h2
          className="text-[11px] font-bold tracking-widest uppercase mt-8 mb-2"
          style={{ color: 'var(--brand)' }}
        >
          Providers
        </h2>
        <div className="space-y-3">
          <ProviderRow
            name="Supabase"
            role="Database"
            feed={supabaseFeed}
            failed={feedFailed.supabase}
            link={SUPABASE_STATUS_PAGE}
          />
          <ProviderRow
            name="Vercel"
            role="Hosting"
            feed={vercelFeed}
            failed={feedFailed.vercel}
            link={VERCEL_STATUS_PAGE}
          />
          <div
            className="rounded-lg p-4"
            style={{ backgroundColor: 'var(--surface-panel)', border: '1px solid var(--edge)' }}
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: 'var(--surface-badge-muted)' }}
              />
              <span className="font-bold text-fg-strong">Namecheap</span>
              <span className="text-[11px] text-fg-faint uppercase tracking-wider">DNS</span>
              <a
                href={NAMECHEAP_STATUS_PAGE}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1 text-[11px] text-fg-faint hover:text-fg-soft transition-colors"
              >
                Status page <ExternalLink size={11} />
              </a>
            </div>
            <div className="text-sm text-fg-soft mt-1.5">
              No live feed available — check manually if names stop resolving.
            </div>
          </div>
        </div>

        <div className="mt-8">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-fg-muted hover:text-fg-strong transition-colors"
          >
            <ArrowLeft size={14} /> Back to board
          </Link>
        </div>
      </div>
    </div>
  );
}
