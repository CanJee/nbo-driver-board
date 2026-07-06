'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { AwayReason, Driver, LaneId, LocationStatus } from '@/lib/types';
import LaneHeader from './LaneHeader';
import DriverCard from '@/components/cards/DriverCard';

interface SwimLaneProps {
  laneId: LaneId;
  drivers: Driver[];
  dispatcher?: string;
  className?: string;
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
  onCheckOut,
  onAssign,
  onUpdateNotes,
  onSetAway,
  onSetLocationStatus,
  onMoveToLane,
}: SwimLaneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: laneId });

  return (
    <div
      className={`flex flex-col rounded-md overflow-hidden border ${className}`}
      style={{ borderColor: 'var(--edge)', backgroundColor: 'var(--surface-panel)' }}
    >
      <LaneHeader laneId={laneId} count={drivers.length} dispatcher={dispatcher} />

      <div ref={setNodeRef} className="flex-1 flex flex-col min-h-0">
        <SortableContext items={drivers.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          <div
            className="lane-scroll flex-1 p-2 space-y-1.5 transition-colors"
            style={{ backgroundColor: isOver ? 'var(--surface-drag-over)' : 'var(--surface-page)' }}
          >
            {drivers.length === 0 && (
              <div className="flex items-center justify-center h-16 mt-2">
                <span className="text-[10px] text-fg-ghost uppercase tracking-widest">
                  {isOver ? 'Drop here' : 'No drivers'}
                </span>
              </div>
            )}
            {drivers.map((driver) => (
              <DriverCard
                key={driver.id}
                driver={driver}
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
