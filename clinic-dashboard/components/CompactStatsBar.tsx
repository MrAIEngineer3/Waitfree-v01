'use client';

import { useClinicContext } from './ClinicContext';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';

export default function CompactStatsBar() {
  const { queue } = useClinicContext();

  const currentToken = queue?.currentToken || 0;
  const totalPatients = queue?.totalPatients || 0;
  const completedPatients = queue?.completedPatients || 0;
  const remainingPatients = totalPatients - completedPatients;
  const completionRate = totalPatients > 0 ? Math.round((completedPatients / totalPatients) * 100) : 0;

  const stats = [
    {
      label: 'Current Token',
      value: currentToken > 0 ? `#${currentToken}` : '—',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
        </svg>
      ),
      isLive: currentToken > 0,
    },
    {
      label: 'Total Patients',
      value: totalPatients,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      label: 'Completed',
      value: completedPatients,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      subtitle: `${completionRate}% complete`,
    },
    {
      label: 'Remaining',
      value: remainingPatients,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  return (
    <Card className="border-border bg-card shadow-sm">
      <div className="px-4 lg:px-6 py-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="flex items-center gap-3 min-w-0"
            >
              {/* Icon */}
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                {stat.icon}
              </div>

              {/* Content */}
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

        {/* Progress bar for completion */}
        {totalPatients > 0 && (
          <div className="mt-4 pt-3 border-t border-border">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span>Today&apos;s Progress</span>
              <span className="font-medium tabular-nums">
                {completedPatients} / {totalPatients} patients
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
