'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Upload, AlertTriangle, CheckCircle, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { LANE_LABELS, SHIFT_COLORS, SHIFT_LABELS } from '@/lib/types';
import { getTournamentDate, formatRosterDate } from '@/lib/date';
import { RosterParseResult, parseRosterCsv, parseRosterMatrix } from '@/lib/roster/parse';

interface Sheet {
  name: string;
  result: RosterParseResult;
}

// exceljs cell → string. Time/date cells can arrive as JS Date objects (not text);
// format them deterministically rather than letting Date.toString() leak through.
function cellText(cell: { value: unknown; text?: string }): string {
  const v = cell.value;
  if (v instanceof Date) {
    if (v.getFullYear() <= 1901) {
      // Excel stores a bare time-of-day on the 1899/1900 epoch.
      let h = v.getHours();
      const m = v.getMinutes();
      const mer = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return `${h}:${String(m).padStart(2, '0')} ${mer}`;
    }
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  return cell.text ?? '';
}

// Read every worksheet into the cell matrix the parser expects.
async function xlsxToSheets(buffer: ArrayBuffer): Promise<Sheet[]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map((ws) => {
    const matrix: string[][] = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => { cells[col - 1] = cellText(cell); });
      for (let i = 0; i < cells.length; i++) if (cells[i] == null) cells[i] = '';
      matrix.push(cells);
    });
    return { name: ws.name, result: parseRosterMatrix(matrix) };
  });
}

export default function RosterImport() {
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [selectedSheet, setSelectedSheet] = useState(0);
  const [date, setDate] = useState(getTournamentDate());
  const [replaceDay, setReplaceDay] = useState(true);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const result = sheets[selectedSheet]?.result ?? null;

  // When every row carries its own date (a Date column), use those; otherwise the
  // single date picker applies to all rows.
  const allRowsHaveDate = !!result && result.rows.length > 0 && result.rows.every((r) => r.shift_date);
  const effectiveDate = (rowDate: string) => rowDate || date;

  const distinctDates = useMemo(() => {
    if (!result) return [];
    return [...new Set(result.rows.map((r) => r.shift_date || date))].sort();
  }, [result, date]);

  const summary = useMemo(() => {
    if (!result) return null;
    const byPeriod = { morning: 0, afternoon: 0, evening: 0 } as Record<string, number>;
    const people = new Set<string>();
    let drivers = 0;
    for (const r of result.rows) {
      byPeriod[r.shift_type]++;
      people.add(`${r.name}|${r.phone}`);
      if (r.role.trim().toLowerCase() === 'fleet driver') drivers++;
    }
    return { people: people.size, drivers, byPeriod };
  }, [result]);

  const selectSheet = (i: number) => {
    setSelectedSheet(i);
    setDone(null);
    const d = sheets[i]?.result.detectedDate;
    if (d) setDate(d);
  };

  const handleFile = async (file: File) => {
    setParseError(null);
    setDone(null);
    setSheets([]);
    setSelectedSheet(0);
    setFileName(file.name);
    try {
      const lower = file.name.toLowerCase();
      let loaded: Sheet[];
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        loaded = await xlsxToSheets(await file.arrayBuffer());
      } else {
        loaded = [{ name: file.name, result: parseRosterCsv(await file.text()) }];
      }
      setSheets(loaded);
      const d = loaded[0]?.result.detectedDate;
      if (d) setDate(d);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not read this file.');
    }
  };

  const handleImport = async () => {
    if (!result || result.rows.length === 0) return;
    setImporting(true);
    setDone(null);
    setParseError(null);

    const payload = result.rows.map((r) => ({ ...r, shift_date: effectiveDate(r.shift_date) }));
    const dates = [...new Set(payload.map((p) => p.shift_date))];

    let error;
    if (replaceDay) {
      // Make the DB match the file for the affected date(s): clear, then insert.
      const del = await supabase.from('roster').delete().in('shift_date', dates);
      if (del.error) error = del.error;
      else error = (await supabase.from('roster').insert(payload)).error;
    } else {
      // Merge: keep existing rows, add/update by conflict key.
      error = (await supabase
        .from('roster')
        .upsert(payload, { onConflict: 'shift_date,name,shift_type,source_location' })).error;
    }

    if (error) {
      setParseError(`Import failed: ${error.message}`);
      setImporting(false);
      return;
    }

    setDone(`Imported ${payload.length} assignments for ${dates.map(formatRosterDate).join(', ')}.`);
    setImporting(false);
  };

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: '#0D1117' }}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-white tracking-wide uppercase">Import Roster</h1>
            <p className="text-sm text-slate-400 mt-1">
              Upload the daily ShiftCrew export (CSV or Excel) to set the schedule.
            </p>
          </div>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={14} /> Board
          </Link>
        </div>

        {/* Upload + date */}
        <div className="rounded-xl p-5 mb-5" style={{ backgroundColor: '#161B22', border: '1px solid #2D3748' }}>
          <div className="grid grid-cols-[1fr_auto] gap-4 items-end">
            <div>
              <label className="block text-[11px] font-bold tracking-widest uppercase mb-2" style={{ color: '#E41C23' }}>
                1 · Roster file
              </label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#2D3748' }}
              >
                <Upload size={15} /> {fileName || 'Choose CSV / Excel file'}
              </button>
            </div>
            {!allRowsHaveDate && (
              <div>
                <label className="block text-[11px] font-bold tracking-widest uppercase mb-2" style={{ color: '#E41C23' }}>
                  2 · Roster date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="px-3 py-2.5 rounded-lg text-sm text-white outline-none"
                  style={{ backgroundColor: '#0D1117', border: '1px solid #2D3748', colorScheme: 'dark' }}
                />
              </div>
            )}
          </div>

          {/* Worksheet selector (multi-sheet workbooks) */}
          {sheets.length > 1 && (
            <div className="mt-4">
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Worksheet</label>
              <div className="flex flex-wrap gap-2">
                {sheets.map((s, i) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => selectSheet(i)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                    style={{
                      backgroundColor: selectedSheet === i ? '#E41C23' : '#0D1117',
                      border: `1px solid ${selectedSheet === i ? '#E41C23' : '#2D3748'}`,
                      color: selectedSheet === i ? '#fff' : '#94A3B8',
                    }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {result && distinctDates.length > 0 && (
            <p className="text-[11px] text-slate-500 mt-3">
              {allRowsHaveDate ? 'Dates in file: ' : 'Importing for: '}
              {distinctDates.map(formatRosterDate).join('  ·  ')}
            </p>
          )}
        </div>

        {parseError && (
          <div className="text-sm text-white rounded-lg px-4 py-3 mb-5 flex items-center gap-2"
            style={{ backgroundColor: '#7F1D1D', border: '1px solid #E41C23' }}>
            <AlertTriangle size={16} /> {parseError}
          </div>
        )}

        {done && (
          <div className="text-sm text-white rounded-lg px-4 py-3 mb-5 flex items-center gap-2"
            style={{ backgroundColor: '#052E16', border: '1px solid #16A34A' }}>
            <CheckCircle size={16} color="#16A34A" /> {done}{' '}
            <Link href="/" className="underline font-semibold ml-1">Go to board</Link>
          </div>
        )}

        {/* Preview */}
        {result && (
          <>
            {/* Summary */}
            {summary && (
              <div className="flex flex-wrap gap-3 mb-4 text-xs">
                <span className="px-3 py-1.5 rounded-lg text-slate-300" style={{ backgroundColor: '#161B22', border: '1px solid #2D3748' }}>
                  <span className="font-bold text-white">{result.rows.length}</span> assignments
                </span>
                <span className="px-3 py-1.5 rounded-lg text-slate-300" style={{ backgroundColor: '#161B22', border: '1px solid #2D3748' }}>
                  <span className="font-bold text-white">{summary.people}</span> people · {summary.drivers} fleet drivers
                </span>
                {(['morning', 'afternoon', 'evening'] as const).map((p) => (
                  <span key={p} className="px-3 py-1.5 rounded-lg text-slate-300 flex items-center gap-1.5"
                    style={{ backgroundColor: '#161B22', border: '1px solid #2D3748' }}>
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: SHIFT_COLORS[p] }} />
                    {SHIFT_LABELS[p]}: <span className="font-bold text-white">{summary.byPeriod[p]}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: '#3F2D0A', border: '1px solid #B45309' }}>
                <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wider mb-2">
                  <AlertTriangle size={14} /> {result.warnings.length} warning{result.warnings.length > 1 ? 's' : ''}
                </div>
                <ul className="text-xs text-amber-200 space-y-1 max-h-32 overflow-y-auto list-disc list-inside">
                  {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

            {/* Table */}
            {result.rows.length > 0 && (
              <div className="rounded-xl overflow-hidden mb-5" style={{ border: '1px solid #2D3748' }}>
                <div className="max-h-[45vh] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0" style={{ backgroundColor: '#161B22' }}>
                      <tr className="text-slate-400 uppercase tracking-wider text-[10px]">
                        <th className="text-left px-3 py-2 font-bold">Name</th>
                        <th className="text-left px-3 py-2 font-bold">Role</th>
                        <th className="text-left px-3 py-2 font-bold">Period</th>
                        <th className="text-left px-3 py-2 font-bold">Time</th>
                        <th className="text-left px-3 py-2 font-bold">Lane</th>
                        <th className="text-left px-3 py-2 font-bold">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((r, i) => (
                        <tr key={i} style={{ backgroundColor: i % 2 ? '#0D1117' : '#12161D' }}>
                          <td className="px-3 py-1.5 text-white font-medium">{r.name}</td>
                          <td className="px-3 py-1.5 text-slate-400">{r.role}</td>
                          <td className="px-3 py-1.5">
                            <span className="inline-flex items-center gap-1.5 text-slate-200">
                              <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: SHIFT_COLORS[r.shift_type] }} />
                              {SHIFT_LABELS[r.shift_type]}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-slate-400">{r.shift_label || '—'}</td>
                          <td className="px-3 py-1.5 text-slate-300">{LANE_LABELS[r.lane]}</td>
                          <td className="px-3 py-1.5 text-slate-500 truncate max-w-[180px]">{r.source_location || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Import action */}
            {result.rows.length > 0 && (
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={replaceDay}
                    onChange={(e) => setReplaceDay(e.target.checked)}
                    className="accent-[#E41C23]"
                  />
                  Replace existing assignments for {distinctDates.length > 1 ? 'these dates' : 'this date'}
                </label>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl font-black text-sm tracking-widest uppercase text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: '#E41C23' }}
                >
                  <FileText size={15} />
                  {importing ? 'Importing…' : `Import ${result.rows.length} assignment${result.rows.length > 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
