'use client';

import { ChevronDown } from 'lucide-react';
import { ZOOM_OPTIONS } from '@/lib/board-prefs';

interface ZoomControlProps {
  value: number;
  onChange: (zoom: number) => void;
}

/**
 * Board zoom for the TV: shrink to fit a busy day on one screen, or enlarge for a
 * room reading the board from further back. Desktop only — phones have the
 * browser's own pinch zoom and a one-lane-at-a-time layout.
 */
export default function ZoomControl({ value, onChange }: ZoomControlProps) {
  return (
    <div className="hidden lg:flex items-center relative">
      <select
        aria-label="Board zoom"
        title="Board zoom"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="appearance-none pl-2.5 pr-6 py-1.5 rounded-lg text-xs font-bold tracking-widest uppercase text-fg-soft hover:text-fg-strong transition-colors cursor-pointer bg-transparent"
        style={{ border: '1px solid var(--edge)' }}
      >
        {ZOOM_OPTIONS.map((z) => (
          <option key={z} value={z}>
            {z}%
          </option>
        ))}
      </select>
      {/* appearance-none drops the native arrow, so draw our own */}
      <ChevronDown
        size={12}
        aria-hidden
        className="absolute right-2 pointer-events-none text-fg-muted"
      />
    </div>
  );
}
