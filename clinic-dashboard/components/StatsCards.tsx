'use client';

import type { QueueSummaryStats } from '../types/queue';
import { useClinicContext } from './ClinicContext';

export interface StatsCardsProps {
  stats?: QueueSummaryStats;
  clinicId?: string;
  doctorId?: string;
}

export default function StatsCards({ stats }: StatsCardsProps) {
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
  const cancelled = summary.cancelled ?? 0;

  const currentTokenDisplay =
    typeof summary.currentToken === 'number' && summary.currentToken > 0 ? `#${summary.currentToken}` : '—';

  const totalDescription =
    summary.source === 'derived'
      ? cancelled > 0
        ? `Excludes ${cancelled} cancelled`
        : 'Derived from patient list'
      : 'Queue document total';

  const completedDescription = `${summary.progressPct}% complete`;
  const progressMeta = summary.source === 'derived' ? 'Derived from patient statuses' : 'Queue doc fallback';

  const cards = [
    {
      label: 'Current Token',
      description: 'Now serving',
      value: currentTokenDisplay,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
        </svg>
      ),
      gradient: 'from-blue-500 to-indigo-600',
      bgGradient: 'from-blue-50 to-indigo-50',
    },
    {
      label: 'Total Patients',
      description: totalDescription,
      value: summary.total,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      gradient: 'from-amber-500 to-orange-600',
      bgGradient: 'from-amber-50 to-orange-50',
    },
    {
      label: 'Completed',
      description: completedDescription,
      value: summary.completed,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      gradient: 'from-emerald-500 to-teal-600',
      bgGradient: 'from-emerald-50 to-teal-50',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cards.map((stat, index) => (
          <div
            key={index}
            className="group relative bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden"
          >
            <div
              className={`absolute inset-0 bg-gradient-to-br ${stat.bgGradient} dark:opacity-10 opacity-0 group-hover:opacity-100 dark:group-hover:opacity-20 transition-opacity duration-300`}
            />

            <div className="relative space-y-4">
              <div className="flex items-start justify-between">
                <div
                  className={`w-11 h-11 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center text-white shadow-lg shadow-black/10 dark:shadow-black/30`}
                >
                  {stat.icon}
                </div>
                {summary.source === 'derived' ? (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 dark:bg-green-400 rounded-full animate-pulse" />
                    <span className="text-xs font-medium text-muted-foreground">Live</span>
                  </div>
                ) : (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Queue doc
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-4xl font-bold text-foreground tabular-nums">
                      {stat.value}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{stat.description}</div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border">
                <h3 className="text-sm font-semibold text-foreground">{stat.label}</h3>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gradient-to-r from-muted/50 to-muted border border-border rounded-xl p-4">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span className="font-medium">Today&apos;s Progress:</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-foreground">
              <span className="font-semibold">{summary.completed}</span>
              <span className="text-muted-foreground"> / </span>
              <span className="font-semibold">{summary.total}</span>
              <span className="text-muted-foreground ml-1">patients</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-32 bg-muted rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${summary.progressPct}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-muted-foreground">
                {summary.progressPct}%
              </span>
            </div>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{progressMeta}</p>
      </div>
    </div>
  );
}
