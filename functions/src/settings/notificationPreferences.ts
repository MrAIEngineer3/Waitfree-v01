import { admin } from '../firebaseAdmin';

export type NotificationChannel = 'whatsapp' | 'sms' | 'email';
export type NotificationEvent = 'tokenUpdates' | 'appointmentReminders';

export interface NotificationPreferences {
  channels: Record<NotificationChannel, boolean>;
  events: Record<NotificationEvent, boolean>;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  channels: {
    whatsapp: true,
    sms: false,
    email: false
  },
  events: {
    tokenUpdates: true,
    appointmentReminders: true
  }
};

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { expiresAt: number; data: NotificationPreferences }>();

const normalizeBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  return fallback;
};

const clonePreferences = (value: NotificationPreferences): NotificationPreferences => ({
  channels: { ...value.channels },
  events: { ...value.events }
});

export const clearNotificationPreferencesCache = (clinicId?: string | null): void => {
  if (!clinicId) {
    cache.clear();
    return;
  }
  cache.delete(clinicId);
};

export const getNotificationPreferences = async (
  clinicId: string | null | undefined
): Promise<NotificationPreferences> => {
  if (!clinicId) {
    return clonePreferences(DEFAULT_PREFERENCES);
  }

  const cached = cache.get(clinicId);
  if (cached && cached.expiresAt > Date.now()) {
    return clonePreferences(cached.data);
  }

  const docRef = admin
    .firestore()
    .collection('clinics')
    .doc(clinicId)
    .collection('settings')
    .doc('notifications');

  const snap = await docRef.get();
  const raw = snap.exists ? (snap.data() as Record<string, unknown>) : undefined;
  const rawChannels = (raw?.channels as Record<string, unknown>) || {};
  const rawEvents = (raw?.events as Record<string, unknown>) || {};

  const resolved: NotificationPreferences = {
    channels: {
      whatsapp: normalizeBoolean(rawChannels.whatsapp, DEFAULT_PREFERENCES.channels.whatsapp),
      sms: normalizeBoolean(rawChannels.sms, DEFAULT_PREFERENCES.channels.sms),
      email: normalizeBoolean(rawChannels.email, DEFAULT_PREFERENCES.channels.email)
    },
    events: {
      tokenUpdates: normalizeBoolean(rawEvents.tokenUpdates, DEFAULT_PREFERENCES.events.tokenUpdates),
      appointmentReminders: normalizeBoolean(
        rawEvents.appointmentReminders,
        DEFAULT_PREFERENCES.events.appointmentReminders
      )
    }
  };

  cache.set(clinicId, { data: resolved, expiresAt: Date.now() + CACHE_TTL_MS });
  return clonePreferences(resolved);
};

export const isNotificationEnabled = async (options: {
  clinicId: string | null | undefined;
  channel?: NotificationChannel;
  event?: NotificationEvent;
}): Promise<boolean> => {
  const channel = options.channel ?? 'whatsapp';
  const event = options.event ?? 'tokenUpdates';
  const prefs = await getNotificationPreferences(options.clinicId);

  if (!prefs.channels[channel]) {
    return false;
  }
  if (event && !prefs.events[event]) {
    return false;
  }
  return true;
};
