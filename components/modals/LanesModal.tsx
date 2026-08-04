'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Driver, Lane } from '@/lib/types';
import { nextLaneSortOrder, slugifyLaneLabel } from '@/lib/lanes';

// The board's columns are rows in public.lanes — this is where dispatch
// reorders, renames, hides and adds them (functional port of ridecrew's
// zones-sheet; the old hardcoded board needed a code change for any of this).
// Reordering is up/down buttons rather than drag on purpose: senior-friendly
// targets, and the board behind this modal is already full of drag handlers.
// There is deliberately NO delete: hidden lanes keep their history, and the
// drivers.lane foreign key blocks a SQL-editor delete of an occupied lane.

interface LanesModalProps {
  /** Every lane row, hidden included. */
  lanes: Lane[];
  /** The open board — used to refuse hiding a lane someone is still in. */
  drivers: Driver[];
  /** Re-fetches lanes into Board state after a successful write. */
  onRefresh: () => Promise<void>;
  onClose: () => void;
}

const friendly = (e: { code?: string; message?: string }) =>
  e.code === '23505'
    ? 'A lane with that name already exists.'
    : (e.message ?? 'Something went wrong.');

export default function LanesModal({ lanes, drivers, onRefresh, onClose }: LanesModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const supabase = createClient();

  const sorted = [...lanes].sort(
    (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)
  );

  const countIn = (laneId: string) => drivers.filter((d) => d.lane === laneId).length;

  // One write at a time; a returned string is the error to show, null is
  // success (which refreshes Board's lanes — realtime carries it to every
  // other screen).
  const runWrite = async (write: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const err = await write();
    if (err) setError(err);
    else await onRefresh();
    setBusy(false);
  };

  const move = (idx: number, dir: -1 | 1) =>
    runWrite(async () => {
      const next = [...sorted];
      const [row] = next.splice(idx, 1);
      next.splice(idx + dir, 0, row);
      // Rewrite every lane to a dense 0..n-1 (ridecrew's saveZoneOrder), so
      // hidden lanes keep their place and come back where they belong.
      for (const [i, l] of next.entries()) {
        const { error: e } = await supabase.from('lanes').update({ sort_order: i }).eq('id', l.id);
        if (e) return friendly(e);
      }
      return null;
    });

  const saveRename = (lane: Lane) =>
    runWrite(async () => {
      const label = renameDraft.trim();
      if (!label) return "Lane name can't be empty.";
      // Label only — the id is permanent (drivers.lane FK target, saved width
      // key, dnd droppable id), which is what makes renames free.
      const { error: e } = await supabase.from('lanes').update({ label }).eq('id', lane.id);
      if (e) return friendly(e);
      setRenamingId(null);
      return null;
    });

  const toggleActive = (lane: Lane) =>
    runWrite(async () => {
      if (lane.active) {
        const count = countIn(lane.id);
        if (count > 0) {
          return `${count} driver${count === 1 ? ' is' : 's are'} still in ${lane.label}. Move them first.`;
        }
        if (sorted.filter((l) => l.active).length <= 1) {
          return 'The board needs at least one lane.';
        }
      }
      const { error: e } = await supabase
        .from('lanes')
        .update({ active: !lane.active })
        .eq('id', lane.id);
      return e ? friendly(e) : null;
    });

  const addLane = () =>
    runWrite(async () => {
      const label = newLabel.trim();
      if (!label) return 'Enter a name for the new lane.';
      const { error: e } = await supabase.from('lanes').insert({
        id: slugifyLaneLabel(label, lanes.map((l) => l.id)),
        label,
        sort_order: nextLaneSortOrder(lanes),
        active: true,
      });
      if (e) return friendly(e);
      setNewLabel('');
      return null;
    });

  return (
    <div className="modal-backdrop" onClick={onClose}>
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
            <h2 className="text-xl font-black text-fg-strong tracking-wide uppercase">Board Lanes</h2>
            <p className="text-xs text-fg-muted mt-0.5">
              Reorder, rename, hide or add columns. Changes show on every screen.
            </p>
          </div>
          <button onClick={onClose} className="text-fg-faint hover:text-fg-strong transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Error banner */}
          {error && (
            <div
              className="text-sm text-(--status-error-fg) rounded-lg px-4 py-2.5"
              style={{ backgroundColor: 'var(--status-error-bg)', border: '1px solid var(--brand)' }}
            >
              {error}
            </div>
          )}

          {/* Lane list */}
          <div className="space-y-2">
            {sorted.map((lane, i) => (
              <div
                key={lane.id}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2"
                style={{ backgroundColor: 'var(--surface-panel)', border: '1px solid var(--edge)' }}
              >
                {renamingId === lane.id ? (
                  <>
                    <input
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRename(lane);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      aria-label={`Rename ${lane.label}`}
                      autoFocus
                      className="flex-1 min-w-0 px-3 h-11 rounded-lg text-sm text-fg-strong outline-none"
                      style={{ backgroundColor: 'var(--surface-input)', border: '1px solid var(--edge)' }}
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => saveRename(lane)}
                      className="h-11 px-3 rounded-lg text-xs font-bold text-white flex-shrink-0 disabled:opacity-50"
                      style={{ backgroundColor: 'var(--brand)' }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingId(null)}
                      className="h-11 px-3 rounded-lg text-xs font-bold text-fg-soft flex-shrink-0"
                      style={{ backgroundColor: 'var(--surface-button)' }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 min-w-0 text-sm font-bold">
                      <span className="block truncate">
                        <span className={lane.active ? 'text-fg-strong' : 'text-fg-faint line-through'}>
                          {lane.label}
                        </span>
                        {!lane.active && (
                          <span className="ml-1.5 text-[10px] font-semibold text-fg-faint">(hidden)</span>
                        )}
                      </span>
                      {/* Drivers in a hidden lane render in no column, so this
                          line is the only place they surface. It replaces the
                          header rescue chip: a standing warning on the board
                          was noise, but the count has to live somewhere, and
                          Show puts the lane and its cards straight back. */}
                      {!lane.active && countIn(lane.id) > 0 && (
                        <span
                          className="block text-[10px] font-semibold leading-tight mt-0.5 whitespace-normal"
                          style={{ color: 'var(--status-warn-fg)' }}
                        >
                          {countIn(lane.id)} driver{countIn(lane.id) === 1 ? '' : 's'} still here.
                          Show to put them back on the board.
                        </span>
                      )}
                    </span>
                    {lane.active && countIn(lane.id) > 0 && (
                      <span
                        className="text-[10px] font-bold text-fg-muted tabular-nums flex-shrink-0"
                        title={`${countIn(lane.id)} drivers in this lane`}
                      >
                        {countIn(lane.id)}
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={busy || i === 0}
                      onClick={() => move(i, -1)}
                      aria-label={`Move ${lane.label} up`}
                      className="w-11 h-11 flex items-center justify-center rounded-lg text-fg-muted hover:text-fg-strong transition-colors flex-shrink-0 disabled:opacity-40"
                      style={{ border: '1px solid var(--edge)' }}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      disabled={busy || i === sorted.length - 1}
                      onClick={() => move(i, 1)}
                      aria-label={`Move ${lane.label} down`}
                      className="w-11 h-11 flex items-center justify-center rounded-lg text-fg-muted hover:text-fg-strong transition-colors flex-shrink-0 disabled:opacity-40"
                      style={{ border: '1px solid var(--edge)' }}
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setRenamingId(lane.id);
                        setRenameDraft(lane.label);
                      }}
                      aria-label={`Rename ${lane.label}`}
                      className="w-11 h-11 flex items-center justify-center rounded-lg text-fg-muted hover:text-fg-strong transition-colors flex-shrink-0 disabled:opacity-40"
                      style={{ border: '1px solid var(--edge)' }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => toggleActive(lane)}
                      className="h-11 w-14 rounded-lg text-xs font-bold text-fg-soft transition-colors hover:text-fg-strong flex-shrink-0 disabled:opacity-40"
                      style={{ border: '1px solid var(--edge)' }}
                    >
                      {lane.active ? 'Hide' : 'Show'}
                    </button>
                  </>
                )}
              </div>
            ))}
            {sorted.length === 0 && (
              <p className="text-sm text-fg-faint text-center py-4">
                No lanes yet. Add the first one below.
              </p>
            )}
          </div>

          {/* Add a lane */}
          <div
            className="rounded-lg p-3"
            style={{ backgroundColor: 'var(--surface-inset)', border: '1px dashed var(--edge)' }}
          >
            <div className="text-[10px] text-fg-faint uppercase tracking-wider mb-2">Add a lane</div>
            <div className="flex gap-2">
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addLane(); }}
                placeholder="e.g. Practice Courts"
                className="flex-1 min-w-0 px-3 h-11 rounded-lg text-sm text-fg-strong placeholder-fg-ghost outline-none"
                style={{ backgroundColor: 'var(--surface-panel)', border: '1px solid var(--edge)' }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={addLane}
                className="h-11 px-4 rounded-lg text-xs font-black tracking-widest uppercase text-white flex-shrink-0 transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                + Add
              </button>
            </div>
          </div>

          <p className="text-[10px] text-fg-ghost leading-relaxed">
            Hidden lanes keep their history and can come back any time. A lane with
            drivers still in it can&apos;t be hidden, and lanes are never deleted.
          </p>
        </div>
      </div>
    </div>
  );
}
