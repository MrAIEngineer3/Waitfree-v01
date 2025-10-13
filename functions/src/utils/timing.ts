import * as functions from 'firebase-functions/v1';

export interface TimingSpan {
  end: (status: 'success' | 'error', details?: Record<string, unknown>) => void;
  fail: (details?: Record<string, unknown>) => void;
  succeed: (details?: Record<string, unknown>) => void;
}

const toMs = (start: bigint, end: bigint) => Number(end - start) / 1_000_000;

export const startTiming = (label: string, baseContext?: Record<string, unknown>): TimingSpan => {
  const startedAt = process.hrtime.bigint();
  const context = baseContext ? { ...baseContext } : undefined;

  const end = (status: 'success' | 'error', details?: Record<string, unknown>) => {
    const finishedAt = process.hrtime.bigint();
    const durationMs = toMs(startedAt, finishedAt);
    const payload = {
      label,
      status,
      durationMs,
      ...(context ?? {}),
      ...(details ?? {})
    };
    if (status === 'error') {
      functions.logger.error(`[timing] ${label} failed`, payload);
    } else {
      functions.logger.info(`[timing] ${label} completed`, payload);
    }
  };

  return {
    end,
    fail: (details) => end('error', details),
    succeed: (details) => end('success', details)
  };
};
