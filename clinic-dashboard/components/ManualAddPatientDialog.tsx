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
  const [nameTouched, setNameTouched] = useState(false);
  const [ageTouched, setAgeTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; age?: string; phone?: string }>({});
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
      setNameTouched(false);
      setAgeTouched(false);
      setPhoneTouched(false);
      setFieldErrors({});
      setSkipNotification(false);
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (phone.trim().length === 0 && skipNotification) {
      setSkipNotification(false);
    }
  }, [phone, skipNotification]);

  const collapseWhitespace = (value: string) => value.replace(/\s+/g, ' ');

  const normalizeName = (value: string): { result?: string; error?: string } => {
    const trimmed = collapseWhitespace(value.trim());
    if (!trimmed) {
      return { error: 'Patient name is required.' };
    }
    if (trimmed.length < 2 || trimmed.length > 100) {
      return { error: 'Name must be between 2 and 100 characters.' };
    }
    return { result: trimmed };
  };

  const normalizeAge = (value: string): { result?: number | null; error?: string } => {
    const digits = value.replace(/\D+/g, '');
    if (!digits) {
      return { result: null };
    }
    const parsed = Number.parseInt(digits, 10);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      return { error: 'Age must be a whole number.' };
    }
    if (parsed < 1 || parsed > 120) {
      return { error: 'Age must be between 1 and 120.' };
    }
    return { result: parsed };
  };

  const normalizePhone = (value: string): { result?: string | null; error?: string } => {
    const digits = value.replace(/\D+/g, '');
    if (!digits) {
      return { result: null };
    }
    if (digits.length === 10) {
      return { result: `+91${digits}` };
    }
    if (digits.length === 12 && digits.startsWith('91')) {
      return { result: `+${digits}` };
    }
    if (digits.length === 13 && digits.startsWith('091')) {
      return { result: `+${digits.slice(1)}` };
    }
    return { error: 'Enter a valid 10-digit Indian mobile number.' };
  };

  const validateFields = (current: { name: string; age: string; phone: string }) => {
    const errors: { name?: string; age?: string; phone?: string } = {};
    const sanitized: { name?: string; age?: number | null; phone?: string | null } = {};

    const nameResult = normalizeName(current.name);
    if (nameResult.error) {
      errors.name = nameResult.error;
    } else {
      sanitized.name = nameResult.result;
    }

    const ageResult = normalizeAge(current.age);
    if (ageResult.error) {
      errors.age = ageResult.error;
    } else {
      sanitized.age = ageResult.result ?? null;
    }

    const phoneResult = normalizePhone(current.phone);
    if (phoneResult.error) {
      errors.phone = phoneResult.error;
    } else {
      sanitized.phone = phoneResult.result ?? null;
    }

    return { errors, sanitized };
  };

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

    const validation = validateFields({ name, age, phone });
    setFieldErrors(validation.errors);
    setNameTouched(true);
    setAgeTouched(true);
    setPhoneTouched(true);

    if (validation.errors.name || validation.errors.age || validation.errors.phone) {
      toast.error('Please check the highlighted fields.');
      if (!validation.sanitized.phone && skipNotification) {
        setSkipNotification(false);
      }
      return;
    }

    const sanitizedName = validation.sanitized.name ?? name.trim();
    const sanitizedAge = validation.sanitized.age ?? null;
    const sanitizedPhone = validation.sanitized.phone ?? null;

    if (!sanitizedPhone && skipNotification) {
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
          name: sanitizedName,
          ...(sanitizedAge != null ? { age: sanitizedAge } : {}),
          ...(sanitizedPhone ? { phone: sanitizedPhone } : {}),
        },
        suppressNotification: skipNotification && !!sanitizedPhone,
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
              onChange={(event) => {
                const value = event.target.value;
                setName(value);
                if (nameTouched) {
                  const { errors } = validateFields({ name: value, age, phone });
                  setFieldErrors((prev) => ({ ...prev, name: errors.name }));
                }
              }}
              onBlur={() => {
                setNameTouched(true);
                const { errors } = validateFields({ name, age, phone });
                setFieldErrors((prev) => ({ ...prev, name: errors.name }));
              }}
              autoFocus
              disabled={loading}
            />
            {nameTouched && fieldErrors.name ? (
              <p className="text-xs text-destructive">{fieldErrors.name}</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="manual-patient-age">Age (optional)</Label>
              <Input
                id="manual-patient-age"
                placeholder="e.g. 32"
                value={age}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D+/g, '');
                  const next = digits.slice(0, 3);
                  setAge(next);
                  if (ageTouched) {
                    const { errors } = validateFields({ name, age: next, phone });
                    setFieldErrors((prev) => ({ ...prev, age: errors.age }));
                  }
                }}
                onBlur={() => {
                  setAgeTouched(true);
                  const { errors } = validateFields({ name, age, phone });
                  setFieldErrors((prev) => ({ ...prev, age: errors.age }));
                }}
                inputMode="numeric"
                disabled={loading}
              />
              {ageTouched && fieldErrors.age ? (
                <p className="text-xs text-destructive">{fieldErrors.age}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-patient-phone">Phone (optional)</Label>
              <Input
                id="manual-patient-phone"
                placeholder="10 digit phone"
                value={phone}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D+/g, '');
                  const next = digits.slice(0, 12);
                  setPhone(next);
                  if (phoneTouched) {
                    const { errors } = validateFields({ name, age, phone: next });
                    setFieldErrors((prev) => ({ ...prev, phone: errors.phone }));
                  }
                }}
                onBlur={() => {
                  setPhoneTouched(true);
                  const { errors } = validateFields({ name, age, phone });
                  setFieldErrors((prev) => ({ ...prev, phone: errors.phone }));
                }}
                inputMode="tel"
                disabled={loading}
              />
              {phoneTouched && fieldErrors.phone ? (
                <p className="text-xs text-destructive">{fieldErrors.phone}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Digits only. Leave blank if not available.</p>
              )}
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
              disabled={!clinicId || !doctorId || !queueId || !normalizeName(name).result || !canModifyQueue || loading}
            >
              Add to queue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
