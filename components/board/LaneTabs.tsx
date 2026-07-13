'use client';

import { Search } from 'lucide-react';
import { LANE_LABELS, LaneId } from '@/lib/types';

interface LaneTabsProps {
  lanes: LaneId[];
  counts: number[];
  /** Per-lane search hits; when set, badges show hits (amber) instead of
   *  totals so off-screen lanes with matches are findable on the snap board. */
  matchCounts?: number[];
  activeIdx: number;
  onSelect: (idx: number) => void;
  /** Search toggle chip — the phone header has no room for a search control,
   *  so it lives here on the tab strip. */
  searchOn: boolean;
  onToggleSearch: () => void;
}

/** Mobile-only lane switcher: one chip per lane; tapping scrolls the snap
 *  board to that lane. Hidden at lg+ where every lane is already visible. */
export default function LaneTabs({ lanes, counts, matchCounts, activeIdx, onSelect, searchOn, onToggleSearch }: LaneTabsProps) {
  return (
    <div
      className="lg:hidden flex gap-1.5 overflow-x-auto flex-shrink-0"
      style={{ scrollbarWidth: 'none' }}
    >
      <button
        type="button"
        aria-label={searchOn ? 'Close search' : 'Search drivers'}
        onClick={onToggleSearch}
        className="flex items-center justify-center px-2.5 py-1.5 rounded-full flex-shrink-0 transition-colors"
        style={{
          backgroundColor: searchOn ? 'var(--brand)' : 'var(--surface-panel)',
          border: `1px solid ${searchOn ? 'var(--brand)' : 'var(--edge)'}`,
          color: searchOn ? '#fff' : 'var(--fg-muted)',
        }}
      >
        <Search size={14} />
      </button>
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
              style={
                matchCounts && matchCounts[i] > 0
                  ? { backgroundColor: 'var(--status-warn-strong-bg)', color: 'var(--status-warn-fg)' }
                  : {
                      backgroundColor: active ? 'rgba(255,255,255,0.25)' : 'var(--surface-badge-muted)',
                      color: '#fff',
                    }
              }
            >
              {matchCounts ? matchCounts[i] : counts[i]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
