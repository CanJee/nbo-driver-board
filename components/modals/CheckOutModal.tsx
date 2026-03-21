'use client';

import { Driver } from '@/lib/types';

interface CheckOutModalProps {
  driver: Driver;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function CheckOutModal({ driver, onConfirm, onCancel }: CheckOutModalProps) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="rounded-xl p-6 w-80 shadow-2xl"
        style={{ backgroundColor: '#161B22', border: '1px solid #E41C23' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-white font-bold text-lg mb-1">Check Out Driver</h2>
        <p className="text-slate-400 text-sm mb-5">
          Are you sure you want to check out{' '}
          <span className="text-white font-semibold">{driver.name}</span>?
          This will remove them from the board.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg text-sm font-bold text-slate-300 transition-colors hover:text-white"
            style={{ backgroundColor: '#2D3748' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-80"
            style={{ backgroundColor: '#E41C23' }}
          >
            Check Out
          </button>
        </div>
      </div>
    </div>
  );
}
