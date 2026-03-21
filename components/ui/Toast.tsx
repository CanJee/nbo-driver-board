'use client';

import { useEffect, useState } from 'react';
import { CheckCircle } from 'lucide-react';

interface ToastProps {
  message: string;
  onDone: () => void;
}

export default function Toast({ message, onDone }: ToastProps) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const exitTimer = setTimeout(() => setExiting(true), 3500);
    const doneTimer = setTimeout(() => onDone(), 4000);
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div
      className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl text-white text-sm font-semibold ${
        exiting ? 'toast-exit' : 'toast-enter'
      }`}
      style={{ backgroundColor: '#16A34A', minWidth: '260px' }}
    >
      <CheckCircle size={16} className="flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}
