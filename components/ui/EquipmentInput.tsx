'use client';

import { forwardRef } from 'react';

interface EquipmentInputProps {
  prefix: 'W-' | 'C-';
  value: string;           // digits only, e.g. "12" or "05"
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
        style={{ border: '1px solid #2D3748', backgroundColor: '#0D1117' }}
      >
        <span
          className="px-3 py-2 text-sm font-bold flex items-center select-none flex-shrink-0"
          style={{
            color: '#94A3B8',
            backgroundColor: '#161B22',
            borderRight: '1px solid #2D3748',
          }}
        >
          {prefix}
        </span>
        <input
          ref={ref}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 2);
            onChange(digits);
          }}
          placeholder="00"
          className="flex-1 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none bg-transparent min-w-0"
        />
      </div>
    );
  }
);

EquipmentInput.displayName = 'EquipmentInput';

export default EquipmentInput;

/** Parse a DB value like "W-12" or "C-05" → digits string "12" / "05" */
export function parseEquipment(val: string | null | undefined): string {
  if (!val) return '';
  // Strip any leading letter(s) and dash
  const stripped = val.replace(/^[A-Za-z]+-?/, '');
  return stripped.replace(/\D/g, '');
}

/** Format digits back to DB format, e.g. "5" → "W-05", "" → "" */
export function formatEquipment(digits: string, prefix: 'W-' | 'C-'): string {
  if (!digits) return '';
  return `${prefix}${digits.padStart(2, '0')}`;
}
