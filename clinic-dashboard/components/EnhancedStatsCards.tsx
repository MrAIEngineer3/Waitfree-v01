'use client';

import { useClinicContext } from './ClinicContext';
import { cn } from '@/lib/utils';

interface StatCard {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  gradientFrom: string;
  gradientTo: string;
  bgColor: string;
  textColor: string;
  description?: string;
}

export default function EnhancedStatsCards() {
  const { queue } = useClinicContext();

  const currentToken = queue?.currentToken || 0;
  const totalPatients = queue?.totalPatients || 0;
  const completedPatients = queue?.completedPatients || 0;
  const remainingPatients = totalPatients - completedPatients;
  const completionRate = totalPatients > 0 ? Math.round((completedPatients / totalPatients) * 100) : 0;

  const stats: StatCard[] = [
    {
      label: 'Current Token',
      value: currentToken > 0 ? `#${currentToken}` : '-',
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
    },
    {
      label: 'Total Patients',
      value: totalPatients,
      description: 'In queue today',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      trend: totalPatients > 0 ? { value: 12.5, isPositive: true } : undefined,
      gradientFrom: 'from-amber-500',
      gradientTo: 'to-orange-600',
      bgColor: 'bg-amber-50 dark:bg-amber-950/30',
      textColor: 'text-amber-700 dark:text-amber-400',
    },
    {
      label: 'Completed',
      value: completedPatients,
      description: `${completionRate}% completion rate`,
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      trend: completedPatients > 0 ? { value: 8.2, isPositive: true } : undefined,
      gradientFrom: 'from-emerald-500',
      gradientTo: 'to-teal-600',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
      textColor: 'text-emerald-700 dark:text-emerald-400',
    },
    {
      label: 'Remaining',
      value: remainingPatients,
      description: 'Patients waiting',
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
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="group relative bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden"
          >
            {/* Background gradient on hover */}
            <div className={cn(
              "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300",
              stat.bgColor
            )} />
            
            {/* Content */}
            <div className="relative space-y-4">
              {/* Icon and Trend */}
              <div className="flex items-start justify-between">
                <div className={cn(
                  "flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br shadow-lg",
                  stat.gradientFrom,
                  stat.gradientTo,
                  "text-white"
                )}>
                  {stat.icon}
                </div>
                {stat.trend && (
                  <div className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold",
                    stat.trend.isPositive 
                      ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400" 
                      : "bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400"
                  )}>
                    <svg 
                      className={cn("w-3 h-3", stat.trend.isPositive ? "" : "rotate-180")} 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor" 
                      strokeWidth={3}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                    {stat.trend.value}%
                  </div>
                )}
              </div>

              {/* Value */}
              <div className="space-y-1">
                <div className={cn("text-4xl font-bold tracking-tight tabular-nums", stat.textColor)}>
                  {stat.value}
                </div>
                {stat.description && (
                  <p className="text-xs text-muted-foreground">{stat.description}</p>
                )}
              </div>

              {/* Label */}
              <div className="pt-2 border-t border-border">
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  {stat.label}
                </h3>
              </div>
            </div>

            {/* Removed duplicate Live indicator - kept only in header */}
          </div>
        ))}
      </div>

      {/* Progress Summary Bar */}
      {totalPatients > 0 && (
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
                <p className="text-xs text-muted-foreground mt-0.5">Queue completion status</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-bold text-foreground tabular-nums">{completedPatients}</span>
                <span className="text-muted-foreground">/</span>
                <span className="font-bold text-foreground tabular-nums">{totalPatients}</span>
                <span className="text-muted-foreground">patients</span>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-32 h-2.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500 rounded-full"
                    style={{ width: `${completionRate}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-foreground tabular-nums min-w-[3ch]">
                  {completionRate}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
