'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
}

interface SelectProps<T extends string | number> {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name for the control (also the trigger's title tooltip). */
  label: string;
  /** Which edge of the trigger the popup lines up with. */
  align?: 'left' | 'right';
  className?: string;
}

/**
 * Themed replacement for a native <select>.
 *
 * A native select renders its popup through the OS, so it ignores every theme
 * token in globals.css: on the TV it came up as a translucent light-grey system
 * menu over the dark board, drawn wherever the platform chose (typically over
 * the header, clipped at the top of the window). This keeps the popup in the
 * page so it inherits the board's palette and always opens below the trigger.
 *
 * Focus deliberately stays on the trigger button the whole time and the options
 * are plain divs — the listbox is driven by aria-activedescendant instead of
 * roving focus, so there is no focus to restore when the popup closes.
 */
export default function Select<T extends string | number>({
  value,
  options,
  onChange,
  label,
  align = 'left',
  className = '',
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;

  const current = options.find((o) => o.value === value);

  const openAt = (i: number) => {
    setActiveIndex(i);
    setOpen(true);
  };

  const commit = (i: number) => {
    const opt = options[i];
    if (opt) onChange(opt.value);
    setOpen(false);
  };

  // Dismiss on outside press or on anything that would move the trigger out
  // from under the popup (the board scrolls and the lanes resize behind it).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  // Keep the keyboard-highlighted row visible when the list is long enough to scroll.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`#${CSS.escape(optionId(activeIndex))}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openAt(selectedIndex);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % options.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + options.length) % options.length);
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit(activeIndex);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optionId(activeIndex) : undefined}
        onClick={() => (open ? setOpen(false) : openAt(selectedIndex))}
        onKeyDown={handleKeyDown}
        className="flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-lg text-xs font-bold tracking-widest uppercase text-fg-soft hover:text-fg-strong transition-colors cursor-pointer bg-transparent whitespace-nowrap"
        style={{ border: `1px solid ${open ? 'var(--brand)' : 'var(--edge)'}` }}
      >
        {current?.label ?? ''}
        <ChevronDown
          size={12}
          aria-hidden
          className={`text-fg-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          // z-50 clears the board below it, which becomes its own stacking
          // context at lg+ (the `zoom` on .board-scroll).
          className={`absolute top-full mt-1 z-50 min-w-full py-1 rounded-lg shadow-xl overflow-hidden max-h-64 overflow-y-auto ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          style={{ backgroundColor: 'var(--surface-panel)', border: '1px solid var(--edge)' }}
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            const isActive = i === activeIndex;
            return (
              <div
                key={String(opt.value)}
                id={optionId(i)}
                role="option"
                aria-selected={isSelected}
                // Keep focus on the trigger so the popup never has to hand it back.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => commit(i)}
                className="flex items-center gap-2 pl-2 pr-4 py-1.5 text-xs font-bold tracking-widest uppercase cursor-pointer whitespace-nowrap transition-colors"
                style={{
                  backgroundColor: isActive ? 'var(--surface-inset)' : 'transparent',
                  color: isSelected ? 'var(--brand)' : 'var(--fg-soft)',
                }}
              >
                <Check
                  size={12}
                  aria-hidden
                  className={isSelected ? 'opacity-100' : 'opacity-0'}
                />
                {opt.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
