'use client';

import { useEffect, useState } from 'react';
import { TOURNAMENT_TZ } from '@/lib/date';

export default function LiveClock() {
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
      className="text-2xl font-bold tabular-nums tracking-wider"
      style={{ color: '#E41C23' }}
    >
      {time}
    </span>
  );
}
