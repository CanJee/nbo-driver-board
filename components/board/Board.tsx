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
import { AwayReason, Driver, DriverShift, LaneId, LocationStatus, MAIN_LANES } from '@/lib/types';
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
import SwimLane from './SwimLane';
import LaneTabs from './LaneTabs';
import LaneResizer from './LaneResizer';
import ZoomControl from './ZoomControl';
import SearchBox from './SearchBox';
import LiveClock from './LiveClock';
import DriverCard from '@/components/cards/DriverCard';
import CheckOutModal from '@/components/modals/CheckOutModal';
import AssignModal from '@/components/modals/AssignModal';
import CheckInModal, { CheckInData } from '@/components/modals/CheckInModal';
import CheckInCompleteModal from '@/components/modals/CheckInCompleteModal';
import Toast from '@/components/ui/Toast';
import Portal from '@/components/ui/Portal';
import NboLogo from '@/components/ui/NboLogo';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { logout } from '@/app/login/actions';

interface DispatcherAssignment {
  lane: string;
  dispatcher_name: string;
}

interface BoardProps {
  initialDrivers: Driver[];
  initialDispatchers: DispatcherAssignment[];
}

const ALL_LANES: LaneId[] = [...MAIN_LANES, 'meals'];

// Rough size of one collapsed card row (min-h-[60px] + borders) and the gap
// between cards — used only to estimate how many cards fit in a lane column.
const CARD_ROW_PX = 62;
const CARD_GAP_PX = 6;
// The lane list's p-2, top + bottom (mirrors --lane-chrome in globals.css).
const LANE_LIST_PADDING_PX = 16;
// Accurate for a 1080p TV, so the server-rendered first paint already has
// sensible lane widths; the ResizeObserver refines it right after mount.
const DEFAULT_ROWS_PER_COL = 12;
// A single very full lane shouldn't be allowed to starve the other four.
const MAX_LANE_GROW = 3;

const byLaneOrder = (a: Driver, b: Driver) => a.lane_order - b.lane_order;

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

export default function Board({ initialDrivers, initialDispatchers }: BoardProps) {
  const [drivers, setDrivers] = useState<Driver[]>(initialDrivers);
  const [dispatchers, setDispatchers] = useState<DispatcherAssignment[]>(initialDispatchers);
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

  // Saved prefs load after mount so the server render and the first client
  // render agree on the defaults (same mount guard ThemeToggle uses).
  useEffect(() => {
    setZoom(loadZoom());
    setLaneWidths(loadLaneWidths(ALL_LANES));
  }, []);

  // Lanes are equal-height flex siblings, so one lane's list height tells us how
  // many cards fit in a single column — which is what decides how many columns a
  // crowded lane needs. clientHeight (not getBoundingClientRect) because it is in
  // layout pixels: zooming the board out gives a lane more layout height to fill,
  // which is exactly the effect we want reflected here. Re-runs on zoom change
  // because that resizes the lane in layout space without necessarily changing
  // its on-screen size, so the observer alone would not always fire.
  useEffect(() => {
    const list = boardRef.current?.querySelector<HTMLElement>('[data-lane] .lane-scroll');
    if (!list) return;
    const measure = () => {
      const contentH = list.clientHeight - LANE_LIST_PADDING_PX;
      setRowsPerCol(Math.max(1, Math.floor((contentH + CARD_GAP_PX) / (CARD_ROW_PX + CARD_GAP_PX))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [zoom]);

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
    if (data) setDrivers(data as Driver[]);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('drivers-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, fetchDrivers)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchDrivers]);

  useEffect(() => {
    const channel = supabase
      .channel('dispatchers-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatcher_assignments' }, async () => {
        const { data } = await supabase.from('dispatcher_assignments').select('*');
        if (data) setDispatchers(data as DispatcherAssignment[]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // A lane's order exactly as it is rendered — and the single list the drag
  // handlers reorder against. Ordering is purely lane_order: an earlier version
  // hoisted unassigned drivers above everyone else, which silently undid any
  // drag that moved one below an assigned driver (the card sprang back to the
  // top on drop) and made the indices here disagree with what was on screen.
  const driversInLane = useCallback(
    (laneId: LaneId) => drivers.filter((d) => d.lane === laneId).sort(byLaneOrder),
    [drivers]
  );

  // How many card columns each lane wants. Crowded lanes get proportionally
  // wider so their cards wrap into extra columns instead of scrolling out of
  // sight on the TV, and near-empty lanes shrink back to a single column.
  // Frozen while a card is in flight: handleDragOver moves cards between lanes
  // optimistically, and re-weighting mid-drag would animate the lanes out from
  // under the drop rects dnd-kit measured when the drag began.
  const frozenGrowsRef = useRef<LaneGrows | null>(null);
  const autoGrows = useMemo<LaneGrows>(() => {
    if (activeDriver && frozenGrowsRef.current) return frozenGrowsRef.current;
    const next: LaneGrows = {};
    for (const lane of ALL_LANES) {
      const count = drivers.filter((d) => d.lane === lane).length;
      next[lane] = Math.min(MAX_LANE_GROW, Math.max(1, Math.ceil(count / rowsPerCol)));
    }
    frozenGrowsRef.current = next;
    return next;
  }, [drivers, rowsPerCol, activeDriver]);

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
      setActiveDriver(driver);
      dragSourceLaneRef.current = driver.lane; // capture original lane before any optimistic updates
    }
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

    const isOverLane = (ALL_LANES as string[]).includes(overId);
    const overDriver = !isOverLane ? drivers.find((d) => d.id === overId) : null;
    const targetLane = (isOverLane ? overId : overDriver?.lane) as LaneId | undefined;

    if (!targetLane || draggedDriver.lane === targetLane) return;

    // Optimistically move the card into the target lane at the hovered position,
    // so the live preview matches where the drop will actually put it.
    setDrivers((prev) => {
      const target = prev.filter((d) => d.lane === targetLane).sort(byLaneOrder);
      const overIndex = overDriver ? target.findIndex((d) => d.id === overId) : -1;
      const insertAt = overIndex === -1 ? target.length : overIndex;

      const placed = [
        ...target.slice(0, insertAt),
        { ...draggedDriver, lane: targetLane },
        ...target.slice(insertAt),
      ];
      const orders = new Map(placed.map((d, i) => [d.id, i]));

      // The source lane keeps its old numbering (now with a gap, which is
      // harmless — order is only ever read relatively); handleDragEnd renumbers
      // both lanes densely before persisting.
      return prev.map((d) => {
        if (d.id === activeId) {
          return { ...d, lane: targetLane, lane_order: orders.get(d.id) as number };
        }
        return orders.has(d.id) ? { ...d, lane_order: orders.get(d.id) as number } : d;
      });
    });
  };

  // ── DRAG END ──
  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDriver(null);
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

    const isOverLane = (ALL_LANES as string[]).includes(overId);
    const overDriver = !isOverLane ? drivers.find((d) => d.id === overId) : null;
    const targetLane = (isOverLane ? overId : overDriver?.lane) as LaneId;
    if (!targetLane) return releaseGuard();

    let updatedDrivers: Driver[];

    if (sourceLane === targetLane) {
      // Within-lane reorder. Indices must come from driversInLane — the order
      // actually on screen — or the drop lands somewhere the dispatcher didn't aim.
      const laneDrivers = driversInLane(sourceLane);
      const oldIndex = laneDrivers.findIndex((d) => d.id === activeId);
      const newIndex = overDriver
        ? laneDrivers.findIndex((d) => d.id === overId)
        : laneDrivers.length - 1;

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return releaseGuard();

      const reordered = arrayMove(laneDrivers, oldIndex, newIndex).map((d, i) => ({
        ...d,
        lane_order: i,
      }));
      const byId = new Map(reordered.map((d) => [d.id, d]));
      updatedDrivers = drivers.map((d) => byId.get(d.id) ?? d);
    } else {
      // Cross-lane move — handleDragOver already placed the card, so just close
      // the gap it left behind in the source lane.
      updatedDrivers = renumberLanes(drivers, [sourceLane, targetLane]);
    }

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

    try {
      await Promise.all(
        toSave.map((d) =>
          supabase
            .from('drivers')
            .update({ lane: d.lane, lane_order: d.lane_order })
            .eq('id', d.id)
        )
      );
    } finally {
      // Hold the guard until every row is written. Each update fires its own
      // realtime event, and a refetch part-way through the burst would read a
      // half-applied ordering and visibly snap cards back to where they were.
      // Our optimistic state already matches what was written, so there is
      // nothing to reconcile here — the next change from anyone refetches.
      releaseGuard();
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
    await supabase
      .from('drivers')
      .update({ location_status: status })
      .eq('id', driver.id);
  };

  // ── MOVE TO LANE (tap alternative to drag — used by the mobile card UI) ──
  const handleMoveToLane = async (driver: Driver, lane: LaneId) => {
    if (driver.lane === lane) return;
    // Append at the end of the target lane; gaps left in the source lane's
    // ordering are harmless (order is only used relatively).
    const nextOrder = drivers.filter((d) => d.lane === lane).length;
    setDrivers((prev) =>
      prev.map((d) => (d.id === driver.id ? { ...d, lane, lane_order: nextOrder } : d))
    );
    await supabase
      .from('drivers')
      .update({ lane, lane_order: nextOrder })
      .eq('id', driver.id);
  };

  // ── ASSIGN ──
  const handleAssign = async (walkieNumber: string, carNumber: string) => {
    if (!assignDriver) return;
    await supabase
      .from('drivers')
      .update({
        walkie_number: walkieNumber || null,
        car_number: carNumber || null,
        status: walkieNumber || carNumber ? 'assigned' : 'unassigned',
      })
      .eq('id', assignDriver.id);
    await fetchDrivers();
    setAssignDriver(null);
  };

  // ── CHECK IN ──
  const handleCheckIn = async (data: CheckInData) => {
    const laneDrivers = drivers.filter((d) => d.lane === data.lane);
    const nextOrder = laneDrivers.length;

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
      walkie_number: data.walkieNumber || null,
      car_number: data.carNumber || null,
      status: data.walkieNumber || data.carNumber ? 'assigned' : 'unassigned',
    });

    if (!error) {
      setShowCheckIn(false);
      setCheckInComplete({ name: data.name, shifts: data.shifts, lane: data.lane });
      await fetchDrivers();
    }
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
            <ZoomControl value={zoom} onChange={handleZoomChange} />
            <ThemeToggle />
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
            <LiveClock className="text-lg lg:text-2xl" />
          </div>
        </div>

        {/* Lane switcher — phones/tablets only */}
        <LaneTabs
          lanes={ALL_LANES}
          counts={ALL_LANES.map((l) => driversInLane(l).length)}
          matchCounts={
            search
              ? ALL_LANES.map((l) => driversInLane(l).filter((d) => searchMatches.has(d.id)).length)
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
          {ALL_LANES.map((laneId, i) => (
            <Fragment key={laneId}>
              {i > 0 && (
                <LaneResizer
                  leftLane={ALL_LANES[i - 1]}
                  rightLane={laneId}
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
                laneId={laneId}
                drivers={driversInLane(laneId)}
                dispatcher={laneId === 'uptown_hotel' ? getDispatcher(laneId) : undefined}
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
                // Manual drags change the weight only — never the column count.
                style={
                  {
                    '--lane-grow': effectiveGrows[laneId] ?? 1,
                    '--lane-cols': autoGrows[laneId] ?? 1,
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
            onConfirm={handleCheckIn}
            onCancel={() => setShowCheckIn(false)}
          />
        )}
        {checkInComplete && (
          <CheckInCompleteModal
            name={checkInComplete.name}
            shifts={checkInComplete.shifts}
            lane={checkInComplete.lane}
            onDone={() => setCheckInComplete(null)}
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
