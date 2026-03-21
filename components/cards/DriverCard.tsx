'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronUp, GripVertical, Pencil, Save, X } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AwayReason, Driver, SHIFT_COLORS, AWAY_ICONS, AWAY_LABELS } from '@/lib/types';

interface DriverCardProps {
  driver: Driver;
  onCheckOut: (driver: Driver) => void;
  onAssign: (driver: Driver) => void;
  onUpdateNotes: (driver: Driver, notes: string) => void;
  onSetAway: (driver: Driver, reason: AwayReason | null) => void;
  isDragOverlay?: boolean;
}

export default function DriverCard({
  driver,
  onCheckOut,
  onAssign,
  onUpdateNotes,
  onSetAway,
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
  const shiftColor = SHIFT_COLORS[driver.shift_type];

  // Shift colour left bar is always visible; unassigned gets amber dashed on the other 3 sides
  const containerStyle: React.CSSProperties = {
    borderLeft: `6px solid ${shiftColor}`,
    borderTop:    isUnassigned ? '2px dashed #F59E0B' : '1px solid #2D3748',
    borderRight:  isUnassigned ? '2px dashed #F59E0B' : '1px solid #2D3748',
    borderBottom: isUnassigned ? '2px dashed #F59E0B' : '1px solid #2D3748',
    borderRadius: '6px',
    backgroundColor: '#1C2333',
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
            {isAway && driver.away_reason && (
              <span className="text-lg flex-shrink-0 ml-2" title={AWAY_LABELS[driver.away_reason]}>
                {AWAY_ICONS[driver.away_reason]}
              </span>
            )}
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
