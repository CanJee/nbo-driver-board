'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatClockTime } from '@/lib/date';

/**
 * How long the realtime connection may be down before the board admits it.
 * Supabase's client reconnects dropped channels itself within a few seconds,
 * so a shorter grace would cry wolf on every wifi blip; longer than this and
 * a dispatcher can act on a board that quietly stopped updating.
 */
export const DOWN_GRACE_MS = 10_000;

/** Ticks the staleness check without re-rendering the whole board every second. */
const TICK_MS = 1_000;

/**
 * `downSince` is when the realtime channels stopped being healthy (null while
 * they are fine). Staleness is connection health, not data age: this board is
 * event-driven, so a quiet half hour with a live socket is still live.
 */
export function useSyncAge(downSince: number | null): { stale: boolean; mounted: boolean } {
  // Elapsed time depends on the client clock, so there is no correct value to
  // render on the server; staying null until mounted keeps the first client
  // render identical to the server's (same guard LiveClock uses).
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const id = setInterval(update, TICK_MS);
    return () => clearInterval(id);
  }, []);

  if (now === null) return { stale: false, mounted: false };
  return { stale: downSince !== null && now - downSince > DOWN_GRACE_MS, mounted: true };
}

/**
 * The header pill: green LIVE while the realtime connection is healthy, amber
 * NOT LIVE once it has been down past the grace period. The label only fits
 * the roomiest headers; the dot alone still reads at a glance below 2xl.
 */
export default function SyncStatus({
  downSince,
  backup = false,
}: {
  downSince: number | null;
  /** True while this device is talking to the backup database host. */
  backup?: boolean;
}) {
  const { stale, mounted } = useSyncAge(downSince);
  if (!mounted) return null;

  return (
    <>
      <span
        title={stale ? 'Live updates are down; reconnecting' : 'Live updates connected'}
        className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] lg:text-xs font-bold uppercase tracking-widest whitespace-nowrap"
        style={
          stale
            ? { backgroundColor: 'var(--status-warn-strong-bg)', color: 'var(--status-warn-fg)' }
            : { backgroundColor: 'var(--status-success-strong-bg)', color: 'var(--status-success-bright)' }
        }
      >
        <span
          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: stale ? 'var(--status-warn)' : 'var(--status-success)' }}
        />
        <span className="hidden 2xl:inline">{stale ? 'Not Live' : 'Live'}</span>
      </span>
      {/* Neutral, not a warning: the board is working normally, just over the
          other database hostname. It matters only when someone is diagnosing
          why one device behaves differently from the one beside it. */}
      {backup && (
        <span
          title="Using the backup database connection — see the Status page"
          className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] lg:text-xs font-bold uppercase tracking-widest whitespace-nowrap"
          style={{ backgroundColor: 'var(--surface-badge-muted)', color: '#fff' }}
        >
          <span className="inline-block w-2 h-2 rounded-full flex-shrink-0 bg-white/70" />
          <span className="hidden 2xl:inline">Backup DB</span>
        </span>
      )}
    </>
  );
}

/**
 * The full-width warning under the header. Deliberately loud and wordy where
 * the pill is terse: someone glancing at a screen across a room has to be able
 * to tell that what they are looking at is not current, without hunting for a
 * small dot — and a dispatcher must know their next move may not save.
 */
export function StaleBanner({ downSince }: { downSince: number | null }) {
  const { stale, mounted } = useSyncAge(downSince);
  if (!mounted || !stale) return null;

  return (
    <div
      role="status"
      className="flex-shrink-0 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs lg:text-base font-bold text-center"
      style={{
        backgroundColor: 'var(--status-warn-strong-bg)',
        color: 'var(--status-warn-fg)',
        border: '1px solid var(--status-warn)',
      }}
    >
      <AlertTriangle size={16} className="flex-shrink-0" aria-hidden />
      <span>
        Not live: updates from other screens stopped
        {downSince ? ` at ${formatClockTime(new Date(downSince).toISOString())}` : ''}.
        Changes made now may not save. Reconnecting...
      </span>
    </div>
  );
}
