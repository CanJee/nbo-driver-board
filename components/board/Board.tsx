'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { createClient } from '@/lib/supabase/client';
import {
  AwayReason,
  DispatcherAssignment,
  Driver,
  DriverShift,
  Lane,
  LaneId,
  LANE_SELECT,
  LocationStatus,
} from '@/lib/types';
import { activeLanes, laneLabel } from '@/lib/lanes';
import { matchDriver, SearchMatchField, SearchState } from '@/lib/search';
import {
  DEFAULT_ZOOM,
  LaneGrows,
  LaneWidthsPref,
  loadLaneWidths,
  loadZoom,
  saveLaneWidths,
  saveZoom,
} from '@/lib/board-prefs';
import { useLgUp } from '@/lib/useLgUp';
import { useRefetchOnWake } from '@/lib/useRefetchOnWake';
import { useWakeLock } from '@/lib/useWakeLock';
import SwimLane from './SwimLane';
import LaneTabs from './LaneTabs';
import LaneResizer from './LaneResizer';
import ZoomControl from './ZoomControl';
import SearchBox from './SearchBox';
import LiveClock from './LiveClock';
import SyncStatus, { StaleBanner } from './SyncStatus';
import DriverCard from '@/components/cards/DriverCard';
import CheckOutModal from '@/components/modals/CheckOutModal';
import AssignModal from '@/components/modals/AssignModal';
import CheckInModal, { CheckInData } from '@/components/modals/CheckInModal';
import CheckInCompleteModal from '@/components/modals/CheckInCompleteModal';
import LanesModal from '@/components/modals/LanesModal';
import Toast from '@/components/ui/Toast';
import Portal from '@/components/ui/Portal';
import NboLogo from '@/components/ui/NboLogo';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { logout } from '@/app/login/actions';

interface BoardProps {
  initialDrivers: Driver[];
  initialDispatchers: DispatcherAssignment[];
  /** Every public.lanes row, hidden included, in sort_order. */
  initialLanes: Lane[];
}

// Rough size of one collapsed card row (min-h-[60px] + borders) and the gap
// between cards — used only to estimate how many cards fit in a lane column.
const CARD_ROW_PX = 62;
const CARD_GAP_PX = 6;
// The lane list's p-2, top + bottom (mirrors --lane-chrome in globals.css).
const LANE_LIST_PADDING_PX = 16;
// One divider between each pair of lanes (LaneResizer's w-2).
const RESIZER_PX = 8;
// Accurate for a 1080p TV, so the server-rendered first paint already has
// sensible lane widths; the ResizeObserver refines it right after mount.
const DEFAULT_ROWS_PER_COL = 12;
// Enough for the usual 3+2+1+1+1 shape. Deliberately conservative: guessing high
// would let the first paint overflow sideways before the observer corrects it.
const DEFAULT_COL_BUDGET = 8;
// A single very full lane shouldn't be allowed to starve the other four.
const MAX_LANE_COLS = 3;

/** A CSS length token off :root, in layout px. globals.css owns the values. */
function rootPx(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
}

/**
 * How many card columns fit across the board at once.
 *
 * Lanes are flex items with a min-width of (cols × --card-min + gaps + chrome),
 * so once the lanes' minimums add up to more than the board, flex can't shrink
 * them any further and the board scrolls sideways — which on a dispatch TV means
 * a whole lane (Meals, the last one) is simply not on screen, with nobody there
 * to scroll to it. Capping the total column count is what stops that happening.
 */
function columnBudget(boardWidthPx: number, laneCount: number): number {
  const cardMin = rootPx('--card-min', 170);
  const gap = rootPx('--card-gap', CARD_GAP_PX);
  const chrome = rootPx('--lane-chrome', 18);
  // Solves total = cardMin·C + gap·(C − lanes) + chrome·lanes + dividers for C.
  const fixed = chrome * laneCount - gap * laneCount + RESIZER_PX * (laneCount - 1);
  return Math.max(laneCount, Math.floor((boardWidthPx - fixed) / (cardMin + gap)));
}

/** Per-lane card grid: columns across, and rows to fill down each column. */
type LaneLayout = Record<LaneId, { cols: number; rows: number }>;

const byLaneOrder = (a: Driver, b: Driver) => a.lane_order - b.lane_order;

/**
 * The lane_order that puts a driver at the *bottom* of a lane.
 *
 * Derived from the highest existing order, never from the count: lane_order is
 * only dense right after a drag (renumberLanes), and every mid-lane check-out or
 * tap-move leaves a permanent hole. A count would then collide with a driver
 * already in the lane and the new card would sort into the middle of the queue —
 * on a wrapped multi-column lane, partway up a column where nobody looks for it.
 */
function nextLaneOrder(list: Driver[], lane: LaneId): number {
  return list.reduce((max, d) => (d.lane === lane ? Math.max(max, d.lane_order) : max), -1) + 1;
}

/**
 * Marks one card as having entered its lane just now — for display only.
 *
 * The authoritative lane_entered_at is written by a database trigger on any real
 * lane change; we never send that column. But the dispatcher who made the move
 * can't rely on a refetch to pick it up, because handleDragEnd holds the
 * realtime guard shut across its own writes. Without this their card would keep
 * counting up from the *previous* lane until the next change from anyone at all.
 * A slightly-off client clock only shows here, and only until that refetch.
 */
function stampLaneEntry(list: Driver[], id: string): Driver[] {
  const at = new Date().toISOString();
  return list.map((d) => (d.id === id ? { ...d, lane_entered_at: at } : d));
}

/** Renumbers lane_order to a dense 0..n-1 in the given lanes, keeping their order. */
function renumberLanes(list: Driver[], lanes: LaneId[]): Driver[] {
  const order = new Map<string, number>();
  for (const lane of lanes) {
    list
      .filter((d) => d.lane === lane)
      .sort(byLaneOrder)
      .forEach((d, i) => order.set(d.id, i));
  }
  return list.map((d) => (order.has(d.id) ? { ...d, lane_order: order.get(d.id) as number } : d));
}

/**
 * Where the dragged card belongs given what the pointer is over — the one place
 * that answers that question, for the mid-drag lane change and for the drop
 * alike, so the two can never disagree about it.
 *
 * `overDriverId` is the card under the pointer, or null when it is over bare lane
 * background, which means "past the last card". Returns `list` unchanged when
 * nothing would move.
 */
function reorderForDrop(
  list: Driver[],
  activeId: string,
  targetLane: LaneId,
  overDriverId: string | null
): Driver[] {
  const dragged = list.find((d) => d.id === activeId);
  if (!dragged) return list;
  const fromLane = dragged.lane as LaneId;

  const lane = list.filter((d) => d.lane === targetLane).sort(byLaneOrder);
  const oldIndex = lane.findIndex((d) => d.id === activeId);
  let placed: Driver[];

  if (oldIndex === -1) {
    // Arriving in a lane the card isn't in yet: it takes the hovered card's slot,
    // pushing that card and everything after it down.
    const overIndex = overDriverId ? lane.findIndex((d) => d.id === overDriverId) : -1;
    const at = overIndex === -1 ? lane.length : overIndex;
    placed = [...lane.slice(0, at), dragged, ...lane.slice(at)];
  } else {
    // Already in this lane — its home lane, or one it was moved into earlier in
    // the same drag. Either way it is a reorder, and arrayMove is exactly what
    // dnd-kit's sortable preview has been showing (the hovered card's slot going
    // up, just past it going down), so the indices have to come from the lane
    // *including* the dragged card for the drop to match the preview.
    const newIndex = overDriverId ? lane.findIndex((d) => d.id === overDriverId) : lane.length - 1;
    if (newIndex === -1 || newIndex === oldIndex) return list;
    placed = arrayMove(lane, oldIndex, newIndex);
  }

  const orders = new Map(placed.map((d, i) => [d.id, i]));
  const next = list.map((d) => {
    if (d.id === activeId) {
      return { ...d, lane: targetLane, lane_order: orders.get(d.id) as number };
    }
    return orders.has(d.id) ? { ...d, lane_order: orders.get(d.id) as number } : d;
  });

  // Close the gap in whatever lane the card just came from. Harmless when it is
  // the same lane (already renumbered above).
  return fromLane === targetLane ? next : renumberLanes(next, [fromLane]);
}

export default function Board({ initialDrivers, initialDispatchers, initialLanes }: BoardProps) {
  const [drivers, setDrivers] = useState<Driver[]>(initialDrivers);
  const [dispatchers, setDispatchers] = useState<DispatcherAssignment[]>(initialDispatchers);
  const [lanes, setLanes] = useState<Lane[]>(initialLanes);
  const [showLanes, setShowLanes] = useState(false);
  const [placingOrphans, setPlacingOrphans] = useState(false);
  const [activeDriver, setActiveDriver] = useState<Driver | null>(null);
  const [checkOutDriver, setCheckOutDriver] = useState<Driver | null>(null);
  const [assignDriver, setAssignDriver] = useState<Driver | null>(null);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [checkInComplete, setCheckInComplete] = useState<{
    name: string;
    shifts: DriverShift[];
    lane: LaneId;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Search is per-browser view state (never persisted), so one dispatcher
  // searching doesn't affect what anyone else's screen shows. Matches are
  // highlighted rather than filtered out: every card stays mounted, which
  // keeps drag-reorder safe (lane_order is recomputed from rendered lists)
  // and preserves the spatial layout people rely on at a glance.
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchActive = searchQuery.trim() !== '';
  const searchMatches = useMemo(() => {
    const m = new Map<string, SearchMatchField>();
    if (!searchActive) return m;
    for (const d of drivers) {
      const field = matchDriver(d, searchQuery);
      if (field) m.set(d.id, field);
    }
    return m;
  }, [drivers, searchQuery, searchActive]);
  const search: SearchState | null = searchActive
    ? { query: searchQuery, matches: searchMatches }
    : null;

  // Open/close the below-header search row (below xl only). Closing also
  // clears the query so the board can never stay dimmed with no visible
  // search UI.
  const toggleSearchRow = () => {
    if (mobileSearchOpen || searchActive) {
      setMobileSearchOpen(false);
      setSearchQuery('');
    } else {
      setMobileSearchOpen(true);
    }
  };

  // Suppress real-time refetch while dragging to avoid flicker
  const isDraggingRef = useRef(false);

  // Track the true source lane at drag-start — handleDragOver mutates `drivers` state
  // optimistically, so by the time handleDragEnd runs, draggedDriver.lane already
  // reflects the target lane. Without this ref, cross-lane moves into empty lanes
  // are misclassified as within-lane no-ops and never persisted.
  const dragSourceLaneRef = useRef<LaneId | null>(null);

  // The columns the board shows, in saved order — pinned for the duration of a
  // drag (ridecrew's staging-board pattern): a lane hidden or added on another
  // device mid-drag would shift every drop rect dnd-kit measured at drag start.
  // The realtime guard already stops *this* device refetching lanes mid-drag;
  // the pin covers state that changed just before the guard engaged.
  const liveLanes = useMemo(() => activeLanes(lanes), [lanes]);
  const pinnedLanesRef = useRef<Lane[] | null>(null);
  const renderedLanes = (activeDriver && pinnedLanesRef.current) || liveLanes;
  const renderedLaneIds = useMemo(
    () => new Set(renderedLanes.map((l) => l.id)),
    [renderedLanes]
  );

  const supabase = createClient();

  // Mouse drags after 8px of movement (prevents conflict with click-to-expand);
  // touch drags after a 200ms press-and-hold so quick swipes keep scrolling the
  // board/lanes instead of picking up a card. Split sensors (not PointerSensor)
  // so a touch scroll can never race the mouse-style distance activation.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 15 } })
  );

  // Mobile snap-board: track which lane is in view so LaneTabs can highlight it
  const boardRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const [activeLaneIdx, setActiveLaneIdx] = useState(0);

  const isLgUp = useLgUp();
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [laneWidths, setLaneWidths] = useState<LaneWidthsPref>({ mode: 'auto' });
  const [isResizing, setIsResizing] = useState(false);
  const [rowsPerCol, setRowsPerCol] = useState(DEFAULT_ROWS_PER_COL);
  const [colBudget, setColBudget] = useState(DEFAULT_COL_BUDGET);

  // Saved prefs load after mount so the server render and the first client
  // render agree on the defaults (same mount guard ThemeToggle uses).
  useEffect(() => {
    setZoom(loadZoom());
  }, []);

  // Saved widths are only valid for the exact lane set on screen, so re-check
  // whenever it changes — loadLaneWidths falls back to auto unless every
  // rendered lane has a sane saved weight, which resets stale widths after a
  // lane is added or hidden mid-session too. Keyed on the joined id list (ids
  // are [a-z0-9_] slugs, so ',' can never appear inside one); the live set,
  // not the drag-pinned one, since prefs should follow reality.
  const liveLaneKey = liveLanes.map((l) => l.id).join(',');
  useEffect(() => {
    setLaneWidths(loadLaneWidths(liveLaneKey ? liveLaneKey.split(',') : []));
  }, [liveLaneKey]);

  // Lanes are equal-height flex siblings, so one lane's list height tells us how
  // many cards fit in a single column — which is what decides how many columns a
  // crowded lane wants; the board's own width decides how many it can have.
  // clientHeight/clientWidth (not getBoundingClientRect) because they are in
  // layout pixels: zooming the board out gives it more layout space to fill,
  // which is exactly the effect we want reflected here. Re-runs on zoom change
  // because that resizes the board in layout space without necessarily changing
  // its on-screen size, so the observer alone would not always fire.
  useEffect(() => {
    const board = boardRef.current;
    const list = board?.querySelector<HTMLElement>('[data-lane] .lane-scroll');
    if (!board || !list) return;
    const laneCount = renderedLanes.length;
    const measure = () => {
      const contentH = list.clientHeight - LANE_LIST_PADDING_PX;
      setRowsPerCol(Math.max(1, Math.floor((contentH + CARD_GAP_PX) / (CARD_ROW_PX + CARD_GAP_PX))));
      setColBudget(columnBudget(board.clientWidth, laneCount));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    ro.observe(board);
    return () => ro.disconnect();
  }, [zoom, renderedLanes.length]);

  // Lane elements only — the divider siblings between them are not lanes, so
  // indexing boardRef.children directly would misalign the LaneTabs mapping.
  const laneElements = () =>
    Array.from(boardRef.current?.querySelectorAll<HTMLElement>('[data-lane]') ?? []);

  const handleBoardScroll = () => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = boardRef.current;
      if (!el) return;
      const lanes = laneElements();
      const x = el.scrollLeft;
      let best = 0;
      let bestDist = Infinity;
      // offsetLeft is layout position (scroll-independent), both measured from
      // the same offsetParent — the nearest lane to the current scroll wins.
      lanes.forEach((lane, i) => {
        const dist = Math.abs(lane.offsetLeft - el.offsetLeft - x);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      setActiveLaneIdx(best);
    });
  };

  const scrollToLane = (idx: number) => {
    const el = boardRef.current;
    const lane = laneElements()[idx];
    if (!el || !lane) return;
    el.scrollTo({ left: lane.offsetLeft - el.offsetLeft, behavior: 'smooth' });
  };

  // An empty result set is ambiguous: a genuinely clear board, or RLS
  // filtering out every row because this tab's session died. Only apply the
  // empty case while actually signed in — keeping the last-known board plus
  // the failed-write toasts beats silently blanking a dispatch screen
  // mid-shift. getSession reads local state, so the check is free.
  const emptyIsReal = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session !== null;
  }, []);

  const fetchDrivers = useCallback(async () => {
    if (isDraggingRef.current) return;
    const { data } = await supabase
      .from('drivers')
      .select('*')
      .is('checked_out_at', null)
      // checked_in_at breaks ties deterministically — without it, two rows that
      // briefly share a lane_order can swap places between refetches.
      .order('lane_order', { ascending: true })
      .order('checked_in_at', { ascending: true });
    if (!data) return;
    if (data.length === 0 && !(await emptyIsReal())) return;
    setDrivers(data as Driver[]);
  }, [emptyIsReal]);

  const fetchDispatchers = useCallback(async () => {
    if (isDraggingRef.current) return;
    const { data } = await supabase.from('dispatcher_assignments').select('*');
    if (!data) return;
    if (data.length === 0 && !(await emptyIsReal())) return;
    setDispatchers(data as DispatcherAssignment[]);
  }, [emptyIsReal]);

  // ── REALTIME HEALTH ──
  // The subscription is this board's lifeline, and Supabase never replays the
  // events a dead socket missed — a screen with a quietly-dropped connection
  // keeps showing old pixels that read as live (the on-site "nobody is
  // refreshing" reports). So every channel reports its status here: any
  // channel leaving SUBSCRIBED marks the board down (SyncStatus surfaces it
  // after a grace period), and every (re)SUBSCRIBE refetches to close the gap
  // the outage opened.
  const channelHealthRef = useRef<Record<string, boolean>>({});
  const [realtimeDownSince, setRealtimeDownSince] = useState<number | null>(null);

  const trackChannelStatus = useCallback(
    (name: string, status: string, refetch: () => void) => {
      const healthy = status === 'SUBSCRIBED';
      channelHealthRef.current[name] = healthy;
      const allHealthy = Object.values(channelHealthRef.current).every(Boolean);
      setRealtimeDownSince((prev) => (allHealthy ? null : prev ?? Date.now()));
      if (healthy) refetch(); // reconcile whatever a dead socket missed
    },
    []
  );

  useEffect(() => {
    const channel = supabase
      .channel('drivers-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, fetchDrivers)
      .subscribe((status) => trackChannelStatus('drivers', status, fetchDrivers));
    return () => { supabase.removeChannel(channel); };
  }, [fetchDrivers, trackChannelStatus]);

  useEffect(() => {
    const channel = supabase
      .channel('dispatchers-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatcher_assignments' }, fetchDispatchers)
      .subscribe((status) => trackChannelStatus('dispatchers', status, fetchDispatchers));
    return () => { supabase.removeChannel(channel); };
  }, [fetchDispatchers, trackChannelStatus]);

  const fetchLanes = useCallback(async () => {
    if (isDraggingRef.current) return;
    const { data } = await supabase
      .from('lanes')
      .select(LANE_SELECT)
      .order('sort_order', { ascending: true });
    if (!data) return;
    if (data.length === 0 && !(await emptyIsReal())) return;
    setLanes(data as Lane[]);
  }, [emptyIsReal]);

  useEffect(() => {
    const channel = supabase
      .channel('lanes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lanes' }, fetchLanes)
      .subscribe((status) => trackChannelStatus('lanes', status, fetchLanes));
    return () => { supabase.removeChannel(channel); };
  }, [fetchLanes, trackChannelStatus]);

  // One "get fresh data now" entry point — a wake or refocus can't know what
  // changed while the device was asleep, so everything refetches.
  const fetchAll = useCallback(() => {
    void Promise.all([fetchDrivers(), fetchDispatchers(), fetchLanes()]);
  }, [fetchDrivers, fetchDispatchers, fetchLanes]);

  // A device waking from sleep must never sit on a pre-sleep board: its socket
  // died during the nap and the missed events are gone for good.
  useRefetchOnWake(fetchAll);

  // Prevention half of the same problem — the dispatch board runs on venue TVs
  // and front-desk laptops that should not sleep mid-shift in the first place.
  useWakeLock(true);

  // Drivers whose lane row is hidden or missing — legacy downtown_hotel rows,
  // or a lane hidden from another device while cards were still in it. They
  // render in no column, so surface them in the header with a one-tap rescue
  // into the first lane (ridecrew's "without a zone" chip). Strictly better
  // than the old hardcoded board, which showed such drivers nowhere at all.
  const orphans = useMemo(
    () => drivers.filter((d) => !liveLanes.some((l) => l.id === d.lane)),
    [drivers, liveLanes]
  );

  const placeOrphans = async () => {
    const target = liveLanes[0];
    if (!target || orphans.length === 0 || placingOrphans) return;
    setPlacingOrphans(true);
    const base = nextLaneOrder(drivers, target.id);
    const moves = orphans.map((d, i) => ({ id: d.id, lane_order: base + i }));
    setDrivers((prev) =>
      prev.map((d) => {
        const m = moves.find((x) => x.id === d.id);
        return m ? { ...d, lane: target.id, lane_order: m.lane_order } : d;
      })
    );
    let failed: string | null = null;
    try {
      const results = await Promise.all(
        moves.map((m) =>
          supabase
            .from('drivers')
            .update({ lane: target.id, lane_order: m.lane_order })
            .eq('id', m.id)
            .select('id')
        )
      );
      failed =
        results.find((r) => r.error)?.error?.message ??
        (results.some((r) => !r.error && (r.data?.length ?? 0) === 0)
          ? 'no rows updated; you may be signed out'
          : null);
    } finally {
      setPlacingOrphans(false);
    }
    if (failed) setToast(`Some moves didn't save (${failed}).`);
    await fetchDrivers(); // pick up the trigger-stamped lane_entered_at
  };

  // A lane's order exactly as it is rendered — and the single list the drag
  // handlers reorder against. Ordering is purely lane_order: an earlier version
  // hoisted unassigned drivers above everyone else, which silently undid any
  // drag that moved one below an assigned driver (the card sprang back to the
  // top on drop) and made the indices here disagree with what was on screen.
  const driversInLane = useCallback(
    (laneId: LaneId) => drivers.filter((d) => d.lane === laneId).sort(byLaneOrder),
    [drivers]
  );

  // Each lane's card grid: how many columns it needs, and how far down to fill
  // each one before starting the next. Crowded lanes get proportionally wider so
  // their cards wrap sideways instead of scrolling out of sight on the TV, and
  // near-empty lanes stay a single column.
  //
  // `rows` is what makes the queue read top-to-bottom then left-to-right. Spread
  // the cards over every available row instead and the grid fills row-first, so
  // the last driver lands at the foot of whichever column the count happens to
  // end on — check one person out and "the bottom" jumps to the other column.
  //
  // Column count is held still for the whole drag, because it also sets the lane
  // width: re-widening a lane mid-drag would shift it out from under the drop
  // rects dnd-kit measured when the drag began.
  //
  // Rows, though, have to keep following the live count. handleDragOver drops the
  // card into the target lane optimistically, and a grid still pinned to the old
  // count has no slot for it — with grid-auto-flow: column the surplus card
  // spills into an *implicit* extra column, squeezing every card in that lane to
  // a sliver. Rows only ever grow mid-drag, so the lane the card came from
  // doesn't reshuffle its columns behind the dispatcher.
  const frozenLayoutRef = useRef<LaneLayout | null>(null);
  const laneLayout = useMemo<LaneLayout>(() => {
    const frozen = activeDriver ? frozenLayoutRef.current : null;
    const laneIds = renderedLanes.map((l) => l.id);
    const counts = {} as Record<LaneId, number>;
    const cols = {} as Record<LaneId, number>;
    for (const lane of laneIds) {
      counts[lane] = drivers.filter((d) => d.lane === lane).length;
      cols[lane] =
        // Optional-chained per lane: with the drag pin the frozen and rendered
        // key sets always agree, but a lane shown in the same tick as a drag
        // start costs nothing to defend against.
        frozen?.[lane]?.cols ??
        Math.min(MAX_LANE_COLS, Math.max(1, Math.ceil(counts[lane] / rowsPerCol)));
    }

    // What the lanes want, reconciled with what the board can actually show.
    // Without this the minimum widths simply add up past the viewport and the
    // board scrolls sideways, hiding the last lane entirely. Columns are handed
    // back one at a time from whichever lane has the most: that lane's cards are
    // the shortest per column, so it is the one that loses the least by giving
    // one up (ties go to the emptier lane). Every lane keeps its last column.
    if (!frozen) {
      let total = laneIds.reduce((n, lane) => n + cols[lane], 0);
      while (total > colBudget) {
        const victim = laneIds.reduce((worst, lane) =>
          cols[lane] > cols[worst] ||
          (cols[lane] === cols[worst] && counts[lane] < counts[worst])
            ? lane
            : worst
        );
        if (cols[victim] <= 1) break;   // nothing left to give back
        cols[victim] -= 1;
        total -= 1;
      }
    }

    const next = {} as LaneLayout;
    for (const lane of laneIds) {
      const rows = Math.max(frozen?.[lane]?.rows ?? 1, Math.ceil(counts[lane] / cols[lane]), 1);
      next[lane] = { cols: cols[lane], rows };
    }
    if (!frozen) frozenLayoutRef.current = next;
    return next;
  }, [drivers, rowsPerCol, colBudget, activeDriver, renderedLanes]);

  // A lane is exactly as wide as the number of columns it is showing.
  const autoGrows = useMemo<LaneGrows>(() => {
    const g: LaneGrows = {};
    for (const lane of renderedLanes) g[lane.id] = laneLayout[lane.id]?.cols ?? 1;
    return g;
  }, [laneLayout, renderedLanes]);

  const effectiveGrows = laneWidths.mode === 'manual' ? laneWidths.grows : autoGrows;

  const handleLaneCommit = (grows: LaneGrows) => {
    const pref: LaneWidthsPref = { mode: 'manual', grows };
    setLaneWidths(pref);
    saveLaneWidths(pref);
  };

  const handleLaneReset = () => {
    setLaneWidths({ mode: 'auto' });
    saveLaneWidths({ mode: 'auto' });
  };

  const handleZoomChange = (next: number) => {
    setZoom(next);
    saveZoom(next);
  };

  // ── DRAG START ──
  const handleDragStart = (event: DragStartEvent) => {
    isDraggingRef.current = true;
    const driver = drivers.find((d) => d.id === event.active.id);
    if (driver) {
      // Pin the lane list before any optimistic state change (see renderedLanes).
      pinnedLanesRef.current = liveLanes;
      setActiveDriver(driver);
      dragSourceLaneRef.current = driver.lane; // capture original lane before any optimistic updates
    }
  };

  // ── DRAG CANCEL (Escape, or dnd-kit aborting a drag) ──
  // dnd-kit fires onDragCancel INSTEAD of onDragEnd for these. The board never
  // registered it, so a cancelled drag left isDraggingRef stuck true and
  // realtime refetch blocked for the rest of the session — a latent bug fixed
  // alongside the lane pinning, which needs the same cleanup.
  const handleDragCancel = () => {
    setActiveDriver(null);
    pinnedLanesRef.current = null;
    dragSourceLaneRef.current = null;
    isDraggingRef.current = false;
  };

  // ── DRAG OVER (live preview while hovering) ──
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    if (activeId === overId) return;

    const draggedDriver = drivers.find((d) => d.id === activeId);
    if (!draggedDriver) return;

    const isOverLane = renderedLaneIds.has(overId);
    const overDriver = !isOverLane ? drivers.find((d) => d.id === overId) : null;
    const targetLane = (isOverLane ? overId : overDriver?.lane) as LaneId | undefined;
    if (!targetLane) return;

    // Only a genuine lane change moves the card here. Once it is in the lane, it
    // joins that lane's SortableContext and dnd-kit previews any further reorder
    // with transforms — the same machinery that has always driven within-lane
    // drags — while handleDragEnd derives the committed index from `over`.
    //
    // Reordering within the lane on every dragOver instead does NOT work: it
    // relayouts the cards, which moves the very rects dnd-kit hit-tests against,
    // so hovering one card can flip the insert point between "before" and "after"
    // it on alternating events and never settle (React bails out with "Maximum
    // update depth exceeded"). Moving once per lane change keeps the pointer →
    // `over` mapping stable for the rest of the drag.
    if (draggedDriver.lane === targetLane) return;

    setDrivers((prev) => reorderForDrop(prev, activeId, targetLane, overDriver ? overId : null));
  };

  // ── DRAG END ──
  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDriver(null);
    pinnedLanesRef.current = null;
    const { active, over } = event;

    // Always clear the source-lane ref, even if we return early
    const sourceLane = dragSourceLaneRef.current;
    dragSourceLaneRef.current = null;

    // Every exit path has to release the realtime-refetch guard.
    const releaseGuard = () => {
      isDraggingRef.current = false;
    };

    if (!over || !sourceLane) return releaseGuard();

    const activeId = active.id as string;
    const overId = over.id as string;

    const draggedDriver = drivers.find((d) => d.id === activeId);
    if (!draggedDriver) return releaseGuard();

    const isOverLane = renderedLaneIds.has(overId);
    const overDriver = !isOverLane ? drivers.find((d) => d.id === overId) : null;
    const targetLane = (isOverLane ? overId : overDriver?.lane) as LaneId;
    if (!targetLane) return releaseGuard();

    // The release point decides the final position, cross-lane exactly as much as
    // within-lane. Re-deriving it here from `over` rather than trusting the order
    // handleDragOver left behind also makes the drop immune to a mouse-up that
    // beats the last preview render to the finish line.
    const placed = reorderForDrop(drivers, activeId, targetLane, overDriver ? overId : null);
    const crossLane = sourceLane !== targetLane;

    // A within-lane drop that changed nothing needs no write. A cross-lane one
    // always does, even when handleDragOver already previewed this exact order.
    if (placed === drivers && !crossLane) return releaseGuard();

    // Both lanes end up densely numbered — the target already is, and the source
    // lane needs it in case the card wandered through other lanes on the way.
    const renumbered = renumberLanes(placed, [sourceLane, targetLane]);

    // Only a real lane change restarts the timer, matching the DB trigger. A
    // card dragged out and back before the drop lands on sourceLane === targetLane
    // here and writes its original lane, so neither side resets it.
    const updatedDrivers = crossLane ? stampLaneEntry(renumbered, activeId) : renumbered;

    setDrivers(updatedDrivers);

    // Persist all drivers in the affected lane(s).
    // We intentionally avoid diffing against initialDrivers (the server-rendered prop)
    // because it never updates during a session — meaning a second drag that results in
    // the same order as the original server snapshot would incorrectly be skipped.
    const affectedLanes = sourceLane === targetLane
      ? [sourceLane]
      : [sourceLane, targetLane];

    const toSave = updatedDrivers.filter((d) =>
      affectedLanes.includes(d.lane as LaneId)
    );

    // A failed write here used to fail in silence: the optimistic order stayed
    // on screen and only "moved back" on the next refresh, which on site read
    // as the board undoing people's work. Say so and resync immediately.
    // `.select('id')` is how a dead session shows up: RLS makes an anon UPDATE
    // match zero rows with NO error, so returned-row count is the only signal.
    let failed: string | null = null;
    try {
      const results = await Promise.all(
        toSave.map((d) =>
          supabase
            .from('drivers')
            .update({ lane: d.lane, lane_order: d.lane_order })
            .eq('id', d.id)
            .select('id')
        )
      );
      failed =
        results.find((r) => r.error)?.error?.message ??
        (results.some((r) => !r.error && (r.data?.length ?? 0) === 0)
          ? 'no rows updated; you may be signed out'
          : null);
    } catch (e) {
      failed = e instanceof Error ? e.message : 'network error';
    } finally {
      // Hold the guard until every row is written. Each update fires its own
      // realtime event, and a refetch part-way through the burst would read a
      // half-applied ordering and visibly snap cards back to where they were.
      // On success the optimistic state already matches what was written, so
      // there is nothing to reconcile — the next change from anyone refetches.
      releaseGuard();
    }
    if (failed) {
      setToast(`Move didn't save (${failed}). Refreshing the board.`);
      await fetchDrivers();
    }
  };

  // ── CHECK OUT ──
  const handleCheckOut = async () => {
    if (!checkOutDriver) return;
    const { error } = await supabase
      .from('drivers')
      .update({ checked_out_at: new Date().toISOString() })
      .eq('id', checkOutDriver.id);
    if (!error) {
      setToast(`Check-out successful: ${checkOutDriver.name} removed.`);
      await fetchDrivers();
    }
    setCheckOutDriver(null);
  };

  // ── UPDATE NOTES ──
  const handleUpdateNotes = async (driver: Driver, notes: string) => {
    await supabase
      .from('drivers')
      .update({ notes: notes || null })
      .eq('id', driver.id);
    await fetchDrivers();
  };

  // ── SET AWAY ──
  const handleSetAway = async (driver: Driver, reason: AwayReason | null) => {
    await supabase
      .from('drivers')
      .update({
        status: reason ? 'away' : 'assigned',
        away_reason: reason,
      })
      .eq('id', driver.id);
    await fetchDrivers();
  };

  // ── SET LOCATION STATUS ──
  const handleSetLocationStatus = async (driver: Driver, status: LocationStatus | null) => {
    setDrivers((prev) =>
      prev.map((d) => (d.id === driver.id ? { ...d, location_status: status } : d))
    );
    const { data, error } = await supabase
      .from('drivers')
      .update({ location_status: status })
      .eq('id', driver.id)
      .select('id'); // zero rows back = RLS filtered the write (dead session)
    if (error || (data?.length ?? 0) === 0) {
      setToast(
        `Status didn't save (${error?.message ?? 'you may be signed out'}). Refreshing the board.`
      );
      await fetchDrivers();
    }
  };

  // ── MOVE TO LANE (tap alternative to drag — used by the mobile card UI) ──
  const handleMoveToLane = async (driver: Driver, lane: LaneId) => {
    if (driver.lane === lane) return;
    // Append at the end of the target lane; gaps left in the source lane's
    // ordering are harmless (order is only used relatively).
    const nextOrder = nextLaneOrder(drivers, lane);
    setDrivers((prev) =>
      stampLaneEntry(
        prev.map((d) => (d.id === driver.id ? { ...d, lane, lane_order: nextOrder } : d)),
        driver.id
      )
    );
    const { data, error } = await supabase
      .from('drivers')
      .update({ lane, lane_order: nextOrder })
      .eq('id', driver.id)
      .select('id'); // zero rows back = RLS filtered the write (dead session)
    if (error || (data?.length ?? 0) === 0) {
      setToast(
        `Move didn't save (${error?.message ?? 'you may be signed out'}). Refreshing the board.`
      );
      await fetchDrivers();
    }
  };

  // ── ASSIGN ──
  // Walkies are no longer handed out, so the car number alone decides whether a
  // driver counts as assigned. walkie_number is left out of the payload rather
  // than nulled, so any historical value on the row survives.
  const handleAssign = async (carNumber: string) => {
    if (!assignDriver) return;
    await supabase
      .from('drivers')
      .update({
        car_number: carNumber || null,
        status: carNumber ? 'assigned' : 'unassigned',
      })
      .eq('id', assignDriver.id);
    await fetchDrivers();
    setAssignDriver(null);
  };

  // ── CHECK IN ──
  const handleCheckIn = async (data: CheckInData) => {
    // A fresh arrival always joins the back of the queue.
    const nextOrder = nextLaneOrder(drivers, data.lane);

    const { error } = await supabase.from('drivers').insert({
      roster_id: data.rosterId,
      name: data.name,
      phone: data.phone,
      role: data.role,
      shift_type: data.shiftType,
      shift_time: data.shiftTime,
      shifts: data.shifts,
      lane: data.lane,
      lane_order: nextOrder,
      car_number: data.carNumber || null,
      status: data.carNumber ? 'assigned' : 'unassigned',
    });

    if (error) {
      // Previously a failed insert closed nothing and said nothing, so the
      // dispatcher was left staring at a filled-in form with no idea why.
      setToast(`Check-in failed: ${error.message}`);
      return;
    }

    setShowCheckIn(false);
    setCheckInComplete({ name: data.name, shifts: data.shifts, lane: data.lane });
    await fetchDrivers();
  };

  const getDispatcher = (laneId: string) =>
    dispatchers.find((d) => d.lane === laneId)?.dispatcher_name || '';

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={(args) => {
        // pointerWithin checks if the pointer is inside any droppable rect (fixes top-of-lane drops)
        const pointerCollisions = pointerWithin(args);
        return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
      }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      // dnd-kit adjusts its cached drop rects by raw scroll deltas, which are in
      // unzoomed pixels — so edge auto-scroll during a drag would skew hit
      // testing at any zoom but 100%. At lg+ every lane is on screen anyway.
      autoScroll={!isLgUp || zoom === DEFAULT_ZOOM}
    >
      <div
        className="flex flex-col h-dvh p-2 gap-2 lg:p-3 lg:gap-3 relative"
        style={{ backgroundColor: 'var(--surface-page)', '--board-zoom': zoom / 100 } as React.CSSProperties}
      >

        {/* Header — compact single row on phones, full title from md up.
            At xl+ both side sections become equal flex halves (flex-1 basis-0)
            so the title stays truly centred while the right cluster grows to
            fit the inline search input; below xl they keep natural widths
            because the phone/tablet header has no room to spare. */}
        <div
          className="flex items-center justify-between gap-2 px-3 lg:px-5 py-2 rounded-lg flex-shrink-0 border"
          style={{ backgroundColor: 'var(--surface-panel)', borderColor: 'var(--brand)' }}
        >
          <div className="flex items-center xl:flex-1 xl:basis-0">
            <NboLogo width={180} height={65} className="w-24 lg:w-[180px]" />
          </div>
          <h1 className="hidden md:block flex-shrink-0 text-base lg:text-xl font-bold text-fg-strong tracking-wide text-center whitespace-nowrap">
            Transportation Dispatch{' '}
            <span className="font-light text-fg-muted">—</span>{' '}
            <span style={{ color: 'var(--brand)' }}>Live Status</span>
          </h1>
          <div className="flex items-center justify-end gap-1.5 lg:gap-3 xl:flex-1 xl:basis-0">
            {/* Search entry points by breakpoint: inline input at xl+; header
                icon toggle for lg–xl (LaneTabs is hidden there); below lg the
                toggle lives in the LaneTabs strip to keep the header uncrowded. */}
            <SearchBox
              value={searchQuery}
              onChange={setSearchQuery}
              matchCount={searchActive ? searchMatches.size : null}
              enableSlashShortcut
              className={`hidden xl:flex flex-1 min-w-[80px] transition-all ${
                searchActive ? 'max-w-[240px]' : 'max-w-[150px] focus-within:max-w-[240px]'
              }`}
            />
            <button
              type="button"
              aria-label={mobileSearchOpen || searchActive ? 'Close search' : 'Search drivers'}
              onClick={toggleSearchRow}
              className="hidden lg:flex xl:hidden p-1.5 rounded border border-edge transition-colors"
              style={
                mobileSearchOpen || searchActive
                  ? { color: 'var(--brand)', borderColor: 'var(--brand)' }
                  : { color: 'var(--fg-soft)' }
              }
            >
              <Search size={16} />
            </button>
            {/* Rescue chip for drivers stranded in a hidden/deleted lane — rare,
                so it only ever renders while there is something to rescue. */}
            {orphans.length > 0 && liveLanes[0] && (
              <button
                type="button"
                onClick={placeOrphans}
                disabled={placingOrphans}
                title={orphans.map((d) => d.name).join(', ')}
                className="px-2 lg:px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--status-warn-bg)',
                  color: 'var(--status-warn-fg)',
                  border: '1px solid #B45309',
                }}
              >
                {/* The destination suffix costs ~110px and pushes the clock out
                    of the header below 2xl — the tap does the same thing either
                    way, so only spell it out where there is room. */}
                ⚠ {orphans.length} in hidden lanes
                <span className="hidden 2xl:inline"> → {liveLanes[0].label}</span>
              </button>
            )}
            <ZoomControl value={zoom} onChange={handleZoomChange} />
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setShowLanes(true)}
              className="px-2 lg:px-3 py-1.5 rounded-lg text-xs font-bold tracking-widest uppercase text-fg-soft hover:text-fg-strong transition-colors whitespace-nowrap"
              style={{ border: '1px solid var(--edge)' }}
            >
              Lanes
            </button>
            <Link
              href="/import"
              className="px-2 lg:px-3 py-1.5 rounded-lg text-xs font-bold tracking-widest uppercase text-fg-soft hover:text-fg-strong transition-colors whitespace-nowrap"
              style={{ border: '1px solid var(--edge)' }}
            >
              Import
            </Link>
            <button
              onClick={() => setShowCheckIn(true)}
              className="px-2.5 lg:px-4 py-1.5 rounded-lg text-xs font-black tracking-widest uppercase text-white transition-opacity hover:opacity-80 whitespace-nowrap"
              style={{ backgroundColor: 'var(--brand)', border: '1px solid var(--brand)' }}
            >
              + Check In
            </button>
            <SyncStatus downSince={realtimeDownSince} />
            <LiveClock className="text-lg lg:text-2xl" />
          </div>
        </div>

        {/* The loud half of the staleness story — the header pill is easy to
            miss from across a room, this isn't. Renders nothing while live. */}
        <StaleBanner downSince={realtimeDownSince} />

        {/* Lane switcher — phones/tablets only */}
        <LaneTabs
          lanes={renderedLanes}
          counts={renderedLanes.map((l) => driversInLane(l.id).length)}
          matchCounts={
            search
              ? renderedLanes.map((l) => driversInLane(l.id).filter((d) => searchMatches.has(d.id)).length)
              : undefined
          }
          activeIdx={activeLaneIdx}
          onSelect={scrollToLane}
          searchOn={mobileSearchOpen || searchActive}
          onToggleSearch={toggleSearchRow}
        />

        {/* Full-width search row for headers too narrow for the inline input.
            Also shown whenever a query is active so shrinking the window can
            never leave the board dimmed with no visible search UI. */}
        {(mobileSearchOpen || searchActive) && (
          <div className="xl:hidden flex-shrink-0">
            <SearchBox
              value={searchQuery}
              onChange={setSearchQuery}
              matchCount={searchActive ? searchMatches.size : null}
              autoFocus
              onDismiss={() => setMobileSearchOpen(false)}
              className="flex w-full"
            />
          </div>
        )}

        {/* Board — swipeable snap lanes below lg; at lg+ the lanes are weighted by
            how crowded they are and separated by draggable dividers, which take
            over from the flex gap (hence gap-2 lg:gap-0). */}
        <div
          ref={boardRef}
          onScroll={handleBoardScroll}
          className={`board-scroll flex flex-1 gap-2 lg:gap-0 min-h-0 pb-6 ${
            activeDriver ? 'board-dragging' : ''
          } ${isResizing ? 'board-resizing' : ''}`}
        >
          {renderedLanes.length === 0 && (
            // Only reachable when the lanes fetch failed (e.g. local dev against
            // a database without the lanes migration) — LanesModal refuses to
            // hide the last active lane.
            <div className="flex-1 flex items-center justify-center">
              <span className="text-sm text-fg-faint uppercase tracking-widest">
                No lanes configured. Open Lanes above to add one.
              </span>
            </div>
          )}
          {renderedLanes.map((lane, i) => (
            <Fragment key={lane.id}>
              {i > 0 && (
                <LaneResizer
                  leftLane={renderedLanes[i - 1].id}
                  rightLane={lane.id}
                  leftLabel={renderedLanes[i - 1].label}
                  rightLabel={lane.label}
                  grows={effectiveGrows}
                  zoom={zoom}
                  boardRef={boardRef}
                  // Previewing through the same setter as the commit means the
                  // first drag simply captures the current auto weights, so the
                  // lanes never jump when switching to manual widths.
                  onPreview={(grows) => setLaneWidths({ mode: 'manual', grows })}
                  onCommit={handleLaneCommit}
                  onReset={handleLaneReset}
                  onActiveChange={setIsResizing}
                />
              )}
              <SwimLane
                lane={lane}
                lanes={lanes}
                drivers={driversInLane(lane.id)}
                // Only lanes with a dispatcher_assignments row ever show a name
                // (today: uptown_hotel — that table has its own lane CHECK).
                dispatcher={getDispatcher(lane.id) || undefined}
                onCheckOut={setCheckOutDriver}
                onAssign={setAssignDriver}
                onUpdateNotes={handleUpdateNotes}
                onSetAway={handleSetAway}
                onSetLocationStatus={handleSetLocationStatus}
                onMoveToLane={handleMoveToLane}
                search={search}
                gridMode={isLgUp}
                // Width weight and column count are the same number, so a lane
                // is always exactly as wide as the columns it is showing.
                // Manual drags change the weight only — never the grid itself.
                style={
                  {
                    '--lane-grow': effectiveGrows[lane.id] ?? 1,
                    '--lane-cols': laneLayout[lane.id]?.cols ?? 1,
                    '--lane-rows': laneLayout[lane.id]?.rows ?? 1,
                  } as React.CSSProperties
                }
                className="snap-start flex-none w-[86vw] sm:w-[46vw] md:w-[31.5vw] lg:w-auto"
              />
            </Fragment>
          ))}
        </div>
        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-1.5 pointer-events-none">
          <form action={logout} className="pointer-events-auto">
            <button
              type="submit"
              className="text-[10px] font-bold uppercase tracking-widest text-fg-ghost hover:text-fg-muted transition-colors"
            >
              Sign Out
            </button>
          </form>
          <p className="text-[10px] text-fg-ghost tracking-wide">
            Designed &amp; built by{' '}
            <a
              href="https://www.linkedin.com/in/hasankanjee"
              target="_blank"
              rel="noopener noreferrer"
              className="text-fg-faint hover:text-fg-soft transition-colors underline underline-offset-2 pointer-events-auto"
            >
              Hasan Kanjee
            </a>
          </p>
        </div>
      </div>

      {/* Drag overlay — ghost card following cursor */}
      <DragOverlay>
        {activeDriver && (
          // The overlay renders outside the zoomed board, so it carries its own
          // copy of the zoom to stay the same size as the card it came from.
          <div className="overlay-zoom" style={{ '--board-zoom': zoom / 100 } as React.CSSProperties}>
            <DriverCard
              driver={activeDriver}
              lanes={lanes}
              onCheckOut={() => {}}
              onAssign={() => {}}
              onUpdateNotes={() => {}}
              onSetAway={() => {}}
              onSetLocationStatus={() => {}}
              onMoveToLane={() => {}}
              isDragOverlay
            />
          </div>
        )}
      </DragOverlay>

      {/* Modals & Toast — rendered via Portal to escape overflow:hidden/stacking context */}
      <Portal>
        {showCheckIn && (
          <CheckInModal
            activeDrivers={drivers}
            lanes={lanes}
            onConfirm={handleCheckIn}
            onCancel={() => setShowCheckIn(false)}
          />
        )}
        {checkInComplete && (
          <CheckInCompleteModal
            name={checkInComplete.name}
            shifts={checkInComplete.shifts}
            laneLabel={laneLabel(lanes, checkInComplete.lane)}
            onDone={() => setCheckInComplete(null)}
          />
        )}
        {showLanes && (
          <LanesModal
            lanes={lanes}
            drivers={drivers}
            onRefresh={fetchLanes}
            onClose={() => setShowLanes(false)}
          />
        )}
        {checkOutDriver && (
          <CheckOutModal
            driver={checkOutDriver}
            onConfirm={handleCheckOut}
            onCancel={() => setCheckOutDriver(null)}
          />
        )}
        {assignDriver && (
          <AssignModal
            driver={assignDriver}
            activeDrivers={drivers}
            onConfirm={handleAssign}
            onCancel={() => setAssignDriver(null)}
          />
        )}
        {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      </Portal>
    </DndContext>
  );
}
