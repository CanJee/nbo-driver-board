'use client';

import { useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  /** Board-wide hit count; null when no search is active (hides the pill). */
  matchCount: number | null;
  /** Wrapper classes — the header instance sets its own width/visibility. */
  className?: string;
  autoFocus?: boolean;
  /** Register the global "/" focus shortcut (header instance only, so the
   *  two rendered instances don't both grab the key). */
  enableSlashShortcut?: boolean;
  /** Called on Esc when the input is already empty (mobile row uses it to close). */
  onDismiss?: () => void;
}

export default function SearchBox({
  value,
  onChange,
  matchCount,
  className = '',
  autoFocus = false,
  enableSlashShortcut = false,
  onDismiss,
}: SearchBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!enableSlashShortcut) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        t instanceof HTMLElement &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enableSlashShortcut]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (value) {
        onChange('');
      } else {
        inputRef.current?.blur();
        onDismiss?.();
      }
    }
  };

  return (
    <div className={`relative items-center ${className}`}>
      <Search
        size={14}
        className="absolute left-2.5 text-fg-faint pointer-events-none"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus={autoFocus}
        placeholder="Search"
        aria-label="Search drivers by name, walkie, car, phone, or notes"
        className="w-full py-1.5 pl-8 pr-14 rounded-lg text-sm text-fg-strong placeholder:text-fg-ghost outline-none focus:border-accent-blue transition-colors"
        style={{ backgroundColor: 'var(--surface-input)', border: '1px solid var(--edge)' }}
      />
      {matchCount !== null && (
        <span
          title={`${matchCount} match${matchCount === 1 ? '' : 'es'}`}
          className="absolute right-8 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none tabular-nums"
          style={
            matchCount > 0
              ? { backgroundColor: 'var(--status-warn-strong-bg)', color: 'var(--status-warn-fg)' }
              : { backgroundColor: 'var(--status-error-bg)', color: 'var(--status-error-fg)' }
          }
        >
          {matchCount}
        </span>
      )}
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
          className="absolute right-2 text-fg-faint hover:text-fg-strong transition-colors"
        >
          <X size={14} />
        </button>
      ) : (
        <kbd
          className="absolute right-2 hidden xl:block text-[10px] text-fg-ghost px-1 rounded pointer-events-none"
          style={{ border: '1px solid var(--edge)' }}
          aria-hidden
        >
          /
        </kbd>
      )}
    </div>
  );
}
