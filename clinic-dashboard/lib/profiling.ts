const isBrowser = typeof window !== 'undefined';
const enableProfiling = isBrowser && process.env.NEXT_PUBLIC_QUEUE_PROFILING === 'true';

interface QueueProfilerStore {
  renders: Record<string, { count: number; lastLogAt: number; totalDuration: number }>;
  snapshots: Record<string, { count: number; lastSize: number; lastLatency: number; lastAt: number }>;
}

declare global {
  interface Window {
    __wfQueueProfiler__?: QueueProfilerStore;
  }
}

const getStore = (): QueueProfilerStore | null => {
  if (!enableProfiling || !isBrowser) return null;
  if (!window.__wfQueueProfiler__) {
    window.__wfQueueProfiler__ = {
      renders: {},
      snapshots: {},
    };
  }
  return window.__wfQueueProfiler__ ?? null;
};

export const queueProfilingEnabled = enableProfiling;

export const recordRender = (label: string, durationMs: number) => {
  const store = getStore();
  if (!store) return;
  const bucket = (store.renders[label] ??= { count: 0, lastLogAt: performance.now(), totalDuration: 0 });
  bucket.count += 1;
  bucket.totalDuration += durationMs;
  const elapsed = performance.now() - bucket.lastLogAt;
  if (bucket.count === 1 || elapsed >= 2000) {
    const avg = bucket.totalDuration / bucket.count;
    console.info(`[queue-profiler] render(${label}) count=${bucket.count} avg=${avg.toFixed(2)}ms`);
    bucket.lastLogAt = performance.now();
    bucket.count = 0;
    bucket.totalDuration = 0;
  }
};

export interface SnapshotEvent {
  size: number;
  latencyMs: number;
}

export const recordSnapshot = (label: string, event: SnapshotEvent) => {
  const store = getStore();
  if (!store) return;
  const bucket = (store.snapshots[label] ??= { count: 0, lastSize: 0, lastLatency: 0, lastAt: performance.now() });
  bucket.count += 1;
  bucket.lastSize = event.size;
  bucket.lastLatency = event.latencyMs;
  const now = performance.now();
  const diff = now - bucket.lastAt;
  if (bucket.count === 1 || diff >= 2000) {
    console.info(
      `[queue-profiler] snapshot(${label}) count=${bucket.count} latency=${event.latencyMs.toFixed(2)}ms size=${event.size}`
    );
    bucket.count = 0;
    bucket.lastAt = now;
  }
};

export const markPhase = (label: string, phase: 'start' | 'end') => {
  if (!enableProfiling || !isBrowser) return;
  const key = `${label}-${phase}`;
  if (phase === 'start') {
    performance.mark(key);
  } else {
    const startKey = `${label}-start`;
    const entries = performance.getEntriesByName(startKey);
    if (!entries.length) {
      console.warn('[queue-profiler] missing start mark for phase', label);
      return;
    }

    performance.mark(key);

    const measureName = `${label}-duration`;
    try {
      performance.measure(measureName, startKey, key);
      const measures = performance.getEntriesByName(measureName);
      const last = measures[measures.length - 1];
      if (last) {
        console.info(`[queue-profiler] phase(${label}) ${last.duration.toFixed(2)}ms`);
      }
      performance.clearMarks(startKey);
      performance.clearMarks(key);
      performance.clearMeasures(measureName);
    } catch (err) {
      console.warn('[queue-profiler] failed to measure phase', label, err);
    }
  }
};
