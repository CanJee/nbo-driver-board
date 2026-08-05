'use client';

import { useEffect, useState } from 'react';

/**
 * Wall-clock now in milliseconds, refreshed every `tickMs`.
 *
 * Null until mounted: elapsed time depends on the client's clock, so there is no
 * correct value to render on the server, and staying null keeps the first client
 * render identical to the server's (the mount-guard pattern useLgUp and
 * ThemeToggle use). Callers render nothing while it is null.
 *
 * One interval per calling component, so mount this on cards rather than lanes —
 * the driver card's timers only exist while a card is expanded.
 */
export function useNow(tickMs: number): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const id = setInterval(update, tickMs);
    return () => clearInterval(id);
  }, [tickMs]);

  return now;
}
