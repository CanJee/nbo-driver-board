// Lane helpers for the data-driven board columns (rows in public.lanes),
// ported from ridecrew's staging-zone pattern (~/workspace/ridecrew
// apps/web/lib/staging.ts) — which was itself ported from this app's old
// hardcoded MAIN_LANES, now retired.

import type { Lane, LaneId } from './types';

/** The columns the board renders, in order. Ties in sort_order (possible while
 *  another device is mid-reorder) break by label so the two boards agree. */
export function activeLanes(lanes: Lane[]): Lane[] {
  return lanes
    .filter((l) => l.active)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

/** Label for any lane id, including hidden/legacy ones. Falls back to a
 *  humanized slug ("downtown_hotel" → "Downtown Hotel") so historical
 *  DriverShift/roster lane values never render blank. */
export function laneLabel(lanes: Lane[], id: LaneId): string {
  return (
    lanes.find((l) => l.id === id)?.label ??
    id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** Id for a lane created in the UI. Ids are permanent (rename only changes the
 *  label): they are the drivers.lane FK target, the localStorage width key, and
 *  the dnd droppable id. The alphabet is [a-z0-9_] — never a hyphen — while
 *  driver card ids are uuids, which always contain hyphens, so a lane id can
 *  never collide with a card id in dnd-kit's shared id namespace. */
export function slugifyLaneLabel(label: string, existingIds: LaneId[]): LaneId {
  const base = label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining accents: é → e
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  const root = base || 'lane'; // emoji-only or punctuation-only labels
  if (!existingIds.includes(root)) return root;
  for (let n = 2; ; n++) {
    const candidate = `${root}_${n}`;
    if (!existingIds.includes(candidate)) return candidate;
  }
}

/** Append slot for a new lane — max+1 rather than count, so a gap left by a
 *  SQL-editor delete can't produce a duplicate position. */
export function nextLaneSortOrder(lanes: Lane[]): number {
  return lanes.reduce((max, l) => Math.max(max, l.sort_order), -1) + 1;
}
