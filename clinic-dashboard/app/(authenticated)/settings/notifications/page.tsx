"use client";

import { useClinicContext } from '@/components/ClinicContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { auth, db } from '@/lib/firebase';
import { getCachedValue, setCachedValue } from '@/lib/settingsCache';
import type { NotificationSettingsDoc } from '@/types/settings';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

const CHANNEL_KEYS = ['whatsapp', 'sms', 'email'] as const;
type ChannelKey = (typeof CHANNEL_KEYS)[number];
type ChannelState = Record<ChannelKey, boolean>;

const EVENT_KEYS = ['tokenUpdates', 'appointmentReminders'] as const;
type EventKey = (typeof EVENT_KEYS)[number];
type EventState = Record<EventKey, boolean>;

const CHANNEL_TEMPLATE: ChannelState = {
  whatsapp: true,
  sms: false,
  email: true,
};

const EVENT_TEMPLATE: EventState = {
  tokenUpdates: true,
  appointmentReminders: true,
};

interface NormalizedSettings {
  channels: ChannelState;
  events: EventState;
}

function createDefaultChannels(): ChannelState {
  return { ...CHANNEL_TEMPLATE };
}

function createDefaultEvents(): EventState {
  return { ...EVENT_TEMPLATE };
}

function normalizeSettings(doc: NotificationSettingsDoc | null | undefined): NormalizedSettings {
  return {
    channels: {
      whatsapp: doc?.channels?.whatsapp ?? CHANNEL_TEMPLATE.whatsapp,
      sms: doc?.channels?.sms ?? CHANNEL_TEMPLATE.sms,
      email: doc?.channels?.email ?? CHANNEL_TEMPLATE.email,
    },
    events: {
      tokenUpdates: doc?.events?.tokenUpdates ?? EVENT_TEMPLATE.tokenUpdates,
      appointmentReminders: doc?.events?.appointmentReminders ?? EVENT_TEMPLATE.appointmentReminders,
    },
  };
}

function isEqualChannelState(a: ChannelState, b: ChannelState): boolean {
  return CHANNEL_KEYS.every((key) => a[key] === b[key]);
}

function isEqualEventState(a: EventState, b: EventState): boolean {
  return EVENT_KEYS.every((key) => a[key] === b[key]);
}

function Toggle({ checked, onChange, label, description, icon }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-accent transition-all">
      {icon && (
        <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <Label htmlFor={`toggle-${label.replace(/\s+/g, '-').toLowerCase()}`} className="text-sm font-semibold text-foreground cursor-pointer">
          {label}
        </Label>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <Switch
        id={`toggle-${label.replace(/\s+/g, '-').toLowerCase()}`}
        checked={checked}
        onCheckedChange={onChange}
        className="data-[state=checked]:bg-primary"
      />
    </div>
  );
}

export default function NotificationsSettingsPage() {
  const { clinicId, notificationSettings, reloadNotificationSettings } = useClinicContext();
  const [channels, setChannels] = useState<ChannelState>(() => createDefaultChannels());
  const [events, setEvents] = useState<EventState>(() => createDefaultEvents());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const lastServerValue = useRef<NormalizedSettings | null>(null);

  const pathSegments = useMemo(
    () => (clinicId ? ['clinics', clinicId, 'settings', 'notifications'] as const : null),
    [clinicId]
  );

  useEffect(() => {
    setError(null);
    setSuccess(null);

    if (!clinicId) {
      setLoading(false);
      lastServerValue.current = null;
      setChannels(createDefaultChannels());
      setEvents(createDefaultEvents());
      return;
    }

    const cached = pathSegments
      ? getCachedValue<NotificationSettingsDoc | null>([...pathSegments])
      : undefined;

    const source = notificationSettings ?? cached;

    if (source !== undefined) {
      if (pathSegments) {
        setCachedValue([...pathSegments], source ?? null);
      }
      const normalized = normalizeSettings(source);
      lastServerValue.current = normalized;
      setChannels(normalized.channels);
      setEvents(normalized.events);
      setLoading(false);
      return;
    }

    setLoading(true);
  }, [clinicId, notificationSettings, pathSegments]);

  useEffect(() => {
    if (!clinicId || notificationSettings !== undefined || !reloadNotificationSettings) {
      return;
    }
    void reloadNotificationSettings();
  }, [clinicId, notificationSettings, reloadNotificationSettings]);

  async function save() {
    if (!clinicId || !pathSegments) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const user = auth.currentUser;
      await setDoc(
        doc(db, 'clinics', clinicId, 'settings', 'notifications'),
        {
          channels,
          events,
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid ?? null,
        },
        { merge: true }
      );
      setCachedValue([...pathSegments], {
        channels: { ...channels },
        events: { ...events },
        updatedBy: user?.uid ?? null,
      });
      if (reloadNotificationSettings) {
        await reloadNotificationSettings();
      }
      const normalized = normalizeSettings({ channels, events });
      lastServerValue.current = normalized;
      setSuccess('Notification preferences saved successfully.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : undefined;
      setError(message ?? 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }

  function resetToServer() {
    setError(null);
    setSuccess(null);
    if (lastServerValue.current) {
      setChannels(lastServerValue.current.channels);
      setEvents(lastServerValue.current.events);
      return;
    }
    setChannels(createDefaultChannels());
    setEvents(createDefaultEvents());
  }

  const hasPendingChanges = useMemo(() => {
    const baseline = lastServerValue.current ?? {
      channels: createDefaultChannels(),
      events: createDefaultEvents(),
    };
    return (
      !isEqualChannelState(channels, baseline.channels) ||
      !isEqualEventState(events, baseline.events)
    );
  }, [channels, events]);

  const channelOptions = useMemo(() => ([
    {
      key: 'whatsapp' as ChannelKey,
      label: 'WhatsApp Notifications',
      description: 'Get real-time updates via WhatsApp',
      icon: (
        <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      ),
    },
    {
      key: 'sms' as ChannelKey,
      label: 'SMS Notifications',
      description: 'Receive updates via text message',
      icon: (
        <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
      ),
    },
    {
      key: 'email' as ChannelKey,
      label: 'Email Notifications',
      description: 'Get updates delivered to your inbox',
      icon: (
        <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
  ]), []);

  const eventOptions = useMemo(() => ([
    {
      key: 'tokenUpdates' as EventKey,
      label: 'Token Updates',
      description: 'Notify when token numbers change',
      icon: (
        <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
        </svg>
      ),
    },
    {
      key: 'appointmentReminders' as EventKey,
      label: 'Appointment Reminders',
      description: 'Send reminders before appointments',
      icon: (
        <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
  ]), []);

  if (loading) {
    return (
      <div className="max-w-4xl">
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading settings…</span>
          </div>
        </div>
      </div>
    );
  }

  if (!clinicId) {
    return (
      <div className="max-w-4xl">
        <Card padding="lg" variant="outline">
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No Clinic Selected</h3>
            <p className="text-sm text-muted-foreground">Attach your account to a clinic to manage notification settings.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Page Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
          <svg className="w-6 h-6 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Notification Preferences</h1>
          <p className="text-sm text-muted-foreground mt-1">Choose how you and your patients receive updates</p>
        </div>
      </div>

      <Separator />

      <Card padding="none" variant="outline" className="overflow-hidden">

        <div className="p-8 space-y-8">
          <section className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">Notification Channels</h3>
                <p className="text-sm text-muted-foreground">Select which channels to receive notifications through</p>
              </div>
            </div>
            <div className="space-y-3">
              {channelOptions.map((option) => (
                <Toggle
                  key={option.key}
                  checked={channels[option.key]}
                  onChange={(checked) => setChannels((prev) => ({ ...prev, [option.key]: checked }))}
                  label={option.label}
                  description={option.description}
                  icon={option.icon}
                />
              ))}
            </div>
          </section>

          <Separator className="my-6" />

          <section className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">Event Types</h3>
                <p className="text-sm text-muted-foreground">Choose which events trigger notifications</p>
              </div>
            </div>
            <div className="space-y-3">
              {eventOptions.map((option) => (
                <Toggle
                  key={option.key}
                  checked={events[option.key]}
                  onChange={(checked) => setEvents((prev) => ({ ...prev, [option.key]: checked }))}
                  label={option.label}
                  description={option.description}
                  icon={option.icon}
                />
              ))}
            </div>
          </section>

          {error && (
            <div className="flex items-start gap-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
              <svg className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-start gap-3 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3">
              <svg className="w-5 h-5 text-green-500 dark:text-green-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-green-700 dark:text-green-400">{success}</span>
            </div>
          )}

          <Separator className="my-6" />

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <Button variant="default" onClick={save} loading={saving} disabled={!clinicId || !hasPendingChanges} className="w-full sm:w-auto">
              Save Preferences
            </Button>
            <Button variant="outline" onClick={resetToServer} disabled={!hasPendingChanges} className="w-full sm:w-auto">
              Reset
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
