"use client";
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { useCallback, useState } from 'react';

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
  const isToday = value === todayKey;
  const prevDisabled = !!min && value <= min; // optional min logic
  const nextDisabled = disableFuture && value >= todayKey;

  const apply = useCallback((next: string) => {
    const clamped = clamp(next, { min, max });
    onChange(clamped);
  }, [onChange, min, max]);

  const goPrev = useCallback(() => {
    if (prevDisabled) return;
    apply(shiftDay(value, -1));
  }, [apply, prevDisabled, value]);

  const goNext = useCallback(() => {
    if (nextDisabled) return;
    apply(shiftDay(value, 1));
  }, [apply, nextDisabled, value]);

  const goToday = useCallback(() => {
    apply(todayKey);
  }, [apply, todayKey]);

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      apply(date.toISOString().slice(0, 10));
    }
    setOpen(false);
  };

  return (
    <div className={"inline-flex items-center gap-0.5 " + (className || '')}>
      <button
        type="button"
        onClick={goPrev}
        disabled={prevDisabled}
        aria-label="Previous day"
        className="h-6 w-6 flex items-center justify-center text-muted-foreground bg-background hover:bg-accent hover:text-foreground rounded-lg border border-border transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow"
      >‹</button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            className="h-6 min-w-[110px] font-mono text-foreground px-3 py-0.5 flex items-center justify-center rounded-lg bg-background border border-border hover:bg-accent hover:border-border focus-visible:ring-2 focus-visible:ring-ring text-xs transition-all duration-200 shadow-sm hover:shadow"
          >
            <span className="flex items-center gap-1.5">
              <span className="text-blue-500">📅</span> {value}
              {!isToday && <span className="inline-block text-[9px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">PAST</span>}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4">
          <Calendar
            mode="single"
            selected={new Date(value)}
            onSelect={handleDateSelect}
            initialFocus
            disabled={(date) =>
              (min ? date < new Date(min) : false) || (max ? date > new Date(max) : false)
            }
            className="text-lg"
          />
        </PopoverContent>
      </Popover>
      <button
        type="button"
        onClick={goNext}
        disabled={nextDisabled}
        aria-label="Next day"
        className="h-6 w-6 flex items-center justify-center text-muted-foreground bg-background hover:bg-accent hover:text-foreground rounded-lg border border-border transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow"
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
