"use client";

import { differenceInCalendarDays, format, subDays } from 'date-fns';
import { CalendarIcon, RefreshCwIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';

import { AnalyticsDailyTable } from '../../../components/AnalyticsDailyTable';
import { AnalyticsSummaryCards } from '../../../components/AnalyticsSummaryCards';
import { useClinicContext } from '../../../components/ClinicContext';
import { Button } from '../../../components/ui/Button';
import { Calendar } from '../../../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import { computeAnalyticsSummary } from '../../../lib/analytics-summary';
import { useDailyAnalytics } from '../../../lib/hooks/use-daily-analytics';

const buildRange = (days: number): DateRange => {
  const today = new Date();
  const start = subDays(today, Math.max(days - 1, 0));
  return { from: start, to: today };
};

const formatRangeLabel = (range: DateRange | undefined): string => {
  if (!range?.from && !range?.to) {
    return 'Select dates';
  }
  if (range?.from && range?.to) {
    if (range.from.toDateString() === range.to.toDateString()) {
      return format(range.from, 'MMM d, yyyy');
    }
    return `${format(range.from, 'MMM d, yyyy')} – ${format(range.to, 'MMM d, yyyy')}`;
  }
  const single = range?.from ?? range?.to;
  return single ? format(single, 'MMM d, yyyy') : 'Select dates';
};

const PRESETS = [
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
];

export default function AnalyticsPage() {
  const { clinicId, clinicName, doctorId } = useClinicContext();
  const hasContext = Boolean(clinicId && doctorId);

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => buildRange(7));
  const [activePreset, setActivePreset] = useState<number | null>(7);

  const analyticsQuery = useDailyAnalytics({
    clinicId,
    doctorId,
    range: dateRange,
    enabled: hasContext,
  });

  const summary = useMemo(
    () => computeAnalyticsSummary(analyticsQuery.data),
    [analyticsQuery.data]
  );

  const rangeLabel = useMemo(() => formatRangeLabel(dateRange), [dateRange]);

  const selectedDayCount = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) {
      return dateRange?.from || dateRange?.to ? 1 : 0;
    }
    return differenceInCalendarDays(dateRange.to, dateRange.from) + 1;
  }, [dateRange]);

  const handlePresetChange = (days: number) => {
    setDateRange(buildRange(days));
    setActivePreset(days);
  };

  const handleRangeSelect = (nextRange: DateRange | undefined) => {
    setDateRange(nextRange);
    setActivePreset(null);
  };

  const handleReset = () => {
    const defaultRange = buildRange(7);
    setDateRange(defaultRange);
    setActivePreset(7);
  };

  const queryErrorMessage = analyticsQuery.error
    ? analyticsQuery.error instanceof Error
      ? analyticsQuery.error.message
      : 'Please try again.'
    : null;

  return (
    <div className="space-y-6 pb-8">
      <div className="relative">
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-blue-50/50 via-indigo-50/30 to-transparent blur-3xl dark:from-blue-950/20 dark:via-indigo-950/10 dark:to-transparent" />
        <div className="relative rounded-2xl border border-border bg-card/70 p-6 shadow-sm backdrop-blur-sm sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Analytics</h1>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Insights for {clinicName || 'your clinic'} across daily queue summaries
                  </p>
                </div>
              </div>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<RefreshCwIcon className="h-4 w-4" />}
                onClick={() => analyticsQuery.refetch()}
                loading={analyticsQuery.isFetching}
              >
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      {hasContext ? (
        <div className="space-y-6">
          {queryErrorMessage ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Failed to load analytics. {queryErrorMessage}
            </div>
          ) : null}

          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card/80 p-4 shadow-sm md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{rangeLabel}</p>
              <p className="text-xs text-muted-foreground">
                Showing {summary?.dayCount ?? analyticsQuery.data?.length ?? 0} day{(summary?.dayCount ?? analyticsQuery.data?.length ?? 0) === 1 ? '' : 's'} of data · Selection spans {selectedDayCount} calendar day{selectedDayCount === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  variant={activePreset === preset.days ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handlePresetChange(preset.days)}
                >
                  {preset.label}
                </Button>
              ))}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" leftIcon={<CalendarIcon className="h-4 w-4" />}>
                    {rangeLabel}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar mode="range" selected={dateRange} onSelect={handleRangeSelect} numberOfMonths={2} />
                  <div className="flex items-center justify-between border-t border-border px-4 py-2">
                    <span className="text-xs text-muted-foreground">Tip: click twice to select a single day</span>
                    <Button variant="ghost" size="sm" onClick={handleReset}>
                      Reset
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                className="sm:hidden"
                variant="outline"
                size="sm"
                leftIcon={<RefreshCwIcon className="h-4 w-4" />}
                onClick={() => analyticsQuery.refetch()}
                loading={analyticsQuery.isFetching}
              >
                Refresh
              </Button>
            </div>
          </div>

          <AnalyticsSummaryCards summary={summary} isLoading={analyticsQuery.isLoading || analyticsQuery.isFetching} />

          <AnalyticsDailyTable records={analyticsQuery.data} isLoading={analyticsQuery.isLoading || analyticsQuery.isFetching} />
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-sm">
          <div className="mx-auto flex max-w-md flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <svg className="h-8 w-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground">Complete Clinic Setup</h3>
              <p className="text-sm text-muted-foreground">
                Set up your clinic profile to unlock aggregated analytics and historical insights.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
