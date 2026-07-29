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
