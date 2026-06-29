'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronUp, GripVertical, Pencil, Save, X } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AwayReason, Driver, LocationStatus, SHIFT_COLORS, SHIFT_LABELS, LANE_LABELS, AWAY_ICONS, AWAY_LABELS } from '@/lib/types';

/** Build the left bar: solid for one shift, an evenly-split hard-stop gradient for multiple. */
function shiftBarBackground(colors: string[]): string {
  if (colors.length <= 1) return colors[0] ?? SHIFT_COLORS.morning;
  const step = 100 / colors.length;
  const stops = colors
    .map((c, i) => `${c} ${(i * step).toFixed(2)}% ${((i + 1) * step).toFixed(2)}%`)
    .join(', ');
  return `linear-gradient(to bottom, ${stops})`;
}

interface DriverCardProps {
  driver: Driver;
  onCheckOut: (driver: Driver) => void;
  onAssign: (driver: Driver) => void;
  onUpdateNotes: (driver: Driver, notes: string) => void;
  onSetAway: (driver: Driver, reason: AwayReason | null) => void;
  onSetLocationStatus: (driver: Driver, status: LocationStatus | null) => void;
  isDragOverlay?: boolean;
}

export default function DriverCard({
  driver,
  onCheckOut,
  onAssign,
  onUpdateNotes,
  onSetAway,
  onSetLocationStatus,
  isDragOverlay = false,
}: DriverCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(driver.notes ?? '');

  // Keep notesValue in sync if the driver prop updates from Supabase
  useEffect(() => {
    setNotesValue(driver.notes ?? '');
  }, [driver.notes]);

  // Focus notes textarea without scrolling the page
  const notesRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editingNotes) {
      notesRef.current?.focus({ preventScroll: true });
    }
  }, [editingNotes]);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: driver.id,
    data: { driver },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragOverlay ? 999 : undefined,
  };

  const isUnassigned = driver.status === 'unassigned';
  const isAway = driver.status === 'away';

  // One colour band per shift (de-duped) so a double shift shows e.g. blue+green.
  // Fall back to the primary shift_type for legacy rows with no `shifts` array.
  const shifts = driver.shifts?.length ? driver.shifts : null;
  const barColors = [
    ...new Set((shifts ?? [{ shift_type: driver.shift_type }]).map((s) => SHIFT_COLORS[s.shift_type])),
  ];

  // The shift colour now renders as an absolute left bar (supports the split gradient);
  // unassigned still gets the amber dashed frame on the other 3 sides.
  const containerStyle: React.CSSProperties = {
    borderLeft: 'none',
    borderTop:    isUnassigned ? '2px dashed #F59E0B' : '1px solid #2D3748',
    borderRight:  isUnassigned ? '2px dashed #F59E0B' : '1px solid #2D3748',
    borderBottom: isUnassigned ? '2px dashed #F59E0B' : '1px solid #2D3748',
    borderRadius: '6px',
    backgroundColor: '#1C2333',
    paddingLeft: '6px',
  };

  const handleSaveNotes = () => {
    onUpdateNotes(driver, notesValue);
    setEditingNotes(false);
  };

  const handleCancelNotes = () => {
    setNotesValue(driver.notes ?? '');
    setEditingNotes(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...containerStyle, ...style }}
      className={`card-glow relative select-none ${isAway && !isDragOverlay ? 'card-away' : ''}`}
    >
      {/* Shift colour bar — solid for one shift, split for double/triple */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '6px',
          borderTopLeftRadius: '6px',
          borderBottomLeftRadius: '6px',
          background: shiftBarBackground(barColors),
        }}
      />

      {/* ── COLLAPSED VIEW ── */}
      {!expanded && (
        <div className="flex items-center h-[60px]">
          <div
            {...attributes}
            {...listeners}
            suppressHydrationWarning
            className="flex items-center justify-center w-7 h-full cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400 flex-shrink-0"
          >
            <GripVertical size={15} />
          </div>
          <div
            className="flex-1 flex items-center justify-between pr-3 cursor-pointer min-w-0"
            onClick={() => setExpanded(true)}
          >
            <div className="min-w-0">
              <div className="text-base font-bold text-white truncate leading-snug">
                {driver.name}
              </div>
              <div className="text-xs mt-0.5 leading-snug">
                {isUnassigned ? (
                  <span className="italic text-amber-400">Walkie: --&nbsp;&nbsp;Car: --</span>
                ) : (
                  <span className="text-slate-300">
                    Walkie: {driver.walkie_number ?? '--'}&nbsp;&nbsp;Car: {driver.car_number ?? '--'}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
              {driver.location_status === 'en_route' && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                  style={{ backgroundColor: '#92400E', color: '#FCD34D' }}
                >
                  → EN ROUTE
                </span>
              )}
              {driver.location_status === 'at_location' && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                  style={{ backgroundColor: '#14532D', color: '#4ADE80' }}
                >
                  ✓ AT LOCATION
                </span>
              )}
              {isAway && driver.away_reason && (
                <span className="text-lg" title={AWAY_LABELS[driver.away_reason]}>
                  {AWAY_ICONS[driver.away_reason]}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── EXPANDED VIEW ── */}
      {expanded && (
        <div className="p-3" onClick={(e) => e.stopPropagation()}>

          {/* Name + drag + collapse */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <div
                {...attributes}
                {...listeners}
                suppressHydrationWarning
                className="cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400 flex-shrink-0"
              >
                <GripVertical size={14} />
              </div>
              <span className="text-base font-bold text-white truncate">{driver.name}</span>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="text-slate-500 hover:text-white ml-2 flex-shrink-0 transition-colors"
            >
              <ChevronUp size={16} />
            </button>
          </div>

          {/* Walkie / Car / Phone */}
          <div className="mb-3 space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-300">
                {isUnassigned ? (
                  <span className="italic text-amber-400">Walkie: --&nbsp;&nbsp;Car: --</span>
                ) : (
                  <span>
                    Walkie: <span className="text-white font-medium">{driver.walkie_number ?? '--'}</span>
                    &nbsp;&nbsp;
                    Car: <span className="text-white font-medium">{driver.car_number ?? '--'}</span>
                  </span>
                )}
              </div>
              <button
                onClick={() => onAssign(driver)}
                className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-blue-400 transition-colors ml-2 flex-shrink-0"
              >
                <Pencil size={11} /><span>Edit</span>
              </button>
            </div>
            <div className="text-sm text-slate-400">
              Phone: <span className="text-slate-200">{driver.phone || '—'}</span>
            </div>
          </div>

          {/* Today's shifts */}
          {shifts && shifts.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] font-bold tracking-widest uppercase text-slate-500 mb-1.5">
                {shifts.length > 1 ? 'Shifts' : 'Shift'}
              </div>
              <div className="space-y-1">
                {shifts.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-300">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: SHIFT_COLORS[s.shift_type] }}
                    />
                    <span className="font-semibold text-white">{SHIFT_LABELS[s.shift_type]}</span>
                    {s.label && <span className="text-slate-400">{s.label}</span>}
                    <span className="text-slate-500">· {LANE_LABELS[s.lane]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Location Status */}
          {!isUnassigned && (
            <div className="mb-3">
              <div className="text-[10px] font-bold tracking-widest uppercase text-slate-500 mb-1.5">
                Location Status
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => onSetLocationStatus(driver, driver.location_status === 'en_route' ? null : 'en_route')}
                  className="flex-1 py-1.5 rounded text-[11px] font-bold transition-colors"
                  style={
                    driver.location_status === 'en_route'
                      ? { backgroundColor: '#92400E', color: '#FCD34D', border: '1px solid #B45309' }
                      : { backgroundColor: '#1C2333', color: '#64748B', border: '1px solid #2D3748' }
                  }
                >
                  → En Route
                </button>
                <button
                  onClick={() => onSetLocationStatus(driver, driver.location_status === 'at_location' ? null : 'at_location')}
                  className="flex-1 py-1.5 rounded text-[11px] font-bold transition-colors"
                  style={
                    driver.location_status === 'at_location'
                      ? { backgroundColor: '#14532D', color: '#4ADE80', border: '1px solid #16A34A' }
                      : { backgroundColor: '#1C2333', color: '#64748B', border: '1px solid #2D3748' }
                  }
                >
                  ✓ At Location
                </button>
              </div>
            </div>
          )}

          {/* Away Status */}
          <div className="mb-3">
            <div className="text-[10px] font-bold tracking-widest uppercase text-slate-500 mb-1.5">
              Away Status
            </div>
            {isAway ? (
              <div className="flex items-center gap-2">
                <span className="text-sm">
                  {driver.away_reason && AWAY_ICONS[driver.away_reason]}{' '}
                  <span className="text-slate-300">{driver.away_reason && AWAY_LABELS[driver.away_reason]}</span>
                </span>
                <button
                  onClick={() => onSetAway(driver, null)}
                  className="text-[11px] font-bold px-2.5 py-1 rounded text-white ml-auto"
                  style={{ backgroundColor: '#16A34A' }}
                >
                  ✓ Returned
                </button>
              </div>
            ) : (
              <div className="flex gap-1.5">
                {(Object.entries(AWAY_ICONS) as [AwayReason, string][]).map(([reason, icon]) => (
                  <button
                    key={reason}
                    onClick={() => onSetAway(driver, reason)}
                    title={AWAY_LABELS[reason]}
                    className="flex flex-col items-center gap-0.5 px-2 py-1 rounded transition-colors hover:bg-slate-700 text-center"
                    style={{ border: '1px solid #374151' }}
                  >
                    <span className="text-base">{icon}</span>
                    <span className="text-[8px] text-slate-500 leading-none">{AWAY_LABELS[reason].split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold tracking-widest uppercase text-slate-500">Notes</span>
              {!editingNotes && (
                <button
                  onClick={() => setEditingNotes(true)}
                  className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-blue-400 transition-colors"
                >
                  <Pencil size={11} /><span>Edit</span>
                </button>
              )}
            </div>
            {editingNotes ? (
              <div>
                <textarea
                  ref={notesRef}
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  className="w-full text-sm text-slate-200 rounded p-2 resize-none outline-none"
                  style={{ backgroundColor: '#0D1117', border: '1px solid #3B82F6', minHeight: '60px' }}
                  placeholder="Add a note..."
                />
                <div className="flex gap-2 mt-1.5">
                  <button
                    onClick={handleSaveNotes}
                    className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded text-white"
                    style={{ backgroundColor: '#16A34A' }}
                  >
                    <Save size={11} /> Save
                  </button>
                  <button
                    onClick={handleCancelNotes}
                    className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded text-slate-300"
                    style={{ backgroundColor: '#2D3748' }}
                  >
                    <X size={11} /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="text-sm text-slate-300 rounded p-2 min-h-[40px] leading-relaxed cursor-text"
                style={{ backgroundColor: '#0D1117', border: '1px solid #2D3748' }}
                onClick={() => setEditingNotes(true)}
              >
                {driver.notes || <span className="text-slate-600 italic">Click to add notes...</span>}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {isUnassigned && (
              <button
                onClick={() => onAssign(driver)}
                className="text-xs font-bold px-3 py-1.5 rounded text-white hover:opacity-80 transition-opacity"
                style={{ backgroundColor: '#3B82F6' }}
              >
                ASSIGN
              </button>
            )}
            <div className="ml-auto">
              <button
                onClick={() => onCheckOut(driver)}
                className="text-xs font-bold px-3 py-1.5 rounded text-white hover:opacity-80 transition-opacity"
                style={{ backgroundColor: '#E41C23' }}
              >
                CHECK OUT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
