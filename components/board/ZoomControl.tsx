'use client';

import { ZOOM_OPTIONS } from '@/lib/board-prefs';
import Select from '@/components/ui/Select';

interface ZoomControlProps {
  value: number;
  onChange: (zoom: number) => void;
}

const OPTIONS = ZOOM_OPTIONS.map((z) => ({ value: z as number, label: `${z}%` }));

/**
 * Board zoom for the TV: shrink to fit a busy day on one screen, or enlarge for a
 * room reading the board from further back. Desktop only — phones have the
 * browser's own pinch zoom and a one-lane-at-a-time layout.
 */
export default function ZoomControl({ value, onChange }: ZoomControlProps) {
  return (
    <Select
      value={value}
      options={OPTIONS}
      onChange={onChange}
      label="Board zoom"
      align="right"
      className="hidden lg:block"
    />
  );
}
