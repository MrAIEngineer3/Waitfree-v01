"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface DateNavigatorProps {
  value: string; // YYYY-MM-DD
  onChange: (next: string) => void;
  max: string; // typically today
  min?: string; // optional lower bound
  disableFuture?: boolean;
  showTodayButton?: boolean;
  className?: string;
}

function isValidKey(key: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(key);
}

function clamp(key: string, { min, max }: { min?: string; max: string }): string {
  if (!isValidKey(key)) return max;
  if (min && key < min) return min;
  if (key > max) return max;
  return key;
}

function shiftDay(key: string, delta: number): string {
  if (!isValidKey(key)) return key;
  const [y, m, d] = key.split('-').map(Number);
  // Use UTC to avoid local DST/offset issues
  const baseMs = Date.UTC(y, m - 1, d);
  const next = new Date(baseMs + delta * 86400000);
  return next.toISOString().slice(0, 10);
}

export default function DateNavigator({ value, onChange, max, min, disableFuture = true, showTodayButton = true, className }: DateNavigatorProps) {
  const todayKey = max; // semantic alias
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [anim, setAnim] = useState<'enter' | 'idle'>('idle');
  const isToday = value === todayKey;
  const prevDisabled = !!min && value <= min; // optional min logic
  const nextDisabled = disableFuture && value >= todayKey;

  const apply = useCallback((next: string) => {
    const clamped = clamp(next, { min, max });
    onChange(clamped);
  }, [onChange, min, max]);

  const goPrev = () => { if (prevDisabled) return; apply(shiftDay(value, -1)); };
  const goNext = () => { if (nextDisabled) return; apply(shiftDay(value, 1)); };
  const goToday = () => apply(todayKey);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    apply(e.target.value);
  };

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  // Keyboard shortcuts when panel focused
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); }
      if (e.key === 'ArrowLeft') { goPrev(); }
      if (e.key === 'ArrowRight') { goNext(); }
      if (e.key === 't') { goToday(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, goPrev, goNext]);

  useEffect(() => { setMounted(true); }, []);

  // If open toggles true, schedule animation state
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setAnim('enter'));
    } else {
      setAnim('idle');
    }
  }, [open]);

  return (
    <div className={"inline-flex items-center gap-0.5 " + (className || '')}>
      <button
        type="button"
        onClick={goPrev}
        disabled={prevDisabled}
        aria-label="Previous day"
        className="h-6 w-6 flex items-center justify-center text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-800 rounded-lg border border-slate-200 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow"
      >‹</button>
      <div className="relative">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          ref={triggerRef}
          onClick={() => setOpen(o => !o)}
          className="h-6 min-w-[110px] font-mono text-slate-700 px-3 py-0.5 flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-blue-500 text-xs transition-all duration-200 shadow-sm hover:shadow"
        >
          <span className="flex items-center gap-1.5">
            <span className="text-blue-500">📅</span> {value}
            {!isToday && <span className="inline-block text-[9px] uppercase tracking-wide text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">PAST</span>}
          </span>
        </button>
        {mounted && open && createPortal(
          <div className="fixed inset-0 z-[200]" aria-hidden={false} role="presentation">
            <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Select date"
              className={"absolute mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-xl backdrop-blur-sm p-4 space-y-4 origin-top-left animate-scale-fade " + (anim === 'enter' ? 'data-open' : '')}
              style={{
                top: (triggerRef.current?.getBoundingClientRect().bottom || 0) + window.scrollY + 4,
                left: (triggerRef.current?.getBoundingClientRect().left || 0) + window.scrollX,
              }}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-blue-500">📅</span>
                  <span className="text-sm font-semibold text-slate-700">Select Date</span>
                </div>
                <button 
                  onClick={() => setOpen(false)} 
                  aria-label="Close" 
                  className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >✕</button>
              </div>
              <input
                type="date"
                value={value}
                max={max}
                min={min}
                onChange={(e)=>{ handleInputChange(e); setOpen(false); }}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>
          </div>, document.body)
        }
      </div>
      <button
        type="button"
        onClick={goNext}
        disabled={nextDisabled}
        aria-label="Next day"
        className="h-6 w-6 flex items-center justify-center text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-800 rounded-lg border border-slate-200 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow"
      >›</button>
      {showTodayButton && !isToday && (
        <button
          type="button"
          onClick={goToday}
          className="h-6 px-2 py-0.5 text-xs bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 border-0 rounded-lg transition-all duration-200 shadow-sm hover:shadow font-medium"
        >Today</button>
      )}
      <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse ml-1" aria-label="Live" />
    </div>
  );
}
