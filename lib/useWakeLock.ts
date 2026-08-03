'use client';

import { useEffect } from 'react';

/**
 * Keeps the screen awake while the board is showing.
 *
 * A board that never sleeps can't be read stale after a nap — this is the
 * prevention half of the wake problem, with useRefetchOnWake as the cure for the
 * cases it can't cover (locked phone, a TV whose own sleep timer wins).
 *
 * The lock is dropped by the browser whenever the page is hidden and cannot be
 * re-taken from a background tab, so it is re-requested on every return to
 * visible. Unsupported everywhere it isn't implemented (iOS Safari has it from
 * 16.4), so every call is guarded and failure is silent by design.
 */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
      } catch {
        /* denied, low battery, or unsupported — the board still works */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') request();
    };

    request();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}
