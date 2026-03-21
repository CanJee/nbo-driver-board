'use client';

import { useEffect } from 'react';
import { CheckCircle } from 'lucide-react';
import { LaneId, LANE_LABELS, SHIFT_COLORS, SHIFT_LABELS, ShiftType } from '@/lib/types';

interface CheckInCompleteModalProps {
  name: string;
  shiftType: ShiftType;
  lane: LaneId;
  onDone: () => void;
}

const AUTO_CLOSE_MS = 5000;

export default function CheckInCompleteModal({
  name,
  shiftType,
  lane,
  onDone,
}: CheckInCompleteModalProps) {
  // Auto-close after 5 seconds
  useEffect(() => {
    const timer = setTimeout(onDone, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  const shiftColor = SHIFT_COLORS[shiftType];

  return (
    <div className="modal-backdrop" onClick={onDone}>
      <div
        className="rounded-2xl shadow-2xl w-[400px] overflow-hidden"
        style={{ backgroundColor: '#0D1117', border: '1px solid #16A34A' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Green success header */}
        <div
          className="flex flex-col items-center justify-center px-6 py-8"
          style={{ backgroundColor: '#052E16' }}
        >
          <CheckCircle size={56} color="#16A34A" strokeWidth={1.5} className="mb-4" />
          <p
            className="text-xs font-black tracking-[0.2em] uppercase mb-2"
            style={{ color: '#16A34A' }}
          >
            Check-In Complete
          </p>
          <h2 className="text-2xl font-black text-white tracking-wide text-center">
            {name}
          </h2>
        </div>

        {/* Details */}
        <div
          className="px-6 py-5 space-y-3"
          style={{ borderTop: '1px solid #16A34A' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-widest uppercase text-slate-500">
              Shift
            </span>
            <span
              className="text-sm font-bold px-3 py-0.5 rounded-full text-white"
              style={{ backgroundColor: shiftColor }}
            >
              {SHIFT_LABELS[shiftType]}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-widest uppercase text-slate-500">
              Starting Lane
            </span>
            <span className="text-sm font-semibold text-white">
              {LANE_LABELS[lane]}
            </span>
          </div>
        </div>

        {/* Done button + auto-close hint */}
        <div className="px-6 pb-6">
          <button
            onClick={onDone}
            className="w-full py-3 rounded-xl font-black text-sm tracking-widest uppercase text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#16A34A' }}
          >
            Done
          </button>
          <p className="text-center text-[10px] text-slate-600 mt-2">
            Auto-closes in {AUTO_CLOSE_MS / 1000} seconds
          </p>
        </div>
      </div>
    </div>
  );
}
