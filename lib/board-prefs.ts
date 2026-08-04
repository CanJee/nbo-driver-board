import type { LaneId } from './types';

/** Board zoom levels offered by the header control, in percent. */
export const ZOOM_OPTIONS = [80, 90, 100, 110, 125, 150] as const;
export const DEFAULT_ZOOM = 100;

/** Per-lane flex-grow weights, keyed by lane id. */
export type LaneGrows = Partial<Record<LaneId, number>>;

/**
 * Lane widths are either derived from how crowded each lane is ('auto' — what
 * the unattended TV runs in) or pinned by a dispatcher dragging a divider.
 */
export type LaneWidthsPref =
  | { mode: 'auto' }
  | { mode: 'manual'; grows: LaneGrows };

// Prefs are deliberately per-device: the TV keeps auto-sizing itself even after
// a dispatcher drags dividers on their own laptop. The `.v1` suffix lets a
// future schema change invalidate old values instead of misreading them.
const ZOOM_KEY = 'nbo-board.zoom.v1';
const WIDTHS_KEY = 'nbo-board.laneWidths.v1';

/** Sane range for a saved lane weight — rejects corrupt or absurd values. */
const MIN_GROW = 0.2;
const MAX_GROW = 8;

// localStorage is absent during SSR and throws in Safari private mode, so every
// access is individually guarded. Prefs are a nicety, never load-bearing.
function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable or full — fall back to this session only */
  }
}

export function loadZoom(): number {
  const data = readJson(ZOOM_KEY) as { v?: number; zoom?: number } | null;
  const zoom = data?.v === 1 ? data.zoom : undefined;
  return ZOOM_OPTIONS.includes(zoom as (typeof ZOOM_OPTIONS)[number])
    ? (zoom as number)
    : DEFAULT_ZOOM;
}

export function saveZoom(zoom: number): void {
  writeJson(ZOOM_KEY, { v: 1, zoom });
}

// ─── TEMPORARY: lane spacing comparison ──────────────────────────────────────
// Two candidate fixes for the uneven gaps between cards in a wrapped lane, put
// behind a header control so both can be judged on the real board with real
// data. Nothing here is meant to ship: once one wins, delete this block,
// SpacingControl.tsx, the [data-lane-spacing] rules in globals.css, the
// `card-meta` class in DriverCard, and the four `spacing` lines in Board.
//
//   current — today's behaviour: a lane is a grid whose rows are as tall as the
//             tallest card across BOTH columns, so one tall card pushes apart
//             the cards beside it in the other column.
//   even    — each column packs its own cards with an identical gap, so a tall
//             card only affects the column it is in.
//   nowrap  — keeps the grid, but stops the note/status badges wrapping onto a
//             second line, which is what makes a card taller than its
//             neighbours in the first place.
export const SPACING_MODES = ['current', 'even', 'nowrap'] as const;
export type SpacingMode = (typeof SPACING_MODES)[number];
export const DEFAULT_SPACING: SpacingMode = 'current';

const SPACING_KEY = 'nbo-board.laneSpacing.v1';

export function loadSpacing(): SpacingMode {
  const data = readJson(SPACING_KEY) as { v?: number; mode?: SpacingMode } | null;
  const mode = data?.v === 1 ? data.mode : undefined;
  return SPACING_MODES.includes(mode as SpacingMode) ? (mode as SpacingMode) : DEFAULT_SPACING;
}

export function saveSpacing(mode: SpacingMode): void {
  writeJson(SPACING_KEY, { v: 1, mode });
}
// ─── end TEMPORARY ───────────────────────────────────────────────────────────

/**
 * Reads saved lane widths, falling back to 'auto' unless every currently
 * rendered lane has a sane saved weight — so adding or removing a lane discards
 * stale widths rather than applying them to the wrong columns.
 */
export function loadLaneWidths(lanes: LaneId[]): LaneWidthsPref {
  const data = readJson(WIDTHS_KEY) as
    | { v?: number; mode?: string; grows?: Record<string, unknown> }
    | null;
  if (data?.v !== 1 || data.mode !== 'manual' || !data.grows) return { mode: 'auto' };

  const grows: LaneGrows = {};
  for (const lane of lanes) {
    const g = data.grows[lane];
    if (typeof g !== 'number' || !Number.isFinite(g) || g < MIN_GROW || g > MAX_GROW) {
      return { mode: 'auto' };
    }
    grows[lane] = g;
  }
  return { mode: 'manual', grows };
}

export function saveLaneWidths(pref: LaneWidthsPref): void {
  writeJson(WIDTHS_KEY, { v: 1, ...pref });
}
