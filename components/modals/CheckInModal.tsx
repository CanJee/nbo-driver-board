'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  Driver,
  DriverShift,
  Lane,
  LaneId,
  RosterEntry,
  SHIFT_COLORS,
  SHIFT_LABELS,
  SHIFT_ORDER,
  SHIFT_TYPES,
  ShiftType,
  FLEET_DRIVER_ROLE,
} from '@/lib/types';
import { activeLanes, laneLabel } from '@/lib/lanes';
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
  carNumber: string;
}

interface CheckInModalProps {
  /** Everyone currently on the board — nobody here can be checked in again. */
  activeDrivers: Driver[];
  /** Every lane row; active ones become the Starting Lane options, hidden ones
   *  still resolve labels for "already checked in (…)" messages. */
  lanes: Lane[];
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

/** Key a person by name for the "already on the board" check. Phone is deliberately
 *  left out: a manual check-in carries no phone number, so keying on it would let
 *  the same driver be added a second time by hand — the exact case this blocks. */
const boardKey = (name: string) => normalizeName(name).toLowerCase();

export default function CheckInModal({ activeDrivers, lanes, onConfirm, onCancel }: CheckInModalProps) {
  const today = useMemo(() => getTournamentDate(), []);
  const laneOptions = useMemo(() => activeLanes(lanes), [lanes]);

  const [query, setQuery] = useState('');
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rosterLoaded, setRosterLoaded] = useState(false);
  /** Why the roster couldn't be READ — not the same as "nothing imported". */
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [showAllRoles, setShowAllRoles] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState<GroupedDriver | null>(null);

  const [drafts, setDrafts] = useState<ShiftDraft[]>([]);
  const [manualPeriod, setManualPeriod] = useState<ShiftType>('morning');
  const [manualTime, setManualTime] = useState('');
  const [lane, setLane] = useState<LaneId>(laneOptions[0]?.id ?? '');
  const [carDigits, setCarDigits] = useState('');
  const [error, setError] = useState<string | null>(null);

  const manualCounter = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  // Load today's roster, focus search without scrolling
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('roster')
        .select('*')
        .eq('shift_date', today)
        .order('name');
      const rows = (data ?? []) as RosterEntry[];
      // An empty result is ambiguous: nothing imported, or RLS filtering every
      // row because this tab's session died — which comes back with NO error.
      // Only claim "no roster imported" while actually signed in (the same
      // rule as the board's fetchers); anything else is a read failure and
      // gets blamed on the connection, not on the roster.
      if (error) {
        setRosterError(error.message);
      } else if (rows.length === 0) {
        const { data: auth } = await supabase.auth.getSession();
        if (!auth.session) setRosterError('you may be signed out');
      } else {
        setRoster(rows);
      }
      setRosterLoaded(true);
    })();
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

  // Who is already on the board. Checked-out drivers are not in `activeDrivers`,
  // so someone who finishes a shift and comes back can still be checked in again.
  const onBoard = useMemo(() => {
    const map = new Map<string, Driver>();
    for (const d of activeDrivers) map.set(boardKey(d.name), d);
    return map;
  }, [activeDrivers]);

  // Live warning for the name in the box, whether picked from the roster or typed.
  const duplicate = query.trim() ? onBoard.get(boardKey(query)) ?? null : null;

  const handleSelect = (g: GroupedDriver) => {
    if (onBoard.has(boardKey(g.name))) return;   // row is disabled; ignore stray clicks
    const newDrafts = sortDrafts(g.entries.map(entryToDraft));
    setSelected(g);
    setQuery(g.name);
    setDrafts(newDrafts);
    // Only adopt the roster's lane if it is still an option — stale roster rows
    // can point at a lane hidden since the import.
    if (newDrafts[0] && laneOptions.some((l) => l.id === newDrafts[0].lane)) {
      setLane(newDrafts[0].lane);
    }
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
    // Catches the manually typed name too, not just a pick from the dropdown.
    const already = onBoard.get(boardKey(name));
    if (already) {
      setError(
        `${already.name} is already checked in (${laneLabel(lanes, already.lane)}). ` +
        'Check them out first if you need to check them back in.'
      );
      return;
    }
    if (drafts.length === 0) { setError('Add at least one shift for this driver.'); return; }
    // Only possible when the lanes fetch failed or every lane is hidden.
    if (!lane) { setError('No lanes are configured. Add one from the Lanes button on the board first.'); return; }

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
      carNumber: formatEquipment(carDigits, 'C-'),
    });
  };

  const noRosterToday = rosterLoaded && !rosterError && roster.length === 0;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="rounded-2xl shadow-2xl w-full max-w-[480px] max-h-[90dvh] overflow-y-auto"
        style={{ backgroundColor: 'var(--surface-page)', border: '1px solid var(--brand)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 rounded-t-2xl"
          style={{ backgroundColor: 'var(--surface-panel)', borderBottom: '2px solid var(--brand)' }}
        >
          <div>
            <h2 className="text-xl font-black text-fg-strong tracking-wide uppercase">Driver Check-In</h2>
            <p className="text-xs text-fg-muted mt-0.5">{formatRosterDate(today)}</p>
          </div>
          <button onClick={onCancel} className="text-fg-faint hover:text-fg-strong transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">

          {/* Error banner */}
          {error && (
            <div className="text-sm text-(--status-error-fg) rounded-lg px-4 py-2.5"
              style={{ backgroundColor: 'var(--status-error-bg)', border: '1px solid var(--brand)' }}>
              {error}
            </div>
          )}

          {/* Roster read failure — a dead session or blocked request used to
              render as "No roster imported", sending people hunting for an
              import problem that didn't exist. Manual check-in still works,
              and its save path has its own failure toast. */}
          {rosterError && (
            <div className="text-sm text-(--status-error-fg) rounded-lg px-4 py-2.5"
              style={{ backgroundColor: 'var(--status-error-bg)', border: '1px solid var(--brand)' }}>
              Couldn&apos;t load today&apos;s roster ({rosterError}). Sign out and back in, then
              try again. You can still enter a driver manually below.
            </div>
          )}

          {/* No-roster hint */}
          {noRosterToday && (
            <div className="text-xs text-amber-700 dark:text-amber-300 rounded-lg px-4 py-2.5"
              style={{ backgroundColor: 'var(--status-warn-bg)', border: '1px solid #B45309' }}>
              No roster imported for {formatRosterDate(today)}.{' '}
              <a href="/import" className="underline font-semibold">Import today&apos;s roster</a>{' '}
              or enter a driver manually below.
            </div>
          )}

          {/* ── STEP 1: Driver Name ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[11px] font-bold tracking-widest uppercase"
                style={{ color: 'var(--brand)' }}>
                1 · Select Driver
              </label>
              <label className="flex items-center gap-1.5 text-[10px] text-fg-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showAllRoles}
                  onChange={(e) => setShowAllRoles(e.target.checked)}
                  className="accent-brand"
                />
                Show all roles
              </label>
            </div>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint">
                <Search size={15} />
              </div>
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(null); setDrafts([]); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search by name..."
                className="w-full pl-9 pr-9 py-2.5 rounded-lg text-sm text-fg-strong placeholder-fg-ghost outline-none"
                style={{ backgroundColor: 'var(--surface-panel)', border: '1px solid var(--edge)' }}
              />
              {query && (
                <button type="button" onClick={handleClear}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-faint hover:text-fg-strong">
                  <X size={14} />
                </button>
              )}
              {/* Dropdown */}
              {showDropdown && filtered.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg shadow-xl overflow-hidden max-h-64 overflow-y-auto"
                  style={{ backgroundColor: 'var(--surface-panel)', border: '1px solid var(--edge)' }}>
                  {filtered.map((g) => {
                    const periods = sortDrafts(g.entries.map(entryToDraft));
                    // Still listed, just not selectable — a dispatcher searching for
                    // someone needs to see that they are already on the board, which
                    // hiding the row would not tell them.
                    const already = onBoard.get(boardKey(g.name));
                    return (
                      <button
                        key={g.key}
                        type="button"
                        disabled={!!already}
                        onClick={() => handleSelect(g)}
                        className="w-full text-left px-4 py-2.5 transition-colors enabled:hover:bg-black/5 dark:enabled:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-fg-strong truncate">{g.name}</div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {already ? (
                              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: 'var(--status-warn-bg)', color: 'var(--status-warn-fg)' }}>
                                On board
                              </span>
                            ) : (
                              periods.map((d) => (
                                <span key={d.key}
                                  className="w-2 h-2 rounded-sm"
                                  style={{ backgroundColor: SHIFT_COLORS[d.shift_type] }}
                                  title={SHIFT_LABELS[d.shift_type]}
                                />
                              ))
                            )}
                          </div>
                        </div>
                        <div className="text-[10px] text-fg-muted mt-0.5">
                          {already
                            ? `Checked in · ${laneLabel(lanes, already.lane)}`
                            : `${g.roles.join(', ') || '—'} · ${periods.map((d) => SHIFT_LABELS[d.shift_type]).join(' + ')}`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {/* The already-checked-in warning replaces the roster hints: it is the
                only thing that matters about this name until it changes. */}
            {duplicate ? (
              <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-1.5 ml-1">
                Already checked in · {laneLabel(lanes, duplicate.lane)} — check them out first
                to check them back in.
              </p>
            ) : selected ? (
              <p className="text-[10px] text-fg-faint mt-1.5 ml-1">
                ✓ On today&apos;s roster · {selected.roles.join(', ')}
                {selected.phone ? ` · ${selected.phone}` : ''}
              </p>
            ) : query.trim() ? (
              <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-1.5 ml-1">
                Not on today&apos;s roster — add a shift below to check in manually.
              </p>
            ) : null}
          </div>

          {/* ── STEP 2: Shifts ── */}
          <div>
            <label className="block text-[11px] font-bold tracking-widest uppercase mb-2"
              style={{ color: 'var(--brand)' }}>
              2 · Confirm Shifts
            </label>

            {/* Selected shift chips */}
            {drafts.length > 0 ? (
              <div className="space-y-2 mb-3">
                {sortDrafts(drafts).map((d) => (
                  <div
                    key={d.key}
                    className="flex items-center gap-2 rounded-lg px-3 py-2"
                    style={{ backgroundColor: 'var(--surface-panel)', border: `1px solid ${SHIFT_COLORS[d.shift_type]}` }}
                  >
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: SHIFT_COLORS[d.shift_type] }} />
                    <span className="text-sm font-semibold text-fg-strong">{SHIFT_LABELS[d.shift_type]}</span>
                    {d.label && <span className="text-xs text-fg-soft">{d.label}</span>}
                    {d.source_location && <span className="text-[10px] text-fg-faint truncate">· {d.source_location}</span>}
                    {!d.scheduled && (
                      <span className="text-[9px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-400 px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: 'var(--status-warn-bg)' }}>manual</span>
                    )}
                    <button type="button" onClick={() => removeDraft(d.key)}
                      className="ml-auto text-fg-faint hover:text-fg-strong flex-shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-fg-faint italic mb-3">No shifts selected yet — add one below.</p>
            )}

            {/* Manual add / override */}
            <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--surface-inset)', border: '1px dashed var(--edge)' }}>
              <div className="text-[10px] text-fg-faint uppercase tracking-wider mb-2">Add / override shift</div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {SHIFT_TYPES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setManualPeriod(s)}
                    className="py-2 rounded-lg text-xs font-bold transition-all"
                    style={{
                      backgroundColor: manualPeriod === s ? SHIFT_COLORS[s] : 'var(--surface-panel)',
                      border: `1px solid ${manualPeriod === s ? SHIFT_COLORS[s] : 'var(--edge)'}`,
                      color: manualPeriod === s ? '#fff' : 'var(--fg-muted)',
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
                  className="flex-1 px-3 py-2 rounded-lg text-sm text-fg-strong placeholder-fg-ghost outline-none"
                  style={{ backgroundColor: 'var(--surface-panel)', border: '1px solid var(--edge)' }}
                />
                <button
                  type="button"
                  onClick={addManualShift}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-fg-strong flex-shrink-0"
                  style={{ backgroundColor: 'var(--surface-button)' }}
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>
          </div>

          {/* ── STEP 3: Starting Lane ── */}
          <div>
            <label className="block text-[11px] font-bold tracking-widest uppercase mb-2"
              style={{ color: 'var(--brand)' }}>
              3 · Starting Lane
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {laneOptions.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLane(l.id)}
                  className="py-2 px-3 rounded-lg text-xs font-bold transition-all text-center"
                  style={{
                    backgroundColor: lane === l.id ? 'var(--brand)' : 'var(--surface-panel)',
                    border: `1px solid ${lane === l.id ? 'var(--brand)' : 'var(--edge)'}`,
                    color: lane === l.id ? '#fff' : 'var(--fg-muted)',
                  }}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── STEP 4: Car (optional) ── */}
          <div>
            <label className="block text-[11px] font-bold tracking-widest uppercase mb-2"
              style={{ color: 'var(--brand)' }}>
              4 · Car <span className="text-fg-faint normal-case font-normal tracking-normal">(optional — can assign later)</span>
            </label>
            {/* Half width: the field holds two digits, so a full-width box just
                looks like something is missing beside it. */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-fg-faint uppercase tracking-wider block mb-1">Car #</label>
                <EquipmentInput prefix="C-" value={carDigits} onChange={setCarDigits} />
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!!duplicate}
            className="w-full py-3 rounded-xl font-black text-sm tracking-widest uppercase text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:opacity-40"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            {duplicate ? 'Already Checked In' : 'Complete Check-In'}
          </button>
        </form>
      </div>
    </div>
  );
}
