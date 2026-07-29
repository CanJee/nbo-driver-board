'use client';

import { useEffect, useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { AwayReason, Driver, LaneId, LocationStatus } from '@/lib/types';
import { SearchState } from '@/lib/search';
import LaneHeader from './LaneHeader';
import DriverCard from '@/components/cards/DriverCard';

interface SwimLaneProps {
  laneId: LaneId;
  drivers: Driver[];
  dispatcher?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Cards wrap into multiple columns (desktop/TV); off on phones. */
  gridMode?: boolean;
  search: SearchState | null;
  onCheckOut: (driver: Driver) => void;
  onAssign: (driver: Driver) => void;
  onUpdateNotes: (driver: Driver, notes: string) => void;
  onSetAway: (driver: Driver, reason: AwayReason | null) => void;
  onSetLocationStatus: (driver: Driver, status: LocationStatus | null) => void;
  onMoveToLane: (driver: Driver, lane: LaneId) => void;
}

export default function SwimLane({
  laneId,
  drivers,
  dispatcher,
  className = '',
  style,
  gridMode = false,
  search,
  onCheckOut,
  onAssign,
  onUpdateNotes,
  onSetAway,
  onSetLocationStatus,
  onMoveToLane,
}: SwimLaneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: laneId });
  const scrollRef = useRef<HTMLDivElement>(null);

  const query = search?.query ?? '';

  // Lanes scroll independently, so a match below the fold would be invisible.
  // Scroll the lane's own container to its first hit when the query changes —
  // deliberately NOT scrollIntoView, which also scrolls ancestor containers
  // and would yank the mobile horizontal snap-board sideways while typing.
  useEffect(() => {
    if (!query) return;
    const container = scrollRef.current;
    const hit = container?.querySelector<HTMLElement>('[data-search-hit]');
    if (!container || !hit) return;
    const cRect = container.getBoundingClientRect();
    const hRect = hit.getBoundingClientRect();
    if (hRect.top < cRect.top || hRect.bottom > cRect.bottom) {
      container.scrollTo({
        top: container.scrollTop + (hRect.top - cRect.top) - 8,
        behavior: 'smooth',
      });
    }
  }, [query]);

  const hitCount = search
    ? drivers.filter((d) => search.matches.has(d.id)).length
    : null;

  return (
    <div
      // data-lane is load-bearing: the desktop width rule, the mobile
      // nearest-lane scroll maths and LaneResizer's measuring all select on it.
      data-lane={laneId}
      className={`flex flex-col rounded-md overflow-hidden border ${className}`}
      style={{ borderColor: 'var(--edge)', backgroundColor: 'var(--surface-panel)', ...style }}
    >
      <LaneHeader laneId={laneId} count={drivers.length} matchCount={hitCount} dispatcher={dispatcher} />

      <div ref={setNodeRef} className="flex-1 flex flex-col min-h-0">
        {/* Once cards wrap into columns, sorting has to reason about real 2-D
            rects; the vertical strategy stays on phones so single-column touch
            drag behaves exactly as before. */}
        <SortableContext
          items={drivers.map((d) => d.id)}
          strategy={gridMode ? rectSortingStrategy : verticalListSortingStrategy}
        >
          <div
            ref={scrollRef}
            // flex+gap rather than space-y: sibling margins would double up with
            // the grid's own gap once the list becomes a grid at lg+.
            className="lane-scroll lane-grid flex-1 p-2 flex flex-col gap-1.5 transition-colors"
            style={{ backgroundColor: isOver ? 'var(--surface-drag-over)' : 'var(--surface-page)' }}
          >
            {drivers.length === 0 && (
              <div className="flex items-center justify-center h-16 mt-2 lg:col-span-full">
                <span className="text-[10px] text-fg-ghost uppercase tracking-widest">
                  {isOver ? 'Drop here' : 'No drivers'}
                </span>
              </div>
            )}
            {drivers.map((driver) => (
              <DriverCard
                key={driver.id}
                driver={driver}
                searchHit={search ? (search.matches.get(driver.id) ?? null) : null}
                searchDim={search !== null && !search.matches.has(driver.id)}
                onCheckOut={onCheckOut}
                onAssign={onAssign}
                onUpdateNotes={onUpdateNotes}
                onSetAway={onSetAway}
                onSetLocationStatus={onSetLocationStatus}
                onMoveToLane={onMoveToLane}
              />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}
