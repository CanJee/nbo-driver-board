'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronUp, Copy, GripVertical, Pencil, Save, X } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AwayReason, Driver, LaneId, LocationStatus, MAIN_LANES, SHIFT_COLORS, SHIFT_LABELS, LANE_LABELS, AWAY_ICONS, AWAY_LABELS, AWAY_SHORT_LABELS } from '@/lib/types';
import { copyToClipboard } from '@/lib/clipboard';
import { formatClockTime, formatDurationShort } from '@/lib/date';
import { SearchMatchField } from '@/lib/search';

// Same lane set the board renders — targets for the mobile "Move to" buttons.
const MOVE_LANES: LaneId[] = [...MAIN_LANES, 'meals'];

// Minute-granularity display, so re-rendering twice a minute is enough to keep
// it honest. The component only exists while a card is expanded.
const LANE_TIMER_TICK_MS = 30_000;

// How long the "Copied" / "Copy failed" confirmation stays up after a tap.
const COPY_FEEDBACK_MS = 1600;

/**
 * The driver's phone number, tap-to-copy.
 *
 * Cards are `select-none` (so dragging never starts a text selection), which
 * leaves no way to get a number off the board by hand — dispatchers were
 * re-typing it into a dialer. The number itself is the button; the icon is
 * there to make that affordance visible, since a bare number doesn't look
 * tappable.
 */
function CopyablePhone({ phone }: { phone: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  // Clear the confirmation on a timer. Cleanup covers the card being collapsed
  // mid-countdown, which unmounts this along with the rest of the expanded view.
  useEffect(() => {
    if (state === 'idle') return;
    const id = setTimeout(() => setState('idle'), COPY_FEEDBACK_MS);
    return () => clearTimeout(id);
  }, [state]);

  if (!phone) {
    return (
      <div className="text-sm text-fg-muted">
        Phone: <span className="text-fg-bright">—</span>
      </div>
    );
  }

  const handleCopy = async () => {
    // Drop back to idle first so a repeat tap restarts the timer instead of
    // re-setting the same state (which React would skip, leaving the old one).
    setState('idle');
    setState((await copyToClipboard(phone)) ? 'copied' : 'failed');
  };

  const copied = state === 'copied';

  return (
    <div className="text-sm text-fg-muted flex items-center gap-1.5 flex-wrap">
      <span>Phone:</span>
      {/* Success is confirmed by swapping the icon and greening the number
          rather than adding a "Copied" label: the cards are narrow enough that
          any extra word wraps to its own line and shoves the rest of the card
          down for the length of the confirmation. Negative margins keep the
          padded tap target from indenting the row. */}
      <button
        onClick={handleCopy}
        title="Copy phone number"
        aria-label={`Copy phone number ${phone}`}
        className="flex items-center gap-1.5 -my-1 -ml-1 px-1 py-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        style={copied ? { color: 'var(--status-success-bright)' } : undefined}
      >
        <span className={`tabular-nums ${copied ? 'font-medium' : 'text-fg-bright'}`}>{phone}</span>
        {copied ? (
          <Check size={13} className="flex-shrink-0" />
        ) : (
          <Copy size={12} className="text-fg-faint flex-shrink-0" />
        )}
      </button>
      {/* The failure case is rare, and worth the wrap — a silent no-op would
          leave a dispatcher pasting whatever was on the clipboard before. */}
      {state === 'failed' && (
        <span className="text-[11px] font-semibold" style={{ color: 'var(--status-warn-fg)' }}>
          Copy failed
        </span>
      )}
      <span aria-live="polite" className="sr-only">
        {copied ? 'Phone number copied' : ''}
      </span>
    </div>
  );
}

/**
 * How long the driver has been in their current lane: "47m · since 14:15".
 *
 * Applies to every lane — meals is just the case dispatchers asked about first.
 * Renders nothing when the stamp is missing or unparseable, which is what lets
 * the UI ship before the migration has been run against prod.
 */
function TimeInLane({ driver }: { driver: Driver }) {
  // Elapsed time depends on the client clock, so there is no correct value to
  // render on the server. Staying null until mounted keeps the first client
  // render identical to the server's (the guard LiveClock and ThemeToggle use).
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const id = setInterval(update, LANE_TIMER_TICK_MS);
    return () => clearInterval(id);
  }, []);

  if (now === null || !driver.lane_entered_at) return null;
  const entered = Date.parse(driver.lane_entered_at);
  if (Number.isNaN(entered)) return null;

  return (
    <div className="mb-3">
      <div className="text-[10px] font-bold tracking-widest uppercase text-fg-faint mb-1.5">
        In {LANE_LABELS[driver.lane]}
      </div>
      <div className="text-sm text-fg-soft">
        <span className="text-fg-strong font-medium tabular-nums">
          {formatDurationShort(now - entered)}
        </span>
        {' · since '}
        <span className="tabular-nums">{formatClockTime(driver.lane_entered_at)}</span>
      </div>
    </div>
  );
}

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
  onMoveToLane: (driver: Driver, lane: LaneId) => void;
  isDragOverlay?: boolean;
  /** Which field the active search matched, or null if this card is not a hit. */
  searchHit?: SearchMatchField | null;
  /** True when a search is active and this card is NOT a hit (fades it out). */
  searchDim?: boolean;
  /**
   * Viewer mode: the card shows information and nothing else. No drag handle,
   * no editing, and no phone number — viewer rows arrive with `phone` already
   * blanked by the server (see lib/viewer-data.ts), so there is nothing to show
   * and the field is skipped rather than rendered as an empty row.
   */
  readOnly?: boolean;
}

export default function DriverCard({
  driver,
  onCheckOut,
  onAssign,
  onUpdateNotes,
  onSetAway,
  onSetLocationStatus,
  onMoveToLane,
  isDragOverlay = false,
  searchHit = null,
  searchDim = false,
  readOnly = false,
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
    disabled: readOnly,
  });

  const isUnassigned = driver.status === 'unassigned';
  const isAway = driver.status === 'away';

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Single source of truth for card opacity (a stylesheet rule would lose to
    // this inline value). Priority: drag ghost, then search (a hit stays at
    // full opacity even when away; non-matches fade without unmounting so
    // drag-reorder and realtime updates keep working), then away dim.
    opacity: isDragging ? 0.3 : searchHit ? 1 : searchDim ? 0.25 : isAway && !isDragOverlay ? 0.5 : 1,
    zIndex: isDragOverlay ? 999 : undefined,
  };

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
    borderTop:    isUnassigned ? '2px dashed var(--status-warn)' : '1px solid var(--edge)',
    borderRight:  isUnassigned ? '2px dashed var(--status-warn)' : '1px solid var(--edge)',
    borderBottom: isUnassigned ? '2px dashed var(--status-warn)' : '1px solid var(--edge)',
    borderRadius: '6px',
    backgroundColor: 'var(--surface-card)',
    // Matches the shift bar's width exactly — Board widens both at once in
    // viewer mode by setting --shift-bar-w on the board root.
    paddingLeft: 'var(--shift-bar-w, 6px)',
    // Search hits get the amber ring + glow (same family as the hover glow)
    ...(searchHit ? { boxShadow: '0 0 0 2px var(--status-warn), 0 0 10px var(--card-glow)' } : {}),
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
      data-search-hit={searchHit ? '' : undefined}
      className="card-glow relative select-none"
    >
      {/* Shift colour bar — solid for one shift, split for double/triple */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          // Wider on the viewer board, where the colour is what people read
          // first from across a room and no drag handle shares the edge.
          width: 'var(--shift-bar-w, 6px)',
          borderTopLeftRadius: '6px',
          borderBottomLeftRadius: '6px',
          background: shiftBarBackground(barColors),
        }}
      />

      {/* ── COLLAPSED VIEW ── */}
      {!expanded && (
        // min-h (not fixed h) so the search snippet line can grow the card;
        // the drag handle uses self-stretch because h-full needs a fixed parent.
        <div className="flex items-center min-h-[60px]">
          {/* No handle in viewer mode: nothing here can be dragged, and the
              space it frees goes to the name, which is what a TV needs most. */}
          {!readOnly && (
            <div
              {...attributes}
              {...listeners}
              suppressHydrationWarning
              className="flex items-center justify-center w-7 self-stretch cursor-grab active:cursor-grabbing text-fg-ghost hover:text-fg-muted flex-shrink-0 touch-none"
            >
              <GripVertical size={15} />
            </div>
          )}
          <div
            className={`flex-1 py-2 pr-3 cursor-pointer min-w-0 ${readOnly ? 'pl-2.5' : ''}`}
            onClick={() => setExpanded(true)}
          >
            {/* The name gets the full width of the card. The status badges used
                to sit beside it, which cost the name ~90px and truncated half
                the board's people to "Leo Dall…" once lanes got narrow; the car
                line below has room to spare, so they ride along there instead. */}
            <div className="text-base font-bold text-fg-strong truncate leading-snug">
              {driver.name}
            </div>
            {/* Walkies aren't handed out any more, so the card shows the car
                alone; walkie_number is still carried on the row for history. */}
            {/* Both parts keep their full text: the car number is never worth
                abbreviating, so in a lane too narrow for both the badge wraps to
                its own line (ml-auto keeps it right-aligned either way). */}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs mt-0.5 leading-snug">
              {isUnassigned ? (
                <span className="italic text-amber-700 dark:text-amber-400 flex-shrink-0">Car: --</span>
              ) : (
                <span className="text-fg-soft flex-shrink-0">Car: {driver.car_number ?? '--'}</span>
              )}
              <span className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
                {driver.location_status === 'en_route' && (
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                    style={{ backgroundColor: 'var(--status-warn-strong-bg)', color: 'var(--status-warn-fg)' }}
                  >
                    → EN ROUTE
                  </span>
                )}
                {driver.location_status === 'at_location' && (
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                    style={{ backgroundColor: 'var(--status-success-strong-bg)', color: 'var(--status-success-bright)' }}
                  >
                    ✓ AT LOCATION
                  </span>
                )}
                {isAway && driver.away_reason && (
                  <span className="text-base leading-none" title={AWAY_LABELS[driver.away_reason]}>
                    {AWAY_ICONS[driver.away_reason]}
                  </span>
                )}
              </span>
            </div>
            {/* Phone and notes aren't visible on collapsed cards, so when the
                search matched one of them, say why this card lit up */}
            {searchHit === 'phone' && !readOnly && (
              <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--status-warn-fg)' }}>
                Phone: {driver.phone}
              </div>
            )}
            {searchHit === 'notes' && (
              <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--status-warn-fg)' }} title={driver.notes ?? ''}>
                Note: {driver.notes}
              </div>
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
              {!readOnly && (
                <div
                  {...attributes}
                  {...listeners}
                  suppressHydrationWarning
                  className="cursor-grab active:cursor-grabbing text-fg-ghost hover:text-fg-muted flex-shrink-0 touch-none"
                >
                  <GripVertical size={14} />
                </div>
              )}
              <span className="text-base font-bold text-fg-strong truncate">{driver.name}</span>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="text-fg-faint hover:text-fg-strong ml-2 flex-shrink-0 transition-colors"
            >
              <ChevronUp size={16} />
            </button>
          </div>

          {/* Time in the current lane */}
          <TimeInLane driver={driver} />

          {/* Car / Phone */}
          <div className="mb-3 space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-sm text-fg-soft">
                {isUnassigned ? (
                  <span className="italic text-amber-700 dark:text-amber-400">Car: --</span>
                ) : (
                  <span>
                    Car: <span className="text-fg-strong font-medium">{driver.car_number ?? '--'}</span>
                  </span>
                )}
              </div>
              {!readOnly && (
                <button
                  onClick={() => onAssign(driver)}
                  className="flex items-center gap-1 text-[10px] text-fg-faint hover:text-accent-blue transition-colors ml-2 flex-shrink-0"
                >
                  <Pencil size={11} /><span>Edit</span>
                </button>
              )}
            </div>
            {/* Phone numbers never reach viewer mode at all — the server blanks
                the field before the rows are serialised, so there is nothing to
                copy and nothing sitting in the page for someone to dig out. */}
            {!readOnly && <CopyablePhone phone={driver.phone} />}
          </div>

          {/* Today's shifts */}
          {shifts && shifts.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] font-bold tracking-widest uppercase text-fg-faint mb-1.5">
                {shifts.length > 1 ? 'Shifts' : 'Shift'}
              </div>
              <div className="space-y-1">
                {/* Wraps between fields, not through them: left to wrap freely a
                    narrow card breaks the time range and the lane name mid-text
                    ("7:00 AM / – 1:00 / PM"), which reads as three broken lines. */}
                {shifts.map((s, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-soft">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: SHIFT_COLORS[s.shift_type] }}
                    />
                    <span className="font-semibold text-fg-strong">{SHIFT_LABELS[s.shift_type]}</span>
                    {s.label && <span className="text-fg-muted whitespace-nowrap">{s.label}</span>}
                    <span className="text-fg-faint whitespace-nowrap">· {LANE_LABELS[s.lane]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Location Status — shown for every driver, including unassigned ones.
              Where a driver is has nothing to do with whether they have been
              handed a car, and the car number is optional at check-in
              ("can assign later"), so gating this on assignment left the common
              just-checked-in case with no way to set en route / at location.
              The collapsed card already renders the badge ungated, so hiding
              only the control could also strand a card showing EN ROUTE with no
              way to clear it. */}
          {!readOnly && (
          <div className="mb-3">
            <div className="text-[10px] font-bold tracking-widest uppercase text-fg-faint mb-1.5">
              Location Status
            </div>
            {/* Side by side while both labels fit, stacked below that — squeezing
                two 11px bold labels into a narrow lane's card clipped them. */}
            <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))' }}>
              <button
                onClick={() => onSetLocationStatus(driver, driver.location_status === 'en_route' ? null : 'en_route')}
                className="py-1.5 rounded text-[11px] font-bold transition-colors"
                style={
                  driver.location_status === 'en_route'
                    ? { backgroundColor: 'var(--status-warn-strong-bg)', color: 'var(--status-warn-fg)', border: '1px solid #B45309' }
                    : { backgroundColor: 'var(--surface-card)', color: 'var(--fg-faint)', border: '1px solid var(--edge)' }
                }
              >
                → En Route
              </button>
              <button
                onClick={() => onSetLocationStatus(driver, driver.location_status === 'at_location' ? null : 'at_location')}
                className="py-1.5 rounded text-[11px] font-bold transition-colors"
                style={
                  driver.location_status === 'at_location'
                    ? { backgroundColor: 'var(--status-success-strong-bg)', color: 'var(--status-success-bright)', border: '1px solid var(--status-success)' }
                    : { backgroundColor: 'var(--surface-card)', color: 'var(--fg-faint)', border: '1px solid var(--edge)' }
                }
              >
                ✓ At Location
              </button>
            </div>
          </div>
          )}

          {/* Away Status — in viewer mode this is pure status, so the section
              only appears when the driver is actually away; the whole "set them
              away" grid has nothing to offer someone who can't set anything. */}
          {(!readOnly || isAway) && (
          <div className="mb-3">
            <div className="text-[10px] font-bold tracking-widest uppercase text-fg-faint mb-1.5">
              Away Status
            </div>
            {isAway ? (
              <div className="flex items-center gap-2">
                <span className="text-sm">
                  {driver.away_reason && AWAY_ICONS[driver.away_reason]}{' '}
                  <span className="text-fg-soft">{driver.away_reason && AWAY_LABELS[driver.away_reason]}</span>
                </span>
                {!readOnly && (
                  <button
                    onClick={() => onSetAway(driver, null)}
                    className="text-[11px] font-bold px-2.5 py-1 rounded text-white ml-auto"
                    style={{ backgroundColor: 'var(--status-success)' }}
                  >
                    ✓ Returned
                  </button>
                )}
              </div>
            ) : (
              // Equal-width columns that share whatever width the card has,
              // rather than a flex row the buttons can push out of it — five
              // reasons no longer fit every lane at every zoom. auto-fit keeps
              // them on one row while they fit and wraps to a second row when
              // they don't, which stays readable where squeezing five columns
              // into a narrow lane would clip every caption to "Prac…".
              <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(42px, 1fr))' }}>
                {(Object.entries(AWAY_ICONS) as [AwayReason, string][]).map(([reason, icon]) => (
                  <button
                    key={reason}
                    onClick={() => onSetAway(driver, reason)}
                    title={AWAY_LABELS[reason]}
                    className="flex flex-col items-center gap-0.5 min-w-0 px-0.5 py-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10 text-center"
                    style={{ border: '1px solid var(--edge-muted)' }}
                  >
                    <span className="text-base leading-none">{icon}</span>
                    <span className="text-[8px] text-fg-faint leading-none w-full truncate">
                      {AWAY_SHORT_LABELS[reason]}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          )}

          {/* Move to lane — tap alternative to dragging across the snap board.
              Hidden at lg+ where all lanes are on screen and mouse-drag is easy. */}
          {!readOnly && (
          <div className="mb-3 lg:hidden">
            <div className="text-[10px] font-bold tracking-widest uppercase text-fg-faint mb-1.5">
              Move To
            </div>
            <div className="flex flex-wrap gap-1.5">
              {MOVE_LANES.filter((l) => l !== driver.lane).map((l) => (
                <button
                  key={l}
                  onClick={() => onMoveToLane(driver, l)}
                  className="px-2.5 py-1.5 rounded text-[11px] font-bold text-fg-soft transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  style={{ border: '1px solid var(--edge-muted)' }}
                >
                  {LANE_LABELS[l]} →
                </button>
              ))}
            </div>
          </div>
          )}

          {/* Notes — read-only viewers see a note when there is one, and no
              section at all when there isn't (an empty box that can't be filled
              in is just wasted card height on a TV). */}
          {(!readOnly || Boolean(driver.notes)) && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold tracking-widest uppercase text-fg-faint">Notes</span>
              {!readOnly && !editingNotes && (
                <button
                  onClick={() => setEditingNotes(true)}
                  className="flex items-center gap-1 text-[10px] text-fg-faint hover:text-accent-blue transition-colors"
                >
                  <Pencil size={11} /><span>Edit</span>
                </button>
              )}
            </div>
            {editingNotes && !readOnly ? (
              <div>
                <textarea
                  ref={notesRef}
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  className="w-full text-sm text-fg-bright rounded p-2 resize-none outline-none"
                  style={{ backgroundColor: 'var(--surface-input)', border: '1px solid #3B82F6', minHeight: '60px' }}
                  placeholder="Add a note..."
                />
                <div className="flex gap-2 mt-1.5">
                  <button
                    onClick={handleSaveNotes}
                    className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded text-white"
                    style={{ backgroundColor: 'var(--status-success)' }}
                  >
                    <Save size={11} /> Save
                  </button>
                  <button
                    onClick={handleCancelNotes}
                    className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded text-fg-soft"
                    style={{ backgroundColor: 'var(--surface-button)' }}
                  >
                    <X size={11} /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                className={`text-sm text-fg-soft rounded p-2 min-h-[40px] leading-relaxed ${
                  readOnly ? '' : 'cursor-text'
                }`}
                style={{ backgroundColor: 'var(--surface-input)', border: '1px solid var(--edge)' }}
                onClick={readOnly ? undefined : () => setEditingNotes(true)}
              >
                {driver.notes ||
                  (readOnly ? null : <span className="text-fg-ghost italic">Click to add notes...</span>)}
              </div>
            )}
          </div>
          )}

          {/* Action buttons — wrap rather than squash when a narrow card can't
              fit ASSIGN and CHECK OUT on one line. */}
          {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
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
                style={{ backgroundColor: 'var(--brand)' }}
              >
                CHECK OUT
              </button>
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
