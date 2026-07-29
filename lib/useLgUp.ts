'use client';

import { useEffect, useState } from 'react';

/** Tailwind's `lg` breakpoint — the phone/desktop cutover used across the board. */
const LG_QUERY = '(min-width: 1024px)';

/**
 * True at desktop/TV widths. Starts false so the server render and the first
 * client render agree (the mount-guard pattern ThemeToggle uses). Only wire this
 * to behaviour that can safely settle a frame late — layout itself stays in CSS
 * media queries so it is correct on the very first paint.
 */
export function useLgUp(): boolean {
  const [isLgUp, setIsLgUp] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(LG_QUERY);
    setIsLgUp(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsLgUp(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isLgUp;
}
