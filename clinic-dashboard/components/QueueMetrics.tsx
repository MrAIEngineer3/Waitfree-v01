"use client";
import React from 'react';

export interface QueueMetricsProps {
  currentToken?: number;
  completedPatients?: number;
  totalPatients?: number;
  status?: 'active' | 'paused' | 'ended';
}

function StatCard({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="flex flex-col rounded-lg bg-white/60 border border-gray-300 px-4 py-3 min-w-[140px]">
      <span className="text-[11px] uppercase tracking-wide text-gray-600 font-medium mb-1">{label}</span>
      <span className={`text-lg font-semibold ${accent || 'text-gray-900'}`}>{value}</span>
    </div>
  );
}

export default function QueueMetrics({ currentToken, completedPatients, totalPatients, status }: QueueMetricsProps) {
  const remaining = (totalPatients ?? 0) - (completedPatients ?? 0);
  const progressPct = totalPatients && totalPatients > 0 ? Math.min(100, Math.round(((completedPatients ?? 0) / totalPatients) * 100)) : 0;
  return (
    <div className="flex flex-wrap gap-3 items-stretch">
      <StatCard label="Status" value={<span className="inline-flex items-center gap-1">{status || '—'}</span>} accent={status === 'active' ? 'text-green-600' : status === 'paused' ? 'text-yellow-600' : status === 'ended' ? 'text-red-600' : undefined} />
      <StatCard label="Current Token" value={currentToken ?? '—'} accent="text-blue-600" />
      <StatCard label="Completed" value={completedPatients ?? 0} accent="text-emerald-600" />
      <StatCard label="Total" value={totalPatients ?? 0} accent="text-indigo-600" />
      <StatCard label="Remaining" value={remaining} accent="text-orange-600" />
      <StatCard label="Progress" value={`${progressPct}%`} accent="text-cyan-600" />
    </div>
  );
}
