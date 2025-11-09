'use client';

import type { QueueSummaryStats } from '../types/queue';
import { useClinicContext } from './ClinicContext';
import { Badge } from './ui/Badge';
import { Card } from './ui/Card';

interface CompactStatsBarProps {
  stats?: QueueSummaryStats;
}

export default function CompactStatsBar({ stats }: CompactStatsBarProps) {
  const { queue } = useClinicContext();

  const fallbackStats: QueueSummaryStats = {
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

  const summary = stats ?? fallbackStats;

  const currentTokenDisplay =
    typeof summary.currentToken === 'number' && summary.currentToken > 0 ? `#${summary.currentToken}` : '—';
  const totalSubtitle =
    summary.source === 'derived'
      ? summary.cancelled && summary.cancelled > 0
        ? `Excludes ${summary.cancelled} cancelled`
        : 'Derived from patient list'
      : 'Queue document total';
  const waiting = summary.waiting ?? null;
  const inProgress = summary.inProgress ?? null;
  const remainingSubtitle =
    summary.source === 'derived'
      ? (() => {
          const waitCount = waiting ?? 0;
          const inProgressCount = inProgress ?? 0;
          if (waitCount === 0 && inProgressCount === 0) {
            return 'No patients waiting';
          }
          if (inProgressCount > 0) {
            return `${waitCount} waiting • ${inProgressCount} in-progress`;
          }
          return `${waitCount} waiting`;
        })()
      : 'Queue doc remaining';
  const completionRate = summary.progressPct;

  const cards = [
    {
      label: 'Current Token',
      value: currentTokenDisplay,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
        </svg>
      ),
      isLive: typeof summary.currentToken === 'number' && summary.currentToken > 0,
      subtitle: summary.source === 'derived' ? 'Live patient data' : 'Queue document',
    },
    {
      label: 'Total Patients',
      value: summary.total,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      subtitle: totalSubtitle,
    },
    {
      label: 'Completed',
      value: summary.completed,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      subtitle: `${completionRate}% complete`,
    },
    {
      label: 'Remaining',
      value: summary.remaining,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      subtitle: remainingSubtitle,
    },
  ];

  return (
    <Card className="border-border bg-card shadow-sm">
      <div className="px-4 lg:px-6 py-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {cards.map((stat, index) => (
            <div key={index} className="flex items-center gap-3 min-w-0">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                {stat.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-foreground tabular-nums truncate">
                    {stat.value}
                  </span>
                  {stat.isLive && (
                    <Badge variant="outline" className="px-1.5 py-0 h-5 text-[10px] font-medium border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1" />
                      Live
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {stat.subtitle || stat.label}
                </p>
              </div>
            </div>
          ))}
        </div>

        {summary.total > 0 && (
          <div className="mt-4 pt-3 border-t border-border">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <div className="flex flex-col">
                <span>Today&apos;s Progress</span>
                <span className="text-[10px] uppercase tracking-wide">
                  {summary.source === 'derived' ? 'Derived from patient statuses' : 'Queue doc fallback'}
                </span>
              </div>
              <span className="font-medium tabular-nums">
                {summary.completed} / {summary.total} patients
              </span>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-foreground transition-all duration-500 rounded-full"
                style={{ width: `${completionRate}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
