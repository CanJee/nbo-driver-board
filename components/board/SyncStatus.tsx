'use client';

import { useEffect, useState } from 'react';
import { formatClockTime } from '@/lib/date';

/**
 * Three missed polls. Long enough that one slow response or a brief network
 * blip doesn't cry wolf, short enough that nobody acts on a minute-old board.
 */
export const STALE_AFTER_MS = 45_000;

/** Ticks the age display without re-rendering the whole board every second. */
const TICK_MS = 1_000;

export function useSyncAge(lastSyncAt: number | null): { stale: boolean; mounted: boolean } {
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
  return { stale: lastSyncAt === null || now - lastSyncAt > STALE_AFTER_MS, mounted: true };
}

/** The header pill: green LIVE while data is fresh, amber NOT LIVE once it isn't. */
export default function SyncStatus({ lastSyncAt }: { lastSyncAt: number | null }) {
  const { stale, mounted } = useSyncAge(lastSyncAt);
  if (!mounted) return null;

  return (
    <span
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
      {stale ? 'Not Live' : 'Live'}
    </span>
  );
}

/**
 * The full-width warning under the header. Deliberately loud and wordy where the
 * pill is terse: someone glancing at a TV across a room has to be able to tell
 * that what they are looking at is not current, without hunting for a small dot.
 */
export function StaleBanner({ lastSyncAt }: { lastSyncAt: number | null }) {
  const { stale, mounted } = useSyncAge(lastSyncAt);
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
      <span aria-hidden>⚠</span>
      <span>
        Not live.{' '}
        {lastSyncAt
          ? `Last updated ${formatClockTime(new Date(lastSyncAt).toISOString())}.`
          : 'No data loaded yet.'}{' '}
        Retrying...
      </span>
    </div>
  );
}
