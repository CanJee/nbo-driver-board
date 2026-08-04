'use client';

import { SpacingMode } from '@/lib/board-prefs';
import Select from '@/components/ui/Select';

interface SpacingControlProps {
  value: SpacingMode;
  onChange: (mode: SpacingMode) => void;
}

const OPTIONS: { value: SpacingMode; label: string }[] = [
  { value: 'current', label: 'Spacing: current' },
  { value: 'even', label: 'Spacing: A even gaps' },
  { value: 'nowrap', label: 'Spacing: B no wrap' },
];

/**
 * TEMPORARY — see the lane spacing comparison block in lib/board-prefs.ts.
 * Switches between the two candidate fixes for uneven card gaps so they can be
 * compared on the real board. Delete this file once one is chosen.
 *
 * Desktop only, like ZoomControl: the columns this is about only exist at lg+.
 */
export default function SpacingControl({ value, onChange }: SpacingControlProps) {
  return (
    <Select
      value={value}
      options={OPTIONS}
      onChange={onChange}
      label="Lane spacing (temporary comparison)"
      align="right"
      className="hidden lg:block"
    />
  );
}
