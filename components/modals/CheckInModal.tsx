'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  DriverShift,
  LaneId,
  LANE_LABELS,
  MAIN_LANES,
  RosterEntry,
  SHIFT_COLORS,
  SHIFT_LABELS,
  SHIFT_ORDER,
  SHIFT_TYPES,
  ShiftType,
  FLEET_DRIVER_ROLE,
} from '@/lib/types';
import { getTournamentDate, formatRosterDate } from '@/lib/date';
import { isFleetDriver, normalizeName, parseTimeToMinutes } from '@/lib/roster/map';
import EquipmentInput, { formatEquipment } from '@/components/ui/EquipmentInput';

export interface CheckInData {
  rosterId: string | null;
  name: string;
  phone: string;
  role: string;
  shiftType: ShiftType;      // primary (earliest) shift
  shiftTime: string;         // primary shift label
  shifts: DriverShift[];     // all shifts being checked in
  lane: LaneId;
  walkieNumber: string;
  carNumber: string;
}

interface CheckInModalProps {
  onConfirm: (data: CheckInData) => void;
  onCancel: () => void;
}

/** All of one person's assignments for the day, collapsed into a single search result. */
interface GroupedDriver {
  key: string;
  name: string;
  phone: string;
  roles: string[];
  isDriver: boolean;
  entries: RosterEntry[];
}

/** A shift staged for check-in (from the roster, or added manually as an override). */
interface ShiftDraft {
  key: string;
  shift_type: ShiftType;
  label: string;
  start_time: string;
  end_time: string;
  lane: LaneId;
  role: string;
  source_location: string;
  scheduled: boolean;
}

const ALL_CHECKIN_LANES: LaneId[] = [...MAIN_LANES, 'meals'];

const groupKey = (name: string, phone: string) =>
  `${normalizeName(name).toLowerCase()}|${phone.trim()}`;

/** Minutes-since-midnight for ordering; unknown/unparseable times sort last within a period. */
function draftMinutes(d: ShiftDraft): number {
  const candidate = d.start_time || d.label.split(/[-–—]/)[0];
  const mins = parseTimeToMinutes(candidate);
  return Number.isNaN(mins) ? Number.MAX_SAFE_INTEGER : mins;
}

function entryToDraft(e: RosterEntry): ShiftDraft {
  return {
    key: e.id,
    shift_type: e.shift_type,
    label: e.shift_label,
    start_time: e.start_time,
    end_time: e.end_time,
    lane: e.lane,
    role: e.role,
    source_location: e.source_location,
    scheduled: true,
  };
}

function sortDrafts(drafts: ShiftDraft[]): ShiftDraft[] {
  return [...drafts].sort((a, b) => {
    const o = SHIFT_ORDER[a.shift_type] - SHIFT_ORDER[b.shift_type];
    if (o !== 0) return o;
    return draftMinutes(a) - draftMinutes(b);
  });
}

export default function CheckInModal({ onConfirm, onCancel }: CheckInModalProps) {
  const today = useMemo(() => getTournamentDate(), []);

  const [query, setQuery] = useState('');
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const [showAllRoles, setShowAllRoles] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState<GroupedDriver | null>(null);

  const [drafts, setDrafts] = useState<ShiftDraft[]>([]);
  const [manualPeriod, setManualPeriod] = useState<ShiftType>('morning');
  const [manualTime, setManualTime] = useState('');
  const [lane, setLane] = useState<LaneId>('tennis_centre');
  const [walkieDigits, setWalkieDigits] = useState('');
  const [carDigits, setCarDigits] = useState('');
  const [error, setError] = useState<string | null>(null);

  const manualCounter = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  // Load today's roster, focus search without scrolling
  useEffect(() => {
    supabase
      .from('roster')
      .select('*')
      .eq('shift_date', today)
      .order('name')
      .then(({ data }) => {
        if (data) setRoster(data as RosterEntry[]);
        setRosterLoaded(true);
      });
    searchRef.current?.focus({ preventScroll: true });
  }, [today]);

  // Group roster rows by person
  const groups = useMemo<GroupedDriver[]>(() => {
    const map = new Map<string, GroupedDriver>();
    for (const e of roster) {
      const key = groupKey(e.name, e.phone);
      let g = map.get(key);
      if (!g) {
        g = { key, name: e.name, phone: e.phone, roles: [], isDriver: false, entries: [] };
        map.set(key, g);
      }
      g.entries.push(e);
      if (e.role && !g.roles.includes(e.role)) g.roles.push(e.role);
      if (isFleetDriver(e.role)) g.isDriver = true;
    }
    return [...map.values()];
  }, [roster]);

  const filtered = useMemo<GroupedDriver[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return groups
      .filter((g) => showAllRoles || g.isDriver)
      .filter((g) => g.name.toLowerCase().includes(q));
  }, [query, groups, showAllRoles]);

  const handleSelect = (g: GroupedDriver) => {
    const newDrafts = sortDrafts(g.entries.map(entryToDraft));
    setSelected(g);
    setQuery(g.name);
    setDrafts(newDrafts);
    if (newDrafts[0]) setLane(newDrafts[0].lane);
    setShowDropdown(false);
    setError(null);
  };

  const handleClear = () => {
    setSelected(null);
    setQuery('');
    setDrafts([]);
    setError(null);
    searchRef.current?.focus({ preventScroll: true });
  };

  const removeDraft = (key: string) => setDrafts((prev) => prev.filter((d) => d.key !== key));

  const addManualShift = () => {
    manualCounter.current += 1;
    const draft: ShiftDraft = {
      key: `manual-${manualCounter.current}`,
      shift_type: manualPeriod,
      label: manualTime.trim(),
      start_time: '',
      end_time: '',
      lane,
      role: selected?.roles[0] ?? FLEET_DRIVER_ROLE,
      source_location: '',
      scheduled: false,
    };
    setDrafts((prev) => sortDrafts([...prev, draft]));
    setManualTime('');
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = query.trim();
    if (!name) { setError('Please enter or select a driver name.'); return; }
    if (drafts.length === 0) { setError('Add at least one shift for this driver.'); return; }

    const sorted = sortDrafts(drafts);
    const primary = sorted[0];
    const firstScheduled = sorted.find((d) => d.scheduled);

    const shifts: DriverShift[] = sorted.map((d) => ({
      shift_type: d.shift_type,
      label: d.label,
      start_time: d.start_time,
      end_time: d.end_time,
      lane: d.lane,
      role: d.role,
      source_location: d.source_location,
    }));

    onConfirm({
      rosterId: firstScheduled ? firstScheduled.key : null,
      name,
      phone: selected?.phone ?? '',
      role: primary.role || (selected?.roles[0] ?? FLEET_DRIVER_ROLE),
      shiftType: primary.shift_type,
      shiftTime: primary.label,
      shifts,
      lane,
      walkieNumber: formatEquipment(walkieDigits, 'W-'),
      carNumber: formatEquipment(carDigits, 'C-'),
    });
  };

  const noRosterToday = rosterLoaded && roster.length === 0;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="rounded-2xl shadow-2xl w-[480px] max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: '#0D1117', border: '1px solid #E41C23' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 rounded-t-2xl"
          style={{ backgroundColor: '#161B22', borderBottom: '2px solid #E41C23' }}
        >
          <div>
            <h2 className="text-xl font-black text-white tracking-wide uppercase">Driver Check-In</h2>
            <p className="text-xs text-slate-400 mt-0.5">{formatRosterDate(today)}</p>
          </div>
          <button onClick={onCancel} className="text-slate-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">

          {/* Error banner */}
          {error && (
            <div className="text-sm text-white rounded-lg px-4 py-2.5"
              style={{ backgroundColor: '#7F1D1D', border: '1px solid #E41C23' }}>
              {error}
            </div>
          )}

          {/* No-roster hint */}
          {noRosterToday && (
            <div className="text-xs text-amber-300 rounded-lg px-4 py-2.5"
              style={{ backgroundColor: '#3F2D0A', border: '1px solid #B45309' }}>
              No roster imported for {formatRosterDate(today)}.{' '}
              <a href="/import" className="underline font-semibold">Import today&apos;s roster</a>{' '}
              or enter a driver manually below.
            </div>
          )}

          {/* ── STEP 1: Driver Name ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[11px] font-bold tracking-widest uppercase"
                style={{ color: '#E41C23' }}>
                1 · Select Driver
              </label>
              <label className="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showAllRoles}
                  onChange={(e) => setShowAllRoles(e.target.checked)}
                  className="accent-[#E41C23]"
                />
                Show all roles
              </label>
            </div>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                <Search size={15} />
              </div>
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(null); setDrafts([]); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search by name..."
                className="w-full pl-9 pr-9 py-2.5 rounded-lg text-sm text-white placeholder-slate-600 outline-none"
                style={{ backgroundColor: '#161B22', border: '1px solid #2D3748' }}
              />
              {query && (
                <button type="button" onClick={handleClear}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                  <X size={14} />
                </button>
              )}
              {/* Dropdown */}
              {showDropdown && filtered.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg shadow-xl overflow-hidden max-h-64 overflow-y-auto"
                  style={{ backgroundColor: '#161B22', border: '1px solid #2D3748' }}>
                  {filtered.map((g) => {
                    const periods = sortDrafts(g.entries.map(entryToDraft));
                    return (
                      <button
                        key={g.key}
                        type="button"
                        onClick={() => handleSelect(g)}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-700 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-white">{g.name}</div>
                          <div className="flex items-center gap-1">
                            {periods.map((d) => (
                              <span key={d.key}
                                className="w-2 h-2 rounded-sm"
                                style={{ backgroundColor: SHIFT_COLORS[d.shift_type] }}
                                title={SHIFT_LABELS[d.shift_type]}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {g.roles.join(', ') || '—'} · {periods.map((d) => SHIFT_LABELS[d.shift_type]).join(' + ')}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {selected && (
              <p className="text-[10px] text-slate-500 mt-1.5 ml-1">
                ✓ On today&apos;s roster · {selected.roles.join(', ')}
                {selected.phone ? ` · ${selected.phone}` : ''}
              </p>
            )}
            {!selected && query.trim() && (
              <p className="text-[10px] text-amber-400 mt-1.5 ml-1">
                Not on today&apos;s roster — add a shift below to check in manually.
              </p>
            )}
          </div>

          {/* ── STEP 2: Shifts ── */}
          <div>
            <label className="block text-[11px] font-bold tracking-widest uppercase mb-2"
              style={{ color: '#E41C23' }}>
              2 · Confirm Shifts
            </label>

            {/* Selected shift chips */}
            {drafts.length > 0 ? (
              <div className="space-y-2 mb-3">
                {sortDrafts(drafts).map((d) => (
                  <div
                    key={d.key}
                    className="flex items-center gap-2 rounded-lg px-3 py-2"
                    style={{ backgroundColor: '#161B22', border: `1px solid ${SHIFT_COLORS[d.shift_type]}` }}
                  >
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: SHIFT_COLORS[d.shift_type] }} />
                    <span className="text-sm font-semibold text-white">{SHIFT_LABELS[d.shift_type]}</span>
                    {d.label && <span className="text-xs text-slate-300">{d.label}</span>}
                    {d.source_location && <span className="text-[10px] text-slate-500 truncate">· {d.source_location}</span>}
                    {!d.scheduled && (
                      <span className="text-[9px] font-bold uppercase tracking-wide text-amber-400 px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: '#3F2D0A' }}>manual</span>
                    )}
                    <button type="button" onClick={() => removeDraft(d.key)}
                      className="ml-auto text-slate-500 hover:text-white flex-shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic mb-3">No shifts selected yet — add one below.</p>
            )}

            {/* Manual add / override */}
            <div className="rounded-lg p-3" style={{ backgroundColor: '#0B0F14', border: '1px dashed #2D3748' }}>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Add / override shift</div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {SHIFT_TYPES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setManualPeriod(s)}
                    className="py-2 rounded-lg text-xs font-bold transition-all"
                    style={{
                      backgroundColor: manualPeriod === s ? SHIFT_COLORS[s] : '#161B22',
                      border: `1px solid ${manualPeriod === s ? SHIFT_COLORS[s] : '#2D3748'}`,
                      color: manualPeriod === s ? '#fff' : '#94A3B8',
                    }}
                  >
                    {SHIFT_LABELS[s]}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                  placeholder="Time (optional, e.g. 7am–3pm)"
                  className="flex-1 px-3 py-2 rounded-lg text-sm text-white placeholder-slate-600 outline-none"
                  style={{ backgroundColor: '#161B22', border: '1px solid #2D3748' }}
                />
                <button
                  type="button"
                  onClick={addManualShift}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: '#2D3748' }}
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>
          </div>

          {/* ── STEP 3: Starting Lane ── */}
          <div>
            <label className="block text-[11px] font-bold tracking-widest uppercase mb-2"
              style={{ color: '#E41C23' }}>
              3 · Starting Lane
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ALL_CHECKIN_LANES.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLane(l)}
                  className="py-2 px-3 rounded-lg text-xs font-bold transition-all text-center"
                  style={{
                    backgroundColor: lane === l ? '#E41C23' : '#161B22',
                    border: `1px solid ${lane === l ? '#E41C23' : '#2D3748'}`,
                    color: lane === l ? '#fff' : '#94A3B8',
                  }}
                >
                  {LANE_LABELS[l]}
                </button>
              ))}
            </div>
          </div>

          {/* ── STEP 4: Equipment (optional) ── */}
          <div>
            <label className="block text-[11px] font-bold tracking-widest uppercase mb-2"
              style={{ color: '#E41C23' }}>
              4 · Equipment <span className="text-slate-500 normal-case font-normal tracking-normal">(optional — can assign later)</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Walkie #</label>
                <EquipmentInput prefix="W-" value={walkieDigits} onChange={setWalkieDigits} />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Car #</label>
                <EquipmentInput prefix="C-" value={carDigits} onChange={setCarDigits} />
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full py-3 rounded-xl font-black text-sm tracking-widest uppercase text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#E41C23' }}
          >
            Complete Check-In
          </button>
        </form>
      </div>
    </div>
  );
}
