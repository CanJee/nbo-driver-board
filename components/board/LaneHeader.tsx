import { LANE_LABELS, LaneId } from '@/lib/types';

interface LaneHeaderProps {
  laneId: LaneId;
  count: number;
  dispatcher?: string;
}

export default function LaneHeader({ laneId, count, dispatcher }: LaneHeaderProps) {
  const label = LANE_LABELS[laneId];

  return (
    <div
      className="flex items-center justify-between px-3 py-2 border-b min-h-[44px] flex-shrink-0"
      style={{
        backgroundColor: 'var(--surface-lane-header)',
        borderBottomColor: 'var(--brand)',
        borderBottomWidth: '2px',
      }}
    >
      <div className="flex flex-col min-w-0">
        <span className="text-[11px] font-bold tracking-widest uppercase truncate text-fg-strong">
          {label}
        </span>
        {dispatcher && (
          <span className="text-[9px] text-fg-muted mt-0.5 truncate">
            {dispatcher}
          </span>
        )}
      </div>

      {/* Driver count badge */}
      <span
        className="ml-2 flex-shrink-0 text-white text-[11px] font-bold rounded-full w-6 h-6 flex items-center justify-center"
        style={{ backgroundColor: count > 0 ? 'var(--brand)' : 'var(--surface-badge-muted)' }}
      >
        {count}
      </span>
    </div>
  );
}
