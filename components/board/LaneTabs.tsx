'use client';

import { LANE_LABELS, LaneId } from '@/lib/types';

interface LaneTabsProps {
  lanes: LaneId[];
  counts: number[];
  activeIdx: number;
  onSelect: (idx: number) => void;
}

/** Mobile-only lane switcher: one chip per lane; tapping scrolls the snap
 *  board to that lane. Hidden at lg+ where every lane is already visible. */
export default function LaneTabs({ lanes, counts, activeIdx, onSelect }: LaneTabsProps) {
  return (
    <div
      className="lg:hidden flex gap-1.5 overflow-x-auto flex-shrink-0"
      style={{ scrollbarWidth: 'none' }}
    >
      {lanes.map((lane, i) => {
        const active = i === activeIdx;
        return (
          <button
            key={lane}
            type="button"
            onClick={() => onSelect(i)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors"
            style={{
              backgroundColor: active ? 'var(--brand)' : 'var(--surface-panel)',
              border: `1px solid ${active ? 'var(--brand)' : 'var(--edge)'}`,
              color: active ? '#fff' : 'var(--fg-muted)',
            }}
          >
            {LANE_LABELS[lane]}
            <span
              className="text-[10px] font-black rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center"
              style={{
                backgroundColor: active ? 'rgba(255,255,255,0.25)' : 'var(--surface-badge-muted)',
                color: '#fff',
              }}
            >
              {counts[i]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
