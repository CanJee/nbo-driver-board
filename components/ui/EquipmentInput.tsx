'use client';

import { forwardRef } from 'react';

/** Longest equipment number the fleet issues, e.g. C-105. */
const MAX_DIGITS = 3;

/**
 * Numbers under 10 are still written two-up ("C-05"), which is how every car
 * already on the board is stored. Padding to MAX_DIGITS instead would render
 * those as "C-005" and, worse, stop the duplicate-car check in AssignModal from
 * matching the "C-05" values already in the DB.
 */
const PAD_TO = 2;

interface EquipmentInputProps {
  prefix: 'W-' | 'C-';
  value: string;           // digits only, e.g. "12", "05" or "105"
  onChange: (digits: string) => void;
  disabled?: boolean;
}

/**
 * A number-only input that displays a fixed prefix (W- or C-).
 * The `value` prop and `onChange` callback deal in digits only.
 * Use `formatEquipment` / `parseEquipment` helpers for DB read/write.
 */
const EquipmentInput = forwardRef<HTMLInputElement, EquipmentInputProps>(
  ({ prefix, value, onChange, disabled }, ref) => {
    return (
      <div
        className="flex rounded-lg overflow-hidden"
        style={{ border: '1px solid var(--edge)', backgroundColor: 'var(--surface-input)' }}
      >
        <span
          className="px-3 py-2 text-sm font-bold flex items-center select-none flex-shrink-0"
          style={{
            color: 'var(--fg-muted)',
            backgroundColor: 'var(--surface-chip)',
            borderRight: '1px solid var(--edge)',
          }}
        >
          {prefix}
        </span>
        <input
          ref={ref}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={MAX_DIGITS}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, MAX_DIGITS);
            onChange(digits);
          }}
          placeholder="00"
          className="flex-1 px-3 py-2 text-sm text-fg-strong placeholder-fg-ghost outline-none bg-transparent min-w-0"
        />
      </div>
    );
  }
);

EquipmentInput.displayName = 'EquipmentInput';

export default EquipmentInput;

/** Parse a DB value like "W-12" or "C-105" → digits string "12" / "105" */
export function parseEquipment(val: string | null | undefined): string {
  if (!val) return '';
  // Strip any leading letter(s) and dash
  const stripped = val.replace(/^[A-Za-z]+-?/, '');
  return stripped.replace(/\D/g, '');
}

/** Format digits back to DB format, e.g. "5" → "W-05", "105" → "W-105", "" → "" */
export function formatEquipment(digits: string, prefix: 'W-' | 'C-'): string {
  if (!digits) return '';
  return `${prefix}${digits.padStart(PAD_TO, '0')}`;
}
