"use client";

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useClinicContext } from '@/components/ClinicContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import type { ClinicSchedulingSettings } from '@/lib/scheduling';
import { fetchClinicSchedulingSettings, updateClinicSchedulingSettings } from '@/lib/scheduling';

const emptySettings: ClinicSchedulingSettings = {
  manualCheckInRequired: false,
  allowOfflineSignups: false,
};

export default function WorkflowSettingsPage() {
  const { clinicId } = useClinicContext();
  const [settings, setSettings] = useState<ClinicSchedulingSettings>(emptySettings);
  const [baseline, setBaseline] = useState<ClinicSchedulingSettings>(emptySettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!clinicId) {
      setSettings(emptySettings);
      setBaseline(emptySettings);
      setDirty(false);
      setError(null);
      setLoading(false);
      return () => {
        isMounted = false;
      };
    }

    setLoading(true);
    setError(null);
    fetchClinicSchedulingSettings(clinicId)
      .then((data) => {
        if (!isMounted) {
          return;
        }
        setSettings(data);
        setBaseline(data);
        setDirty(false);
      })
      .catch((err) => {
        if (!isMounted) {
          return;
        }
        const message = err instanceof Error ? err.message : 'Failed to load workflow settings.';
        setError(message);
        toast.error(message);
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [clinicId]);

  const pendingChanges = useMemo(() => dirty && !loading, [dirty, loading]);

  const equalsBaseline = (next: ClinicSchedulingSettings) =>
    next.manualCheckInRequired === baseline.manualCheckInRequired
    && next.allowOfflineSignups === baseline.allowOfflineSignups;

  const handleToggle = (key: keyof ClinicSchedulingSettings) => (nextValue: boolean) => {
    setSettings((prev) => {
      const next: ClinicSchedulingSettings = {
        ...prev,
        [key]: nextValue,
      };
      if (key === 'manualCheckInRequired' && !nextValue) {
        next.allowOfflineSignups = false;
      }
      setDirty(!equalsBaseline(next));
      return next;
    });
  };

  const handleReset = () => {
    setSettings(baseline);
    setDirty(false);
  };

  const handleSave = async () => {
    if (!clinicId) {
      toast.error('Select a clinic to update workflow settings.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const next = await updateClinicSchedulingSettings(clinicId, settings);
      setSettings(next);
      setBaseline(next);
      setDirty(false);
      toast.success('Workflow settings saved.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save workflow settings.';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (!clinicId) {
    return (
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Workflow settings unavailable</CardTitle>
          <CardDescription>
            Sign in with a clinic account to manage manual check-in and offline signup preferences.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 3H7a2 2 0 01-2-2V7a2 2 0 012-2h3l1-2h2l1 2h3a2 2 0 012 2v10a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workflow settings</h1>
          <p className="text-sm text-muted-foreground">Control how patients join your waitlist and when staff approval is required.</p>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Manual check-in controls</CardTitle>
          <CardDescription>
            Set clinic-wide preferences for patient arrivals and self-registration from the lobby.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <Label htmlFor="manual-check-in" className="text-base font-medium">
                Require staff approval before patients join the queue
              </Label>
              <p className="text-sm text-muted-foreground">
                When enabled, new arrivals stay pending until a team member checks them in.
              </p>
            </div>
            <Switch
              id="manual-check-in"
              checked={settings.manualCheckInRequired}
              disabled={loading || saving}
              onCheckedChange={handleToggle('manualCheckInRequired')}
            />
          </section>

          <Separator />

          <section className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <Label htmlFor="offline-signups" className="text-base font-medium">
                Allow offline signups when the kiosk is offline
              </Label>
              <p className="text-sm text-muted-foreground">
                Give reception staff permission to add patients if the self-service app goes down temporarily. Enabled only when manual approval is required.
              </p>
            </div>
            <Switch
              id="offline-signups"
              checked={settings.allowOfflineSignups}
              disabled={loading || saving || !settings.manualCheckInRequired}
              onCheckedChange={handleToggle('allowOfflineSignups')}
            />
          </section>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={!pendingChanges || loading || saving}
            >
              Reset changes
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!pendingChanges || saving}
              loading={saving}
            >
              Save workflow settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
