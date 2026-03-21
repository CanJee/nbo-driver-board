'use client';

import { useEffect, useRef, useState } from 'react';
import { Driver } from '@/lib/types';
import EquipmentInput, {
  formatEquipment,
  parseEquipment,
} from '@/components/ui/EquipmentInput';

interface AssignModalProps {
  driver: Driver;
  activeDrivers: Driver[];   // for duplicate validation
  onConfirm: (walkieNumber: string, carNumber: string) => void;
  onCancel: () => void;
}

export default function AssignModal({ driver, activeDrivers, onConfirm, onCancel }: AssignModalProps) {
  // Store digits only internally; format to "W-XX" / "C-XX" on submit
  const [walkieDigits, setWalkieDigits] = useState(parseEquipment(driver.walkie_number));
  const [carDigits, setCarDigits]       = useState(parseEquipment(driver.car_number));
  const [error, setError] = useState<string | null>(null);

  const walkieRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    walkieRef.current?.focus({ preventScroll: true });
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const walkieVal = formatEquipment(walkieDigits, 'W-');
    const carVal    = formatEquipment(carDigits, 'C-');

    // Duplicate walkie check
    if (walkieVal) {
      const conflict = activeDrivers.find(
        (d) => d.id !== driver.id && d.walkie_number === walkieVal
      );
      if (conflict) {
        setError(`Walkie ${walkieVal} is already assigned to ${conflict.name}.`);
        return;
      }
    }

    // Duplicate car check
    if (carVal) {
      const conflict = activeDrivers.find(
        (d) => d.id !== driver.id && d.car_number === carVal
      );
      if (conflict) {
        setError(`Car ${carVal} is already assigned to ${conflict.name}.`);
        return;
      }
    }

    onConfirm(walkieVal, carVal);
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="rounded-xl p-6 w-80 shadow-2xl"
        style={{ backgroundColor: '#161B22', border: '1px solid #3B82F6' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-white font-bold text-lg mb-1">Assign Equipment</h2>
        <p className="text-slate-400 text-sm mb-4">
          Walkie and car numbers for{' '}
          <span className="text-white font-semibold">{driver.name}</span>.
        </p>

        {error && (
          <div
            className="text-sm text-white rounded-lg px-3 py-2 mb-3"
            style={{ backgroundColor: '#7F1D1D', border: '1px solid #E41C23' }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1">
              Walkie Number
            </label>
            <EquipmentInput
              ref={walkieRef}
              prefix="W-"
              value={walkieDigits}
              onChange={(d) => { setWalkieDigits(d); setError(null); }}
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1">
              Car Number
            </label>
            <EquipmentInput
              prefix="C-"
              value={carDigits}
              onChange={(d) => { setCarDigits(d); setError(null); }}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2 rounded-lg text-sm font-bold text-slate-300 hover:text-white transition-colors"
              style={{ backgroundColor: '#2D3748' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2 rounded-lg text-sm font-bold text-white hover:opacity-80 transition-opacity"
              style={{ backgroundColor: '#3B82F6' }}
            >
              Assign
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
