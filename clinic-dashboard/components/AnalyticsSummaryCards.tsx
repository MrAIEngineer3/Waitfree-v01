"use client";

import type { AggregatedAnalyticsSummary } from '@/lib/analytics-summary';
import { Skeleton } from './ui/skeleton';

const percentFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

const integerFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

const minutesFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

const formatPercent = (value: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  return `${percentFormatter.format(value)}%`;
};

const formatMinutes = (value: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  return `${minutesFormatter.format(value)} min`;
};

const formatInteger = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '0';
  }
  return integerFormatter.format(value);
};

interface AnalyticsSummaryCardsProps {
  summary: AggregatedAnalyticsSummary | null;
  isLoading: boolean;
}

export function AnalyticsSummaryCards({ summary, isLoading }: AnalyticsSummaryCardsProps) {
  const counterQueueDays = summary?.counterSourceBreakdown.queue ?? 0;
  const counterFallbackDays = summary?.counterSourceBreakdown.patients ?? 0;
  const metricsQueueDays = summary?.metricsSourceBreakdown.queue ?? 0;
  const metricsFallbackDays = summary?.metricsSourceBreakdown.patients ?? 0;

  const cards = [
    {
      label: 'Total Patients',
      value: formatInteger(summary?.totalPatients),
      meta: summary
        ? `${formatInteger(summary.completedPatients)} completed · ${summary.dayCount} day${summary.dayCount === 1 ? '' : 's'} · ${counterQueueDays} queue · ${counterFallbackDays} fallback`
        : '—',
      accent: 'from-blue-500 to-indigo-600',
      chip: `${formatInteger(summary?.completedPatients)} completed`,
    },
    {
      label: 'Completion Rate',
      value: formatPercent(summary?.completionRate ?? null),
      meta: summary ? `${formatPercent(summary?.cancellationRate ?? null)} cancelled` : '—',
      accent: 'from-emerald-500 to-teal-500',
      chip: summary ? `${formatInteger(summary.completedPatients)} of ${formatInteger(summary.totalPatients)}` : '—',
    },
    {
      label: 'Average Wait',
      value: formatMinutes(summary?.averageWaitMinutes ?? null),
      meta: summary ? `${metricsQueueDays} queue · ${metricsFallbackDays} fallback` : '—',
      accent: 'from-amber-500 to-orange-500',
      chip: summary ? `${formatInteger(summary.waitSamples)} samples` : '—',
    },
    {
      label: 'Average Service',
      value: formatMinutes(summary?.averageServiceMinutes ?? null),
      meta: summary ? `${metricsQueueDays} queue · ${metricsFallbackDays} fallback` : '—',
      accent: 'from-purple-500 to-fuchsia-500',
      chip: summary ? `${formatInteger(summary.serviceSamples)} samples` : '—',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:shadow-lg"
        >
          <div
            className={`absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-gradient-to-br ${card.accent} dark:opacity-20`}
          />
          <div className="relative space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{card.label}</span>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                {isLoading ? <Skeleton className="h-4 w-16" /> : card.chip}
              </span>
            </div>
            <div className="space-y-1">
              <div className="text-4xl font-bold text-foreground">
                {isLoading ? <Skeleton className="h-10 w-24" /> : card.value}
              </div>
              <div className="text-xs text-muted-foreground">
                {isLoading ? <Skeleton className="h-4 w-32" /> : card.meta}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
