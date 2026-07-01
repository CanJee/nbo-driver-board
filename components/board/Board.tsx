'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { createClient } from '@/lib/supabase/client';
import { AwayReason, Driver, DriverShift, LaneId, LocationStatus, MAIN_LANES } from '@/lib/types';
import SwimLane from './SwimLane';
import LiveClock from './LiveClock';
import DriverCard from '@/components/cards/DriverCard';
import CheckOutModal from '@/components/modals/CheckOutModal';
import AssignModal from '@/components/modals/AssignModal';
import CheckInModal, { CheckInData } from '@/components/modals/CheckInModal';
import CheckInCompleteModal from '@/components/modals/CheckInCompleteModal';
import Toast from '@/components/ui/Toast';
import Portal from '@/components/ui/Portal';
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

  // Suppress real-time refetch while dragging to avoid flicker
  const isDraggingRef = useRef(false);

  // Track the true source lane at drag-start — handleDragOver mutates `drivers` state
  // optimistically, so by the time handleDragEnd runs, draggedDriver.lane already
  // reflects the target lane. Without this ref, cross-lane moves into empty lanes
  // are misclassified as within-lane no-ops and never persisted.
  const dragSourceLaneRef = useRef<LaneId | null>(null);

  const supabase = createClient();

  // Require 8px movement before drag activates — prevents conflict with click-to-expand
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchDrivers = useCallback(async () => {
    if (isDraggingRef.current) return;
    const { data } = await supabase
      .from('drivers')
      .select('*')
      .is('checked_out_at', null)
      .order('lane_order', { ascending: true });
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

    // Optimistically move the card to the target lane for live preview
    setDrivers((prev) => {
      const targetDrivers = prev.filter((d) => d.lane === targetLane);
      const overIndex = overDriver ? targetDrivers.findIndex((d) => d.id === overId) : targetDrivers.length;
      const insertAt = overIndex === -1 ? targetDrivers.length : overIndex;

      return prev
        .filter((d) => d.id !== activeId)
        .map((d, _, arr) => {
          if (d.lane === targetLane) {
            const laneArr = arr.filter((x) => x.lane === targetLane);
            return { ...d, lane_order: laneArr.indexOf(d) };
          }
          return d;
        })
        .reduce<Driver[]>((acc, d) => {
          if (d.lane === targetLane && acc.filter((x) => x.lane === targetLane).length === insertAt) {
            acc.push({ ...draggedDriver, lane: targetLane, lane_order: insertAt });
          }
          acc.push(d);
          return acc;
        }, [])
        .concat(
          !prev.filter((d) => d.lane === targetLane).length || insertAt >= prev.filter((d) => d.lane === targetLane).length
            ? [{ ...draggedDriver, lane: targetLane, lane_order: insertAt }]
            : []
        )
        .filter((d, i, arr) => arr.findIndex((x) => x.id === d.id) === i);
    });
  };

  // ── DRAG END ──
  const handleDragEnd = async (event: DragEndEvent) => {
    isDraggingRef.current = false;
    setActiveDriver(null);
    const { active, over } = event;

    // Always clear the source-lane ref, even if we return early
    const sourceLane = dragSourceLaneRef.current;
    dragSourceLaneRef.current = null;

    if (!over || !sourceLane) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const draggedDriver = drivers.find((d) => d.id === activeId);
    if (!draggedDriver) return;

    const isOverLane = (ALL_LANES as string[]).includes(overId);
    const overDriver = !isOverLane ? drivers.find((d) => d.id === overId) : null;
    const targetLane = (isOverLane ? overId : overDriver?.lane) as LaneId;
    if (!targetLane) return;

    let updatedDrivers: Driver[];

    if (sourceLane === targetLane) {
      // Within-lane reorder
      const laneDrivers = drivers.filter((d) => d.lane === sourceLane);
      const oldIndex = laneDrivers.findIndex((d) => d.id === activeId);
      const newIndex = overDriver
        ? laneDrivers.findIndex((d) => d.id === overId)
        : laneDrivers.length - 1;

      if (oldIndex === newIndex) return;

      const reordered = arrayMove(laneDrivers, oldIndex, newIndex).map((d, i) => ({
        ...d,
        lane_order: i,
      }));
      updatedDrivers = [
        ...drivers.filter((d) => d.lane !== sourceLane),
        ...reordered,
      ];
    } else {
      // Cross-lane move — use current optimistic state
      updatedDrivers = drivers.map((d, _, arr) => {
        const laneDrivers = arr.filter((x) => x.lane === d.lane);
        return { ...d, lane_order: laneDrivers.indexOf(d) };
      });
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

    await Promise.all(
      toSave.map((d) =>
        supabase
          .from('drivers')
          .update({ lane: d.lane, lane_order: d.lane_order })
          .eq('id', d.id)
      )
    );
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

  const driversInLane = (laneId: LaneId) => {
    const lane = drivers.filter((d) => d.lane === laneId);
    const unassigned = lane.filter((d) => d.status === 'unassigned').sort((a, b) => a.lane_order - b.lane_order);
    const others = lane.filter((d) => d.status !== 'unassigned').sort((a, b) => a.lane_order - b.lane_order);
    return [...unassigned, ...others];
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
    >
      <div className="flex flex-col h-screen p-3 gap-3 relative" style={{ backgroundColor: '#0D1117' }}>

        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-2 rounded-lg flex-shrink-0 border"
          style={{ backgroundColor: '#161B22', borderColor: '#E41C23' }}
        >
          <div className="flex items-center w-64">
            <Image src="/NBO-Dark.png" alt="National Bank Open" width={180} height={65} style={{ height: 'auto' }} priority />
          </div>
          <h1 className="text-xl font-bold text-white tracking-wide text-center">
            Transportation Dispatch{' '}
            <span className="font-light text-slate-400">—</span>{' '}
            <span style={{ color: '#E41C23' }}>Live Status</span>
          </h1>
          <div className="w-64 flex items-center justify-end gap-3">
            <Link
              href="/import"
              className="px-3 py-1.5 rounded-lg text-xs font-bold tracking-widest uppercase text-slate-300 hover:text-white transition-colors whitespace-nowrap"
              style={{ border: '1px solid #2D3748' }}
            >
              Import
            </Link>
            <button
              onClick={() => setShowCheckIn(true)}
              className="px-4 py-1.5 rounded-lg text-xs font-black tracking-widest uppercase text-white transition-opacity hover:opacity-80 whitespace-nowrap"
              style={{ backgroundColor: '#E41C23', border: '1px solid #E41C23' }}
            >
              + Check In
            </button>
            <LiveClock />
          </div>
        </div>

        {/* Board — 5 equal columns */}
        <div className="flex flex-1 gap-2 min-h-0 pb-6">
          {ALL_LANES.map((laneId) => (
            <SwimLane
              key={laneId}
              laneId={laneId}
              drivers={driversInLane(laneId)}
              dispatcher={laneId === 'uptown_hotel' ? getDispatcher(laneId) : undefined}
              onCheckOut={setCheckOutDriver}
              onAssign={setAssignDriver}
              onUpdateNotes={handleUpdateNotes}
              onSetAway={handleSetAway}
              onSetLocationStatus={handleSetLocationStatus}
              className="flex-1"
            />
          ))}
        </div>
        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-1.5 pointer-events-none">
          <form action={logout} className="pointer-events-auto">
            <button
              type="submit"
              className="text-[10px] font-bold uppercase tracking-widest text-slate-600 hover:text-slate-400 transition-colors"
            >
              Sign Out
            </button>
          </form>
          <p className="text-[10px] text-slate-600 tracking-wide">
            Designed &amp; built by{' '}
            <a
              href="https://www.linkedin.com/in/hasankanjee"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-slate-300 transition-colors underline underline-offset-2 pointer-events-auto"
            >
              Hasan Kanjee
            </a>
          </p>
        </div>
      </div>

      {/* Drag overlay — ghost card following cursor */}
      <DragOverlay>
        {activeDriver && (
          <DriverCard
            driver={activeDriver}
            onCheckOut={() => {}}
            onAssign={() => {}}
            onUpdateNotes={() => {}}
            onSetAway={() => {}}
            onSetLocationStatus={() => {}}
            isDragOverlay
          />
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
