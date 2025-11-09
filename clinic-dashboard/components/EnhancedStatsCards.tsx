'use client';

import { cn } from '@/lib/utils';
import type { QueueSummaryStats } from '../types/queue';
import { useClinicContext } from './ClinicContext';

interface StatCard {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  gradientFrom: string;
  gradientTo: string;
  bgColor: string;
  textColor: string;
  description?: string;
  meta?: string;
}

interface EnhancedStatsCardsProps {
  stats?: QueueSummaryStats;
}

export default function EnhancedStatsCards({ stats }: EnhancedStatsCardsProps) {
  const { queue } = useClinicContext();

  const fallbackSummary: QueueSummaryStats = {
    source: 'legacy',
    currentToken: queue?.currentToken ?? null,
    total: queue?.totalPatients ?? 0,
    completed: queue?.completedPatients ?? 0,
    remaining: Math.max((queue?.totalPatients ?? 0) - (queue?.completedPatients ?? 0), 0),
    progressPct:
      (queue?.totalPatients ?? 0) > 0
        ? Math.min(100, Math.round(((queue?.completedPatients ?? 0) / (queue?.totalPatients ?? 0)) * 100))
        : 0,
  };

  const summary = stats ?? fallbackSummary;

  const waiting = summary.waiting ?? Math.max(summary.remaining - (summary.inProgress ?? 0), 0);
  const inProgress = summary.inProgress ?? 0;
  const cancelled = summary.cancelled ?? 0;

  const currentTokenDisplay =
    typeof summary.currentToken === 'number' && summary.currentToken > 0 ? `#${summary.currentToken}` : '-';

  const totalDescription =
    summary.source === 'derived'
      ? cancelled > 0
        ? `Excludes ${cancelled} cancelled`
        : 'Derived from patient list'
      : 'Queue document total';

  const remainingDescription =
    summary.source === 'derived'
      ? inProgress > 0
        ? `${waiting} waiting • ${inProgress} in-progress`
        : `${waiting} waiting`
      : 'Queue doc remaining';

  const completionDescription = `${summary.progressPct}% completion rate`;
  const dataSourceLabel = summary.source === 'derived' ? 'Derived' : 'Legacy';
  const progressMeta = summary.source === 'derived' ? 'Derived from patient statuses' : 'Queue doc fallback';

  const cards: StatCard[] = [
    {
      label: 'Current Token',
      value: currentTokenDisplay,
      description: 'Now serving',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
        </svg>
      ),
      gradientFrom: 'from-blue-600',
      gradientTo: 'to-indigo-600',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30',
      textColor: 'text-blue-700 dark:text-blue-400',
      meta: dataSourceLabel,
    },
    {
      label: 'Total Patients',
      value: summary.total,
      description: totalDescription,
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      gradientFrom: 'from-amber-500',
      gradientTo: 'to-orange-600',
      bgColor: 'bg-amber-50 dark:bg-amber-950/30',
      textColor: 'text-amber-700 dark:text-amber-400',
      meta: dataSourceLabel,
    },
    {
      label: 'Completed',
      value: summary.completed,
      description: completionDescription,
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      gradientFrom: 'from-emerald-500',
      gradientTo: 'to-teal-600',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
      textColor: 'text-emerald-700 dark:text-emerald-400',
    },
    {
      label: 'Remaining',
      value: summary.remaining,
      description: remainingDescription,
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      gradientFrom: 'from-violet-500',
      gradientTo: 'to-purple-600',
      bgColor: 'bg-violet-50 dark:bg-violet-950/30',
      textColor: 'text-violet-700 dark:text-violet-400',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {cards.map((stat, index) => (
          <div
            key={index}
            className="group relative bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden"
          >
            <div
              className={cn(
                'absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300',
                stat.bgColor
              )}
            />

            <div className="relative space-y-4">
              <div className="flex items-start justify-between">
                <div
                  className={cn(
                    'flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br shadow-lg',
                    stat.gradientFrom,
                    stat.gradientTo,
                    'text-white'
                  )}
                >
                  {stat.icon}
                </div>
                {stat.meta ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {stat.meta}
                  </span>
                ) : null}
              </div>

              <div className="space-y-1">
                <div className={cn('text-4xl font-bold tracking-tight tabular-nums', stat.textColor)}>
                  {stat.value}
                </div>
                {stat.description ? (
                  <p className="text-xs text-muted-foreground">{stat.description}</p>
                ) : null}
              </div>

              <div className="pt-2 border-t border-border">
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  {stat.label}
                </h3>
              </div>
            </div>
          </div>
        ))}
      </div>

      {summary.total > 0 && (
        <div className="bg-gradient-to-r from-muted/50 to-muted/30 border border-border rounded-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">Today&apos;s Progress</h4>
                <p className="text-xs text-muted-foreground mt-0.5">{progressMeta}</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-bold text-foreground tabular-nums">{summary.completed}</span>
                <span className="text-muted-foreground">/</span>
                <span className="font-bold text-foreground tabular-nums">{summary.total}</span>
                <span className="text-muted-foreground">patients</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-32 h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500 rounded-full"
                    style={{ width: `${summary.progressPct}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-foreground tabular-nums min-w-[3ch]">
                  {summary.progressPct}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
