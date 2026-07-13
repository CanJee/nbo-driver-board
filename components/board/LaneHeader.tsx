import { LANE_LABELS, LaneId } from '@/lib/types';

interface LaneHeaderProps {
  laneId: LaneId;
  count: number;
  /** Search hits in this lane; null when no search is active. */
  matchCount?: number | null;
  dispatcher?: string;
}

export default function LaneHeader({ laneId, count, matchCount = null, dispatcher }: LaneHeaderProps) {
  const label = LANE_LABELS[laneId];
  const searching = matchCount !== null;

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

      {/* Driver count badge — shows "hits of total" while a search is active */}
      {searching ? (
        <span
          className="ml-2 flex-shrink-0 text-[11px] font-bold rounded-full h-6 px-2 flex items-center justify-center whitespace-nowrap"
          style={
            matchCount > 0
              ? { backgroundColor: 'var(--status-warn-strong-bg)', color: 'var(--status-warn-fg)' }
              : { backgroundColor: 'var(--surface-badge-muted)', color: '#fff' }
          }
        >
          {matchCount} of {count}
        </span>
      ) : (
        <span
          className="ml-2 flex-shrink-0 text-white text-[11px] font-bold rounded-full w-6 h-6 flex items-center justify-center"
          style={{ backgroundColor: count > 0 ? 'var(--brand)' : 'var(--surface-badge-muted)' }}
        >
          {count}
        </span>
      )}
    </div>
  );
}
