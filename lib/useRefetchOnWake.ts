'use client';

import { useEffect, useRef } from 'react';

/**
 * Refetches the moment a device comes back to life.
 *
 * When a phone, tablet or TV sleeps, timers stop firing and websockets are torn
 * down. On wake the *old pixels are still on screen*, so the board looks live
 * while showing whatever was true before the nap — the exact trap someone walks
 * into when they glance at their phone and act on a stale lane.
 *
 * This is not a viewer-only problem: Supabase realtime doesn't replay the events
 * missed while a socket was dead, so the dispatcher board has the same hole. The
 * hook is wired into both.
 *
 * The four signals overlap on purpose, because no single one fires everywhere:
 *  - visibilitychange: tab re-shown, phone unlocked (the common case)
 *  - focus: window refocused on desktop without a visibility change
 *  - online: network came back, e.g. leaving a dead spot in the venue
 *  - pageshow with persisted: restored from the bfcache, which is how iOS Safari
 *    comes back and where no other event may fire at all
 */
export function useRefetchOnWake(refetch: () => void) {
  // Held in a ref so the listeners are bound once, not re-bound on every render
  // by a caller whose callback identity changes.
  const latest = useRef(refetch);
  useEffect(() => {
    latest.current = refetch;
  }, [refetch]);

  useEffect(() => {
    const run = () => latest.current();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') run();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) run();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', run);
    window.addEventListener('online', run);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', run);
      window.removeEventListener('online', run);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);
}
