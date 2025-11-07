import { logEvent, type Analytics, type EventParams } from 'firebase/analytics';
import { loadAnalytics } from './firebase';

const MAX_ID_LENGTH = 64;

type AnalyticsPayload = EventParams & Record<string, unknown>;

const sanitizeId = (value: string | null | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length <= MAX_ID_LENGTH) {
    return trimmed;
  }
  return trimmed.slice(0, MAX_ID_LENGTH);
};

const normalizeParams = (params: AnalyticsPayload | undefined): AnalyticsPayload | undefined => {
  if (!params) {
    return undefined;
  }
  const next: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(params)) {
    if (raw == null) {
      continue;
    }
    if (typeof raw === 'string') {
      const sanitized = sanitizeId(raw);
      if (sanitized) {
        next[key] = sanitized;
      }
      continue;
    }
    if (typeof raw === 'number' || typeof raw === 'boolean') {
      next[key] = raw;
      continue;
    }
    if (typeof raw === 'object') {
      try {
        next[key] = JSON.stringify(raw);
      } catch {
        // ignore non-serializable entries
      }
    }
  }
  return next as AnalyticsPayload;
};

const emit = async (eventName: string, params?: AnalyticsPayload) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const analytics = await loadAnalytics();
    if (!analytics) {
      return;
    }
    const normalized = normalizeParams(params);
    logEvent(analytics as Analytics, eventName, normalized);
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[analytics] Failed to log event', eventName, error);
    }
  }
};

export const trackAnalyticsEvent = (eventName: string, params?: AnalyticsPayload) => {
  void emit(eventName, params);
};

export const anonymizeId = (value: string | null | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return `anon_${trimmed.slice(-8)}`;
};
