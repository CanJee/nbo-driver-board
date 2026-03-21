'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  LaneId,
  LANE_LABELS,
  MAIN_LANES,
  RosterEntry,
  SHIFT_COLORS,
  SHIFT_LABELS,
  ShiftType,
} from '@/lib/types';
import EquipmentInput, { formatEquipment } from '@/components/ui/EquipmentInput';

interface CheckInData {
  rosterId: string | null;
  name: string;
  phone: string;
  shiftType: ShiftType;
  shiftTime: string;
  lane: LaneId;
  walkieNumber: string;
  carNumber: string;
}

interface CheckInModalProps {
  onConfirm: (data: CheckInData) => void;
  onCancel: () => void;
}

const ALL_CHECKIN_LANES: LaneId[] = [...MAIN_LANES, 'meals'];

const SHIFT_TYPES: ShiftType[] = ['morning', 'afternoon', 'evening', 'nightowl'];

export default function CheckInModal({ onConfirm, onCancel }: CheckInModalProps) {
  const [query, setQuery] = useState('');
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [filtered, setFiltered] = useState<RosterEntry[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState<RosterEntry | null>(null);

  const [shiftType, setShiftType] = useState<ShiftType>('morning');
  const [shiftTime, setShiftTime] = useState('');
  const [lane, setLane] = useState<LaneId>('tennis_centre');
  const [walkieDigits, setWalkieDigits] = useState('');
  const [carDigits, setCarDigits] = useState('');
  const [error, setError] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  // Load roster on mount, focus search without scrolling
  useEffect(() => {
    supabase
      .from('roster')
      .select('*')
      .order('name')
      .then(({ data }) => { if (data) setRoster(data as RosterEntry[]); });

    searchRef.current?.focus({ preventScroll: true });
  }, []);

  // Filter roster as user types
  useEffect(() => {
    if (!query.trim()) { setFiltered([]); setShowDropdown(false); return; }
    const q = query.toLowerCase();
    const matches = roster.filter((r) => r.name.toLowerCase().includes(q));
    setFiltered(matches);
    setShowDropdown(matches.length > 0);
  }, [query, roster]);

  const handleSelect = (entry: RosterEntry) => {
    setSelected(entry);
    setQuery(entry.name);
    setShiftType(entry.shift_type);
    setShiftTime(entry.shift_time);
    setShowDropdown(false);
    setError(null);
  };

  const handleClear = () => {
    setSelected(null);
    setQuery('');
    setShiftTime('');
    setShiftType('morning');
    setError(null);
    searchRef.current?.focus({ preventScroll: true });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = query.trim();
    if (!name) { setError('Please enter or select a driver name.'); return; }
    onConfirm({
      rosterId: selected?.id ?? null,
      name,
      phone: selected?.phone ?? '',
      shiftType,
      shiftTime,
      lane,
      walkieNumber: formatEquipment(walkieDigits, 'W-'),
      carNumber: formatEquipment(carDigits, 'C-'),
    });
  };

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
            <p className="text-xs text-slate-400 mt-0.5">Dispatcher-assisted check-in</p>
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

          {/* ── STEP 1: Driver Name ── */}
          <div>
            <label className="block text-[11px] font-bold tracking-widest uppercase mb-2"
              style={{ color: '#E41C23' }}>
              1 · Select Driver
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                <Search size={15} />
              </div>
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
                onFocus={() => filtered.length > 0 && setShowDropdown(true)}
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
              {showDropdown && (
                <div className="absolute z-10 mt-1 w-full rounded-lg shadow-xl overflow-hidden"
                  style={{ backgroundColor: '#161B22', border: '1px solid #2D3748' }}>
                  {filtered.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => handleSelect(entry)}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-700 transition-colors"
                    >
                      <div className="text-sm font-semibold text-white">{entry.name}</div>
                      <div className="text-[10px] text-slate-400">
                        {SHIFT_LABELS[entry.shift_type]} · {entry.shift_time}
                      </div>
                    </button>
                  ))}
                  {filtered.length === 0 && (
                    <div className="px-4 py-3 text-sm text-slate-500 italic">No matches — name will be entered manually</div>
                  )}
                </div>
              )}
            </div>
            {selected && (
              <p className="text-[10px] text-slate-500 mt-1.5 ml-1">
                ✓ Found in roster · Phone: {selected.phone}
              </p>
            )}
          </div>

          {/* ── STEP 2: Shift Type ── */}
          <div>
            <label className="block text-[11px] font-bold tracking-widest uppercase mb-2"
              style={{ color: '#E41C23' }}>
              2 · Confirm Shift
            </label>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {SHIFT_TYPES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setShiftType(s)}
                  className="py-2 rounded-lg text-xs font-bold transition-all"
                  style={{
                    backgroundColor: shiftType === s ? SHIFT_COLORS[s] : '#161B22',
                    border: `1px solid ${shiftType === s ? SHIFT_COLORS[s] : '#2D3748'}`,
                    color: shiftType === s ? '#fff' : '#94A3B8',
                    opacity: s === 'nightowl' && shiftType === s ? 1 : undefined,
                  }}
                >
                  {SHIFT_LABELS[s]}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={shiftTime}
              onChange={(e) => setShiftTime(e.target.value)}
              placeholder="Shift time (e.g. 07:00 or 7am–3pm)"
              className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-600 outline-none"
              style={{ backgroundColor: '#161B22', border: '1px solid #2D3748' }}
            />
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
                <EquipmentInput
                  prefix="W-"
                  value={walkieDigits}
                  onChange={setWalkieDigits}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Car #</label>
                <EquipmentInput
                  prefix="C-"
                  value={carDigits}
                  onChange={setCarDigits}
                />
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
