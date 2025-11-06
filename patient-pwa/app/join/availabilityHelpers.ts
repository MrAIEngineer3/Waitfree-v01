import type { DoctorAvailabilityPayload } from '@/lib/availability';

export const createPlaceholderAvailability = (
  message = 'Fetching the latest status…'
): DoctorAvailabilityPayload => ({
  status: 'UNAVAILABLE',
  layer: 'placeholder',
  reasonCode: 'FETCHING',
  message,
  computedAt: new Date().toISOString(),
  nextAvailableAt: null,
  activeOverride: null,
  realTimeStatus: null,
  debug: { source: 'placeholder' },
});

export function formatNextAvailability(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  } catch {
    return null;
  }
}

export function describeAvailability(availability: DoctorAvailabilityPayload | null | undefined) {
  if (!availability) {
    return {
      headline: 'Checking availability…',
      statusLabel: 'Checking…',
      detail: 'Fetching the latest status.',
      indicatorClass: 'bg-muted animate-pulse',
      tone: 'neutral' as const,
      nextAvailable: null,
    };
  }

  if (availability.status === 'AVAILABLE') {
    return {
      headline: 'Doctor is available now',
      statusLabel: 'Available',
      detail: availability.message ?? 'You can continue to join the queue.',
      indicatorClass: 'bg-emerald-500',
      tone: 'positive' as const,
      nextAvailable: null,
    };
  }

  const next = formatNextAvailability(availability.nextAvailableAt);
  let baseMessage = availability.message ?? 'Doctor is currently offline';

  baseMessage = baseMessage.replace(/Expected back:?\s*[^.]*\.?/i, '').trim();

  let detail = baseMessage;
  if (next) {
    detail = `${baseMessage.replace(/\.$/, '')}. Expected back ${next}.`;
  } else if (!baseMessage.endsWith('.')) {
    detail = `${baseMessage}.`;
  }

  const indicatorClass =
    availability.reasonCode === 'REALTIME_OFFLINE' || availability.layer === 'REALTIME_TOGGLE'
      ? 'bg-red-500'
      : 'bg-amber-500';

  return {
    headline: 'Doctor is currently unavailable',
    statusLabel: 'Offline',
    detail,
    indicatorClass,
    tone: 'warning' as const,
    nextAvailable: availability.nextAvailableAt ?? null,
  };
}
