"use client";
import React from 'react';
import type { QueueSummaryStats } from '../types/queue';

export interface QueueMetricsProps {
  stats?: QueueSummaryStats;
  currentToken?: number;
  completedPatients?: number;
  totalPatients?: number;
  status?: 'active' | 'paused' | 'ended';
}

function StatCard({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="flex flex-col rounded-lg bg-card/60 border border-border px-4 py-3 min-w-[140px]">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">{label}</span>
      <span className={`text-lg font-semibold ${accent || 'text-foreground'}`}>{value}</span>
    </div>
  );
}

export default function QueueMetrics({ stats, currentToken, completedPatients, totalPatients, status }: QueueMetricsProps) {
  const fallbackStats: QueueSummaryStats = {
    source: 'legacy',
    currentToken: currentToken ?? null,
    total: totalPatients ?? 0,
    completed: completedPatients ?? 0,
    remaining: Math.max((totalPatients ?? 0) - (completedPatients ?? 0), 0),
    progressPct:
      totalPatients && totalPatients > 0
        ? Math.min(100, Math.round(((completedPatients ?? 0) / (totalPatients ?? 0)) * 100))
        : 0,
  };

  const summary = stats ?? fallbackStats;
  const currentTokenDisplay =
    typeof summary.currentToken === 'number' && summary.currentToken > 0 ? summary.currentToken : '—';

  return (
    <div className="flex flex-wrap gap-3 items-stretch">
      <StatCard
        label="Status"
        value={<span className="inline-flex items-center gap-1">{status || '—'}</span>}
        accent={
          status === 'active'
            ? 'text-green-600'
            : status === 'paused'
            ? 'text-yellow-600'
            : status === 'ended'
            ? 'text-red-600'
            : undefined
        }
      />
      <StatCard label="Current Token" value={currentTokenDisplay} accent="text-blue-600" />
      <StatCard label="Completed" value={summary.completed} accent="text-emerald-600" />
      <StatCard label="Total" value={summary.total} accent="text-indigo-600" />
      <StatCard label="Remaining" value={summary.remaining} accent="text-orange-600" />
      <StatCard label="Progress" value={`${summary.progressPct}%`} accent="text-cyan-600" />
    </div>
  );
}
