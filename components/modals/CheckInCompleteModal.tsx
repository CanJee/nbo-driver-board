'use client';

import { useEffect, useRef } from 'react';
import { CheckCircle } from 'lucide-react';
import { DriverShift, LaneId, LANE_LABELS, SHIFT_COLORS, SHIFT_LABELS } from '@/lib/types';

interface CheckInCompleteModalProps {
  name: string;
  shifts: DriverShift[];
  lane: LaneId;
  onDone: () => void;
}

const AUTO_CLOSE_MS = 5000;

export default function CheckInCompleteModal({
  name,
  shifts,
  lane,
  onDone,
}: CheckInCompleteModalProps) {
  // Auto-close after 5 seconds. Read onDone via a ref so the timer is armed once
  // on mount — the parent passes a fresh inline arrow each render (Board re-renders
  // on every realtime drivers change), which would otherwise reset the timer forever.
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);
  useEffect(() => {
    const timer = setTimeout(() => onDoneRef.current(), AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="modal-backdrop" onClick={onDone}>
      <div
        className="rounded-2xl shadow-2xl w-[400px] overflow-hidden"
        style={{ backgroundColor: 'var(--surface-page)', border: '1px solid var(--status-success)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Green success header */}
        <div
          className="flex flex-col items-center justify-center px-6 py-8"
          style={{ backgroundColor: 'var(--status-success-bg)' }}
        >
          <CheckCircle size={56} color="var(--status-success)" strokeWidth={1.5} className="mb-4" />
          <p
            className="text-xs font-black tracking-[0.2em] uppercase mb-2"
            style={{ color: 'var(--status-success)' }}
          >
            Check-In Complete
          </p>
          <h2 className="text-2xl font-black text-(--status-success-fg) tracking-wide text-center">
            {name}
          </h2>
        </div>

        {/* Details */}
        <div
          className="px-6 py-5 space-y-3"
          style={{ borderTop: '1px solid var(--status-success)' }}
        >
          <div className="flex items-start justify-between">
            <span className="text-[11px] font-bold tracking-widest uppercase text-fg-faint mt-1">
              {shifts.length > 1 ? 'Shifts' : 'Shift'}
            </span>
            <div className="flex flex-wrap gap-1.5 justify-end">
              {shifts.map((s, i) => (
                <span
                  key={i}
                  className="text-sm font-bold px-3 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: SHIFT_COLORS[s.shift_type] }}
                >
                  {SHIFT_LABELS[s.shift_type]}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-widest uppercase text-fg-faint">
              Starting Lane
            </span>
            <span className="text-sm font-semibold text-fg-strong">
              {LANE_LABELS[lane]}
            </span>
          </div>
        </div>

        {/* Done button + auto-close hint */}
        <div className="px-6 pb-6">
          <button
            onClick={onDone}
            className="w-full py-3 rounded-xl font-black text-sm tracking-widest uppercase text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--status-success)' }}
          >
            Done
          </button>
          <p className="text-center text-[10px] text-fg-ghost mt-2">
            Auto-closes in {AUTO_CLOSE_MS / 1000} seconds
          </p>
        </div>
      </div>
    </div>
  );
}
