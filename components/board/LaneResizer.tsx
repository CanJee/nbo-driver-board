'use client';

import { useRef } from 'react';
import { LaneId } from '@/lib/types';
import { LaneGrows } from '@/lib/board-prefs';

/** How much one arrow-key press moves the divider, in CSS pixels. */
const KEY_STEP_PX = 24;

/**
 * A lane's minimum width, read back from the CSS rather than recomputed here so
 * the column-count arithmetic lives in exactly one place. The drag clamps
 * against it itself rather than leaving it to CSS: once a lane hits min-width the
 * flex row would start overflowing instead of the divider simply refusing to move.
 */
const laneMinPx = (el: HTMLElement) => parseFloat(getComputedStyle(el).minWidth) || 0;

interface LaneResizerProps {
  leftLane: LaneId;
  rightLane: LaneId;
  /** Display names for the aria-label; ids above drive the DOM selectors. */
  leftLabel: string;
  rightLabel: string;
  grows: LaneGrows;
  /** Board zoom in percent — converts the px min-width into on-screen pixels. */
  zoom: number;
  boardRef: React.RefObject<HTMLDivElement | null>;
  onPreview: (next: LaneGrows) => void;
  onCommit: (next: LaneGrows) => void;
  onReset: () => void;
  onActiveChange: (active: boolean) => void;
}

interface Measurement {
  leftG: number;
  rightG: number;
  sumG: number;
  /** On-screen pixels per unit of flex-grow, for this pair of lanes. */
  pxPerGrow: number;
  /** Each lane's own floor, already converted to on-screen pixels. */
  minLeftPx: number;
  minRightPx: number;
}

/**
 * Drag handle sitting in the gap between two lanes. Resizing only ever moves the
 * two neighbouring lanes and conserves their combined weight, so the rest of the
 * board stays exactly where it is.
 */
export default function LaneResizer({
  leftLane,
  rightLane,
  leftLabel,
  rightLabel,
  grows,
  zoom,
  boardRef,
  onPreview,
  onCommit,
  onReset,
  onActiveChange,
}: LaneResizerProps) {
  const dragRef = useRef<(Measurement & { startX: number }) | null>(null);
  const latestRef = useRef<LaneGrows | null>(null);
  const rafRef = useRef<number | null>(null);

  // Measured fresh at the start of every gesture: lane widths change with the
  // auto weights, the zoom level and the window. getBoundingClientRect and
  // pointer clientX are both on-screen pixels, so zoom cancels out of the ratio.
  const measure = (): Measurement | null => {
    const board = boardRef.current;
    if (!board) return null;
    const leftEl = board.querySelector<HTMLElement>(`[data-lane="${leftLane}"]`);
    const rightEl = board.querySelector<HTMLElement>(`[data-lane="${rightLane}"]`);
    if (!leftEl || !rightEl) return null;

    const leftG = grows[leftLane] ?? 1;
    const rightG = grows[rightLane] ?? 1;
    const sumG = leftG + rightG;
    const widthPx =
      leftEl.getBoundingClientRect().width + rightEl.getBoundingClientRect().width;
    if (sumG <= 0 || widthPx <= 0) return null;

    // min-width is in layout pixels; scale it into the on-screen space the
    // pointer deltas are measured in.
    const z = zoom / 100;
    return {
      leftG,
      rightG,
      sumG,
      pxPerGrow: widthPx / sumG,
      minLeftPx: laneMinPx(leftEl) * z,
      minRightPx: laneMinPx(rightEl) * z,
    };
  };

  // Always derived from the gesture's start position rather than accumulated
  // per-event, so overshooting a lane's minimum and coming back re-engages the
  // divider exactly under the pointer instead of drifting.
  const growsAfter = (m: Measurement, dxPx: number): LaneGrows => {
    const lo = m.minLeftPx / m.pxPerGrow;
    const hi = m.sumG - m.minRightPx / m.pxPerGrow;
    // If the pair can't satisfy both floors, split the difference rather than
    // letting the clamp invert and snap the divider to an edge.
    const leftG = lo > hi ? m.sumG / 2 : Math.min(Math.max(m.leftG + dxPx / m.pxPerGrow, lo), hi);
    return { ...grows, [leftLane]: leftG, [rightLane]: m.sumG - leftG };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const m = measure();
    if (!m) return;
    e.preventDefault(); // suppress text selection and the native drag image
    e.currentTarget.focus(); // preventDefault also swallows the implicit focus
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { ...m, startX: e.clientX };
    onActiveChange(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    latestRef.current = growsAfter(d, e.clientX - d.startX);
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (latestRef.current) onPreview(latestRef.current);
    });
  };

  const handlePointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    onActiveChange(false);
    if (latestRef.current) onCommit(latestRef.current);
    latestRef.current = null;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault(); // otherwise the board scrolls sideways instead
      const m = measure();
      if (!m) return;
      const step = (e.key === 'ArrowLeft' ? -KEY_STEP_PX : KEY_STEP_PX) * (zoom / 100);
      onCommit(growsAfter(m, step));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onReset();
    }
  };

  const leftG = grows[leftLane] ?? 1;
  const rightG = grows[rightLane] ?? 1;
  const sharePct = Math.round((100 * leftG) / (leftG + rightG));

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${leftLabel} and ${rightLabel} columns`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={sharePct}
      tabIndex={0}
      title="Drag to resize · double-click to auto-fit"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      // Hidden on phones, where lanes are full-width snap panes instead.
      className="hidden lg:block relative w-2 flex-none cursor-col-resize group focus:outline-none"
    >
      {/* Widens the grab target to 16px. The overhang stays clear of the cards,
          which sit behind each lane's 8px of padding. */}
      <div className="absolute inset-y-0 -left-1 -right-1" />
      {/* Kept invisible until hovered or focused so the idle TV shows no chrome. */}
      <div
        aria-hidden
        className="absolute inset-y-2 left-1/2 -translate-x-1/2 w-[3px] rounded-full opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        style={{ backgroundColor: 'var(--edge-muted)' }}
      />
    </div>
  );
}
