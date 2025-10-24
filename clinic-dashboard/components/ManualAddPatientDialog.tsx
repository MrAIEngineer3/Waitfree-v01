"use client";

import { useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { functions } from '@/lib/firebase';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';

interface ManualAddPatientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string | null;
  doctorId: string | null;
  queueId: string | null;
  queueStatus?: 'active' | 'paused' | 'ended' | 'closed';
}

export function ManualAddPatientDialog({
  open,
  onOpenChange,
  clinicId,
  doctorId,
  queueId,
  queueStatus,
}: ManualAddPatientDialogProps) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [skipNotification, setSkipNotification] = useState(false);
  const [loading, setLoading] = useState(false);

  const canModifyQueue = useMemo(() => {
    if (!queueStatus) return true;
    return queueStatus !== 'ended' && queueStatus !== 'closed';
  }, [queueStatus]);

  useEffect(() => {
    if (!open) {
      setName('');
      setAge('');
      setPhone('');
      setSkipNotification(false);
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (phone.trim().length === 0 && skipNotification) {
      setSkipNotification(false);
    }
  }, [phone, skipNotification]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!clinicId || !doctorId || !queueId) {
      toast.error('Clinic information is missing. Please refresh and try again.');
      return;
    }
    if (!canModifyQueue) {
      toast.error('This queue has ended. New patients cannot be added.');
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Patient name is required.');
      return;
    }

    let ageNumber: number | undefined;
    const trimmedAge = age.trim();
    if (trimmedAge.length > 0) {
      const parsedAge = Number(trimmedAge);
      if (!Number.isFinite(parsedAge) || parsedAge <= 0 || parsedAge > 200) {
        toast.error('Age must be a number between 1 and 200.');
        return;
      }
      ageNumber = Math.round(parsedAge);
    }

    let normalizedPhone: string | undefined;
    const trimmedPhone = phone.trim();
    if (trimmedPhone.length > 0) {
      const digitsOnly = trimmedPhone.replace(/\D+/g, '');
      if (digitsOnly.length !== 10) {
        toast.error('Phone number must contain exactly 10 digits.');
        return;
      }
      normalizedPhone = digitsOnly;
    }

    if (!normalizedPhone && skipNotification) {
      setSkipNotification(false);
    }

    setLoading(true);
    try {
      interface ManualAddPatientPayload {
        clinicId: string;
        doctorId: string;
        queueId: string;
        patient: {
          name: string;
          age?: number;
          phone?: string;
        };
        suppressNotification: boolean;
      }

      interface ManualAddPatientResult {
        success: boolean;
        patientId: string;
        queueId: string;
        doctorId: string;
        clinicId: string;
        accessToken: string;
        tokenNumber: number;
      }

      const callable = httpsCallable<ManualAddPatientPayload, ManualAddPatientResult>(functions, 'manualAddPatient');
      const payload: ManualAddPatientPayload = {
        clinicId,
        doctorId,
        queueId,
        patient: {
          name: trimmedName,
          ...(ageNumber != null ? { age: ageNumber } : {}),
          ...(normalizedPhone ? { phone: normalizedPhone } : {}),
        },
        suppressNotification: skipNotification && !!normalizedPhone,
      };

      const { data } = await callable(payload);
      if (!data?.success) {
        toast.error('Failed to add patient. Please try again.');
        return;
      }

      toast.success(`Patient added to queue (Token #${data.tokenNumber}).`);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to manually add patient', error);
      const message = error instanceof Error ? error.message : 'Failed to add patient. Please try again.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (!canModifyQueue && next) {
        toast.error('This queue has ended. New patients cannot be added.');
        return;
      }
      onOpenChange(next);
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Patient Manually</DialogTitle>
          <DialogDescription>
            Create a queue entry for patients who checked in at the desk. Notifications are optional.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="manual-patient-name">Patient name</Label>
            <Input
              id="manual-patient-name"
              placeholder="Enter patient name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="manual-patient-age">Age (optional)</Label>
              <Input
                id="manual-patient-age"
                placeholder="e.g. 32"
                value={age}
                onChange={(event) => setAge(event.target.value)}
                inputMode="numeric"
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-patient-phone">Phone (optional)</Label>
              <Input
                id="manual-patient-phone"
                placeholder="10 digit phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                inputMode="tel"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">Digits only. Leave blank if not available.</p>
            </div>
          </div>

          {phone.trim().length > 0 && (
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">Skip WhatsApp notification</p>
                <p className="text-xs text-muted-foreground">Keep enabled to add the patient quietly if they are already in the clinic.</p>
              </div>
              <Switch
                checked={skipNotification}
                onCheckedChange={(checked) => setSkipNotification(checked)}
                disabled={loading}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={loading}
              disabled={!clinicId || !doctorId || !queueId || !name.trim() || !canModifyQueue}
            >
              Add to queue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
