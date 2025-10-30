"use client";
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
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
    <div className={"inline-flex items-center gap-1 " + (className || '')}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={goPrev}
        disabled={prevDisabled}
        aria-label="Previous day"
        className="h-8 w-8 p-0"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </Button>
      
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-haspopup="dialog"
            aria-expanded={open}
            className="h-8 min-w-[140px] justify-center gap-2 font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>{value}</span>
            {!isToday && (
              <Badge variant="outline" className="ml-auto text-[9px] px-1 h-4">
                PAST
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={new Date(value)}
            onSelect={handleDateSelect}
            initialFocus
            disabled={(date) =>
              (min ? date < new Date(min) : false) || (max ? date > new Date(max) : false)
            }
          />
        </PopoverContent>
      </Popover>
      
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={goNext}
        disabled={nextDisabled}
        aria-label="Next day"
        className="h-8 w-8 p-0"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </Button>
      
      {showTodayButton && !isToday && (
        <Button
          type="button"
          size="sm"
          variant="default"
          onClick={goToday}
          className="h-8"
        >
          Today
        </Button>
      )}
      
      {/* Removed duplicate LIVE indicator - kept only in header */}
    </div>
  );
}
