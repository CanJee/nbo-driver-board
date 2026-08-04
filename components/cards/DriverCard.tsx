'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronUp, Copy, GripVertical, Pencil, Save, StickyNote, Trash2, X } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AwayReason, Driver, Lane, LaneId, LocationStatus, SHIFT_COLORS, SHIFT_LABELS, AWAY_LABELS, AWAY_SHORT_LABELS } from '@/lib/types';
import { AWAY_ICONS, type AwayIcon } from '@/lib/away-icons';
import { activeLanes, laneLabel } from '@/lib/lanes';
import { copyToClipboard } from '@/lib/clipboard';
import { formatClockTime, formatDurationShort } from '@/lib/date';
import { SearchMatchField } from '@/lib/search';
import Portal from '@/components/ui/Portal';

// Minute-granularity display, so re-rendering twice a minute is enough to keep
// it honest. The component only exists while a card is expanded.
const LANE_TIMER_TICK_MS = 30_000;

// How long the "Copied" / "Copy failed" confirmation stays up after a tap.
const COPY_FEEDBACK_MS = 1600;

// How long "Clear" stays armed as "Sure?" before dropping back to idle.
const CLEAR_CONFIRM_MS = 3000;

// Distance from the note popover to its badge, and the minimum it keeps from
// the edges of the screen.
const NOTE_POPOVER_GAP = 6;
const NOTE_POPOVER_MARGIN = 8;

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
 * The note itself, in a popover anchored to its badge.
 *
 * Portalled to <body> because every lane is `overflow-hidden` around its own
 * scroller: rendered inside the card this would be clipped at the lane's edge
 * for exactly the cards that most need it — the rightmost lane, or the last
 * card in a list. Position is measured once, on open; the badge can't move
 * after that without a scroll or a resize, and NoteBadge closes on both.
 *
 * It deliberately does not inherit the board's TV zoom (like the modals and the
 * toast, which are also portalled), so on a zoomed board the note reads at
 * normal size rather than the board's.
 */
function NotePopover({
  note,
  anchorRef,
  popoverRef,
  id,
}: {
  note: string;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  popoverRef: React.RefObject<HTMLDivElement | null>;
  id: string;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Layout effect so the measured position lands in the same frame the popover
  // first paints. Until it does the box renders hidden rather than at 0,0.
  useLayoutEffect(() => {
    const el = popoverRef.current;
    const anchor = anchorRef.current?.getBoundingClientRect();
    if (!el || !anchor) return;
    const { width, height } = el.getBoundingClientRect();

    // documentElement.client*, not window.inner*: the latter counts the
    // scrollbar (and on a phone reports the device width, not the layout
    // viewport), which would let the popover clamp to space that isn't there
    // and slip under the right-hand edge.
    const viewW = document.documentElement.clientWidth;
    const viewH = document.documentElement.clientHeight;

    // Below the badge by default; flipped above when the card sits near the
    // bottom of the screen, which is where a long note would run off it.
    const below = anchor.bottom + NOTE_POPOVER_GAP;
    const top =
      below + height > viewH - NOTE_POPOVER_MARGIN
        ? Math.max(NOTE_POPOVER_MARGIN, anchor.top - NOTE_POPOVER_GAP - height)
        : below;

    // Centred on the badge, then clamped into the viewport so a card in the
    // rightmost lane doesn't push the note off the side of the screen.
    const maxLeft = Math.max(NOTE_POPOVER_MARGIN, viewW - width - NOTE_POPOVER_MARGIN);
    const left = Math.min(
      Math.max(NOTE_POPOVER_MARGIN, anchor.left + anchor.width / 2 - width / 2),
      maxLeft,
    );

    setPos({ top, left });
  }, [anchorRef, popoverRef, note]);

  return (
    <div
      ref={popoverRef}
      id={id}
      role="tooltip"
      className="fixed z-50 rounded-md shadow-xl p-2.5"
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        visibility: pos ? 'visible' : 'hidden',
        maxWidth: 'min(280px, calc(100vw - 16px))',
        backgroundColor: 'var(--surface-card)',
        border: '1px solid var(--edge)',
      }}
    >
      <div className="text-[10px] font-bold tracking-widest uppercase text-fg-faint mb-1">Note</div>
      {/* The caption stays put while a long note scrolls under it. */}
      <div className="text-sm text-fg-soft leading-relaxed whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
        {note}
      </div>
    </div>
  );
}

/**
 * Collapsed-card note indicator — hover, or tap, to read the note in place.
 *
 * Notes were visible only inside an expanded card, so finding out who had one
 * meant opening and closing every card on the board.
 *
 * `interactive` is false for the drag ghost, which shows the badge (so the
 * ghost matches the card it was picked up from) but must never open a popover.
 */
function NoteBadge({ note, interactive }: { note: string; interactive: boolean }) {
  const [hovering, setHovering] = useState(false);
  const [pinned, setPinned] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  const open = interactive && (hovering || pinned);

  // The popover is positioned once, so anything that moves the badge closes it
  // instead of leaving a note floating away from its card. Lanes scroll
  // independently of the page, hence capture phase — scroll doesn't bubble.
  useEffect(() => {
    if (!open) return;
    const close = () => {
      setHovering(false);
      setPinned(false);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  // Pinning is the touchscreen path (and a click, for mouse users), so it needs
  // the dismissals a hover gets for free: tap elsewhere, or Escape.
  useEffect(() => {
    if (!pinned) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setPinned(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinned(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [pinned]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Show note"
        aria-expanded={pinned}
        aria-describedby={open ? popoverId : undefined}
        // Hover is a mouse-only affordance: a touchscreen fires a synthetic
        // enter just before the tap's click, which would open the popover and
        // let that same click immediately unpin it. The buttons check keeps
        // notes from popping open under a card being dragged past.
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse' && e.buttons === 0) setHovering(true);
        }}
        onPointerLeave={() => setHovering(false)}
        onFocus={() => setHovering(true)}
        onBlur={() => setHovering(false)}
        // The whole collapsed card expands on click, so without this a tap on
        // the badge would open the card instead of showing the note.
        onClick={(e) => {
          e.stopPropagation();
          setPinned((p) => !p);
        }}
        // Bare icon, no chrome — a frame around it read as a button on a row
        // where nothing else has one. The padded tap target is pulled back out
        // with negative margins (as CopyablePhone does) so a touch-sized hit
        // area doesn't widen the row or open a gap beside the status pills.
        className="flex items-center flex-shrink-0 p-1 -m-1 rounded leading-none transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        style={{
          color: 'var(--accent-blue)',
          pointerEvents: interactive ? undefined : 'none',
        }}
      >
        <StickyNote size={11} />
      </button>
      {open && (
        <Portal>
          <NotePopover note={note} anchorRef={buttonRef} popoverRef={popoverRef} id={popoverId} />
        </Portal>
      )}
    </>
  );
}

/**
 * How long the driver has been in their current lane: "47m · since 14:15".
 *
 * Applies to every lane — meals is just the case dispatchers asked about first.
 * Renders nothing when the stamp is missing or unparseable, which is what lets
 * the UI ship before the migration has been run against prod.
 */
function TimeInLane({ driver, label }: { driver: Driver; label: string }) {
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
        In {label}
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
  /** Every lane row (hidden included): labels must resolve for legacy lanes. */
  lanes: Lane[];
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
}

export default function DriverCard({
  driver,
  lanes,
  onCheckOut,
  onAssign,
  onUpdateNotes,
  onSetAway,
  onSetLocationStatus,
  onMoveToLane,
  isDragOverlay = false,
  searchHit = null,
  searchDim = false,
}: DriverCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(driver.notes ?? '');
  const [confirmingClear, setConfirmingClear] = useState(false);

  // One definition of "this driver has a note", shared by the collapsed card's
  // badge and the expanded card's Clear button. Board stores `notes || null`,
  // but a note typed as whitespace would still arrive as a string.
  const noteText = driver.notes?.trim() ?? '';

  // Drop the armed "Sure?" back to "Clear" if the second tap never comes.
  useEffect(() => {
    if (!confirmingClear) return;
    const id = setTimeout(() => setConfirmingClear(false), CLEAR_CONFIRM_MS);
    return () => clearTimeout(id);
  }, [confirmingClear]);

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

  // Mouse-only drag start for the whole card (the grip keeps the full listener
  // spread). A 28px grip strip was too small a target to grab with a mouse, and
  // the 8px activation distance means click-to-expand still gets through — but
  // touch drag has to stay on the grip, or a swipe across a card body would pick
  // the card up instead of scrolling the lane.
  //
  // Keyed to onMouseDown because Board.tsx pairs a MouseSensor with a TouchSensor
  // (Board.tsx:300-304) and each sensor contributes its own activator; if those
  // are ever collapsed into a PointerSensor this must become onPointerDown.
  // Narrowed by hand because dnd-kit types the listener map as
  // Record<string, Function>, which strict mode won't assign to a real handler
  // prop (the {...listeners} spread only compiles because spreads of an index
  // signature aren't key-checked).
  const dragMouseDown = listeners?.onMouseDown as React.MouseEventHandler | undefined;

  const isUnassigned = driver.status === 'unassigned';
  const isAway = driver.status === 'away';

  // Capitalised on purpose: JSX only treats a binding as a component when its
  // name starts with a capital, so `<AwayIcon />` needs this and `<awayIcon />`
  // would render a literal <awayicon> element instead.
  const AwayIcon = isAway && driver.away_reason ? AWAY_ICONS[driver.away_reason] : null;

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
    paddingLeft: '6px',
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

  // Two taps to clear. The board lives on a touchscreen and there is no undo,
  // so a single mis-tap next to Edit would silently drop a dispatcher's note.
  const handleClearNotes = () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    setConfirmingClear(false);
    onUpdateNotes(driver, '');
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
          width: '6px',
          borderTopLeftRadius: '6px',
          borderBottomLeftRadius: '6px',
          background: shiftBarBackground(barColors),
        }}
      />

      {/* ── COLLAPSED VIEW ── */}
      {!expanded && (
        // min-h (not fixed h) so the search snippet line can grow the card;
        // the drag handle uses self-stretch because h-full needs a fixed parent.
        <div className="flex items-center min-h-[60px]" onMouseDown={dragMouseDown}>
          <div
            {...attributes}
            {...listeners}
            suppressHydrationWarning
            className="flex items-center justify-center w-10 self-stretch cursor-grab active:cursor-grabbing text-fg-ghost hover:text-fg-muted flex-shrink-0 touch-none"
          >
            <GripVertical size={18} />
          </div>
          <div
            className="flex-1 py-2 pr-3 cursor-pointer min-w-0"
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
                {noteText && <NoteBadge note={noteText} interactive={!isDragOverlay} />}
                {driver.location_status === 'en_route' && (
                  <span
                    className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                    style={{ backgroundColor: 'var(--status-warn-strong-bg)', color: 'var(--status-warn-fg)' }}
                  >
                    <ArrowRight size={10} className="flex-shrink-0" />
                    EN ROUTE
                  </span>
                )}
                {driver.location_status === 'at_location' && (
                  <span
                    className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                    style={{ backgroundColor: 'var(--status-success-strong-bg)', color: 'var(--status-success-bright)' }}
                  >
                    <Check size={10} className="flex-shrink-0" />
                    AT LOCATION
                  </span>
                )}
                {AwayIcon && driver.away_reason && (
                  <span className="flex items-center flex-shrink-0" title={AWAY_LABELS[driver.away_reason]}>
                    <AwayIcon size={16} aria-hidden />
                  </span>
                )}
              </span>
            </div>
            {/* Phone and notes aren't visible on collapsed cards, so when the
                search matched one of them, say why this card lit up */}
            {searchHit === 'phone' && (
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

          {/* Name + drag + collapse. The whole header row is the mouse drag
              surface — grip, name and the dead space between them — while the
              button-dense body below deliberately is not. */}
          <div className="flex items-center justify-between mb-2" onMouseDown={dragMouseDown}>
            <div className="flex items-center gap-1.5 min-w-0">
              <div
                {...attributes}
                {...listeners}
                suppressHydrationWarning
                className="p-2 -m-2 rounded cursor-grab active:cursor-grabbing text-fg-ghost hover:text-fg-muted flex-shrink-0 touch-none"
              >
                <GripVertical size={18} />
              </div>
              <span className="text-base font-bold text-fg-strong truncate">{driver.name}</span>
            </div>
            {/* Padded out to a 36px touch target, then pulled back with -m-2 so
                the row's height and spacing are unchanged (the p-1 -m-1 trick
                NoteBadge and CopyablePhone use, one size up). ml-2 restores the
                8px gap the negative margin would otherwise eat. */}
            <button
              type="button"
              aria-label="Collapse card"
              onClick={() => setExpanded(false)}
              className="p-2 -m-2 ml-2 rounded-md text-fg-muted hover:text-fg-strong hover:bg-black/5 dark:hover:bg-white/10 flex-shrink-0 transition-colors"
            >
              <ChevronUp size={20} />
            </button>
          </div>

          {/* Time in the current lane */}
          <TimeInLane driver={driver} label={laneLabel(lanes, driver.lane)} />

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
              <button
                onClick={() => onAssign(driver)}
                className="flex items-center gap-1 text-[10px] text-fg-faint hover:text-accent-blue transition-colors ml-2 flex-shrink-0"
              >
                <Pencil size={11} /><span>Edit</span>
              </button>
            </div>
            <CopyablePhone phone={driver.phone} />
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
                    <span className="text-fg-faint whitespace-nowrap">· {laneLabel(lanes, s.lane)}</span>
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
          <div className="mb-3">
            <div className="text-[10px] font-bold tracking-widest uppercase text-fg-faint mb-1.5">
              Location Status
            </div>
            {/* Side by side while both labels fit, stacked below that — squeezing
                two 11px bold labels into a narrow lane's card clipped them. */}
            <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))' }}>
              <button
                onClick={() => onSetLocationStatus(driver, driver.location_status === 'en_route' ? null : 'en_route')}
                className="flex items-center justify-center gap-1 py-1.5 rounded text-[11px] font-bold transition-colors"
                style={
                  driver.location_status === 'en_route'
                    ? { backgroundColor: 'var(--status-warn-strong-bg)', color: 'var(--status-warn-fg)', border: '1px solid #B45309' }
                    : { backgroundColor: 'var(--surface-card)', color: 'var(--fg-faint)', border: '1px solid var(--edge)' }
                }
              >
                <ArrowRight size={12} />
                En Route
              </button>
              <button
                onClick={() => onSetLocationStatus(driver, driver.location_status === 'at_location' ? null : 'at_location')}
                className="flex items-center justify-center gap-1 py-1.5 rounded text-[11px] font-bold transition-colors"
                style={
                  driver.location_status === 'at_location'
                    ? { backgroundColor: 'var(--status-success-strong-bg)', color: 'var(--status-success-bright)', border: '1px solid var(--status-success)' }
                    : { backgroundColor: 'var(--surface-card)', color: 'var(--fg-faint)', border: '1px solid var(--edge)' }
                }
              >
                <Check size={12} />
                At Location
              </button>
            </div>
          </div>

          {/* Away Status */}
          <div className="mb-3">
            <div className="text-[10px] font-bold tracking-widest uppercase text-fg-faint mb-1.5">
              Away Status
            </div>
            {isAway ? (
              // flex-wrap because the longest reason ("Parking Lot Shuttle") plus the
              // button is wider than a narrow lane: without it the label broke onto a
              // second line and the button, which can't shrink, sat across it and
              // overhung the card edge. Wrapping drops the button to its own row
              // instead, where ml-auto still right-aligns it.
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm flex items-center gap-1.5 min-w-0">
                  {AwayIcon && <AwayIcon size={14} className="flex-shrink-0" aria-hidden />}
                  <span className="text-fg-soft">{driver.away_reason && AWAY_LABELS[driver.away_reason]}</span>
                </span>
                <button
                  onClick={() => onSetAway(driver, null)}
                  className="flex items-center gap-1 flex-shrink-0 text-[11px] font-bold px-2.5 py-1 rounded text-white ml-auto"
                  style={{ backgroundColor: 'var(--status-success)' }}
                >
                  <Check size={12} />
                  Returned
                </button>
              </div>
            ) : (
              // Equal-width columns that share whatever width the card has,
              // rather than a flex row the buttons can push out of it — five
              // reasons no longer fit every lane at every zoom. auto-fit keeps
              // them on one row while they fit and wraps to a second row when
              // they don't, which stays readable where squeezing five columns
              // into a narrow lane would clip every caption to "Prac…".
              <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(42px, 1fr))' }}>
                {(Object.entries(AWAY_ICONS) as [AwayReason, AwayIcon][]).map(([reason, Icon]) => (
                  <button
                    key={reason}
                    onClick={() => onSetAway(driver, reason)}
                    title={AWAY_LABELS[reason]}
                    className="flex flex-col items-center gap-0.5 min-w-0 px-0.5 py-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10 text-center"
                    style={{ border: '1px solid var(--edge-muted)' }}
                  >
                    <Icon size={16} aria-hidden />
                    <span className="text-[8px] text-fg-faint leading-none w-full truncate">
                      {AWAY_SHORT_LABELS[reason]}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Move to lane — tap alternative to dragging across the snap board.
              Hidden at lg+ where all lanes are on screen and mouse-drag is easy. */}
          <div className="mb-3 lg:hidden">
            <div className="text-[10px] font-bold tracking-widest uppercase text-fg-faint mb-1.5">
              Move To
            </div>
            <div className="flex flex-wrap gap-1.5">
              {activeLanes(lanes).filter((l) => l.id !== driver.lane).map((l) => (
                <button
                  key={l.id}
                  onClick={() => onMoveToLane(driver, l.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-bold text-fg-soft transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  style={{ border: '1px solid var(--edge-muted)' }}
                >
                  <span className="truncate">{l.label}</span>
                  <ArrowRight size={12} className="flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold tracking-widest uppercase text-fg-faint">Notes</span>
              {!editingNotes && (
                <div className="flex items-center gap-2.5">
                  {/* Only offered when there is something to clear. Edit keeps
                      its usual spot at the right edge. */}
                  {noteText && (
                    <button
                      onClick={handleClearNotes}
                      aria-label={confirmingClear ? 'Confirm clearing the note' : 'Clear the note'}
                      className={`flex items-center gap-1 text-[10px] transition-colors ${
                        confirmingClear ? 'text-brand font-bold' : 'text-fg-faint hover:text-brand'
                      }`}
                    >
                      <Trash2 size={11} /><span>{confirmingClear ? 'Sure?' : 'Clear'}</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setConfirmingClear(false);
                      setEditingNotes(true);
                    }}
                    className="flex items-center gap-1 text-[10px] text-fg-faint hover:text-accent-blue transition-colors"
                  >
                    <Pencil size={11} /><span>Edit</span>
                  </button>
                </div>
              )}
            </div>
            {editingNotes ? (
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
                className="text-sm text-fg-soft rounded p-2 min-h-[40px] leading-relaxed cursor-text"
                style={{ backgroundColor: 'var(--surface-input)', border: '1px solid var(--edge)' }}
                onClick={() => setEditingNotes(true)}
              >
                {driver.notes || <span className="text-fg-ghost italic">Click to add notes...</span>}
              </div>
            )}
          </div>

          {/* Action buttons — wrap rather than squash when a narrow card can't
              fit ASSIGN and CHECK OUT on one line. */}
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
        </div>
      )}
    </div>
  );
}
