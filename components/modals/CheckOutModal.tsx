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
        className="rounded-xl p-6 w-full max-w-80 shadow-2xl"
        style={{ backgroundColor: 'var(--surface-panel)', border: '1px solid var(--brand)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-fg-strong font-bold text-lg mb-1">Check Out Driver</h2>
        <p className="text-fg-muted text-sm mb-5">
          Are you sure you want to check out{' '}
          <span className="text-fg-strong font-semibold">{driver.name}</span>?
          This will remove them from the board.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg text-sm font-bold text-fg-soft transition-colors hover:text-fg-strong"
            style={{ backgroundColor: 'var(--surface-button)' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-80"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            Check Out
          </button>
        </div>
      </div>
    </div>
  );
}
