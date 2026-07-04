'use client';

import { useEffect, useState } from 'react';
import { TOURNAMENT_TZ } from '@/lib/date';

export default function LiveClock({ className = 'text-2xl' }: { className?: string }) {
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('en-CA', {
          timeZone: TOURNAMENT_TZ,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span
      className={`font-bold tabular-nums tracking-wider ${className}`}
      style={{ color: 'var(--brand)' }}
    >
      {time}
    </span>
  );
}
