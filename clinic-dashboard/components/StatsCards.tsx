'use client';

import { useClinicContext } from './ClinicContext';
import Sparkline from './ui/Sparkline';

export interface StatsCardsProps {
  clinicId?: string;
  doctorId?: string;
}

export default function StatsCards() {
  const { queue } = useClinicContext();

  const stats = [
    {
      label: 'Current Token',
      description: 'Now serving',
      value: queue?.currentToken || 0,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
        </svg>
      ),
      gradient: 'from-blue-500 to-indigo-600',
      bgGradient: 'from-blue-50 to-indigo-50',
      trend: (() => {
        const v = queue?.currentToken || 0;
        return [Math.max(0, v - 4), Math.max(0, v - 2), v - 1, v];
      })(),
      strokeColor: '#3b82f6',
      fillColor: 'rgba(59, 130, 246, 0.15)'
    },
    {
      label: 'Total Patients',
      description: 'In queue today',
      value: queue?.totalPatients || 0,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      gradient: 'from-amber-500 to-orange-600',
      bgGradient: 'from-amber-50 to-orange-50',
      trend: (() => {
        const v = queue?.totalPatients || 0;
        return [v - 3, v - 2, v - 1, v].map(n => Math.max(0, n));
      })(),
      strokeColor: '#f59e0b',
      fillColor: 'rgba(245, 158, 11, 0.15)'
    },
    {
      label: 'Completed',
      description: 'Patients seen',
      value: queue?.completedPatients || 0,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      gradient: 'from-emerald-500 to-teal-600',
      bgGradient: 'from-emerald-50 to-teal-50',
      trend: (() => {
        const v = queue?.completedPatients || 0;
        return [v - 3, v - 1, v - 1, v].map(n => Math.max(0, n));
      })(),
      strokeColor: '#10b981',
      fillColor: 'rgba(16, 185, 129, 0.15)'
    }
  ];

  return (
    <div className="space-y-5">
      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="group relative bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden"
          >
            {/* Subtle gradient background on hover */}
            <div className={`absolute inset-0 bg-gradient-to-br ${stat.bgGradient} dark:opacity-10 opacity-0 group-hover:opacity-100 dark:group-hover:opacity-20 transition-opacity duration-300`} />
            
            {/* Content */}
            <div className="relative space-y-4">
              {/* Header with icon */}
              <div className="flex items-start justify-between">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center text-white shadow-lg shadow-black/10 dark:shadow-black/30`}>
                  {stat.icon}
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 dark:bg-green-400 rounded-full animate-pulse" />
                  <span className="text-xs font-medium text-muted-foreground">Live</span>
                </div>
              </div>

              {/* Value and trend */}
              <div className="space-y-2">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-4xl font-bold text-foreground tabular-nums">
                      {stat.value}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{stat.description}</div>
                  </div>
                  <div className="flex-shrink-0">
                    <Sparkline
                      values={stat.trend as number[]}
                      width={80}
                      height={32}
                      stroke={stat.strokeColor}
                      fill={stat.fillColor}
                    />
                  </div>
                </div>
              </div>

              {/* Label */}
              <div className="pt-3 border-t border-border">
                <h3 className="text-sm font-semibold text-foreground">{stat.label}</h3>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Summary Bar */}
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
              <span className="font-semibold">{queue?.completedPatients || 0}</span>
              <span className="text-muted-foreground"> / </span>
              <span className="font-semibold">{queue?.totalPatients || 0}</span>
              <span className="text-muted-foreground ml-1">patients</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-32 bg-muted rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 h-2 rounded-full transition-all duration-500" 
                  style={{
                    width: `${queue?.totalPatients ? (queue.completedPatients / queue.totalPatients) * 100 : 0}%`
                  }}
                />
              </div>
              <span className="text-xs font-semibold text-muted-foreground">
                {queue?.totalPatients ? Math.round((queue.completedPatients / queue.totalPatients) * 100) : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
