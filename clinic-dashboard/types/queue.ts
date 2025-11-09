export type QueueStatsSource = 'derived' | 'legacy';

export interface QueueSummaryStats {
  source: QueueStatsSource;
  currentToken: number | null;
  total: number;
  completed: number;
  remaining: number;
  progressPct: number;
  waiting?: number;
  inProgress?: number;
  cancelled?: number;
}
