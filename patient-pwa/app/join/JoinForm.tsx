'use client';

import { useInvalidateDoctorAvailability } from '@/lib/hooks/use-doctor-availability';
import { useJoinQueue } from '@/lib/hooks/use-join-queue';
import { httpsCallable } from 'firebase/functions';
import { useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { formatClinicShareCode, normalizeClinicShareCode, parseClinicIdentifierFromQuery, parseClinicIdentifierFromText, sanitizeClinicSlug } from '@/lib/clinicIdentifier';
import { cn } from '@/lib/utils';

import {
  type ClinicDoctorAvailabilityResponse,
  type DoctorAvailabilityPayload
} from '../../lib/availability';
import { functions } from '../../lib/firebase';
import {
  deserializeAvailabilityPayload,
  evaluateJoinEligibility,
  isCallableError,
} from '../../lib/joinLogic';
import {
  fetchClinicSchedulingSettings,
  getDefaultClinicSchedulingSettings,
  type ClinicSchedulingSettings,
} from '../../lib/scheduling';
import { DoctorAvailabilityCard, DoctorAvailabilitySkeleton } from './DoctorAvailabilityCard';
import JoinLoadingScreen from './JoinLoadingScreen';
import { createPlaceholderAvailability, describeAvailability } from './availabilityHelpers';
import type { DoctorAvailabilitySnapshot, DoctorListEntry } from './types';

const OFFLINE_NOTIFICATION_PROMPT =
  'You can request a notification when the doctor is back online.';

const MIN_INTRO_DURATION_MS = 600;

type NotifyState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
};

interface RequestDoctorOnlineNotificationPayload {
  clinicId: string;
  doctorId: string;
  phone: string;
  patientName?: string;
}

interface RequestDoctorOnlineNotificationResult {
  success: boolean;
  alreadyOnline?: boolean;
  alreadyQueued?: boolean;
  enqueueEligible?: boolean;
  status?: 'pending' | 'sent';
  availability?: {
    status: DoctorAvailabilityPayload['status'];
    layer: string;
    reasonCode: string;
    message: string | null;
    nextAvailableAt: string | null;
    realTimeStatus: DoctorAvailabilityPayload['realTimeStatus'];
  };
}

type PatientFieldErrors = {
  name?: string;
  age?: string;
  phone?: string;
};

const collapseWhitespace = (value: string) => value.replace(/\s+/g, ' ');

const normalizeName = (value: string): { result?: string; error?: string } => {
  const trimmed = collapseWhitespace(value.trim());
  if (!trimmed) {
    return { error: 'Please enter your full name.' };
  }
  if (trimmed.length < 2 || trimmed.length > 100) {
    return { error: 'Name must be between 2 and 100 characters.' };
  }
  return { result: trimmed };
};

const normalizeAge = (value: string, required: boolean): { result?: number | null; error?: string } => {
  const digits = value.replace(/\D+/g, '');
  if (!digits) {
    return required ? { error: 'Please enter your age.' } : { result: null };
  }
  const parsed = Number.parseInt(digits, 10);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return { error: 'Please enter a whole number for age.' };
  }
  if (parsed < 1 || parsed > 120) {
    return { error: 'Age must be between 1 and 120.' };
  }
  return { result: parsed };
};

const normalizePhone = (value: string, required: boolean): { result?: string | null; error?: string } => {
  const digits = value.replace(/\D+/g, '');
  if (!digits) {
    return required ? { error: 'Please enter a phone number.' } : { result: null };
  }
  if (digits.length === 10) {
    return { result: `+91${digits}` };
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return { result: `+${digits}` };
  }
  return { error: 'Enter a valid 10-digit Indian mobile number.' };
};

const validatePatientFields = (
  fields: { name: string; age: string; phone: string },
  options: { requireAge?: boolean; requirePhone?: boolean }
): { errors: PatientFieldErrors; sanitized: { name?: string; age?: number | null; phone?: string | null } } => {
  const errors: PatientFieldErrors = {};
  const sanitized: { name?: string; age?: number | null; phone?: string | null } = {};

  const nameResult = normalizeName(fields.name);
  if (nameResult.error) {
    errors.name = nameResult.error;
  } else {
    sanitized.name = nameResult.result;
  }

  const ageResult = normalizeAge(fields.age, options.requireAge !== false);
  if (ageResult.error) {
    errors.age = ageResult.error;
  } else {
    sanitized.age = ageResult.result ?? null;
  }

  const phoneResult = normalizePhone(fields.phone, options.requirePhone !== false);
  if (phoneResult.error) {
    errors.phone = phoneResult.error;
  } else {
    sanitized.phone = phoneResult.result ?? null;
  }

  return { errors, sanitized };
};

type JoinFormSearchParams = Record<string, string | string[] | undefined>;

type InitialJoinFormState = {
  clinicId: string | null;
  clinicShareCode: string | null;
  doctorId: string | null;
  doctorIdParamProvided: boolean;
  status: 'valid' | 'invalid';
  doctors: DoctorListEntry[];
  availabilityByDoctor: Record<string, DoctorAvailabilityPayload>;
  doctorsLoading: boolean;
};

const coerceFirestoreId = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = `${value}`.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    const byQuery =
      url.searchParams.get('clinicId') ||
      url.searchParams.get('doctorId') ||
      url.searchParams.get('c') ||
      url.searchParams.get('d');
    if (byQuery && /^[A-Za-z0-9-_.~]+$/.test(byQuery)) {
      return byQuery;
    }
  } catch {
    // Not a URL; continue with fallback parsing.
  }

  const cleaned = trimmed.match(/[A-Za-z0-9-_.~]+/g)?.join('') ?? '';
  return cleaned || null;
};

const buildInitialStateFromSearchParams = (paramsRecord: JoinFormSearchParams): InitialJoinFormState => {
  try {
    const params = new URLSearchParams();

    for (const [key, rawValue] of Object.entries(paramsRecord ?? {})) {
      if (typeof rawValue === 'undefined') {
        continue;
      }

      if (Array.isArray(rawValue)) {
        rawValue.forEach((entry) => {
          if (typeof entry === 'string') {
            params.append(key, entry);
          }
        });
        continue;
      }

      if (typeof rawValue === 'string') {
        params.append(key, rawValue);
      }
    }

    const rawClinicIdParam = params.get('clinicId') ?? params.get('c') ?? '';
    const rawClinicCodeParam = params.get('code') ?? params.get('clinicCode') ?? params.get('shareCode') ?? '';
    const rawDoctorIdParam = params.get('doctorId') ?? params.get('d') ?? '';

    const parsedFromQuery = parseClinicIdentifierFromQuery(params);
    const parsedFromClinicParam = rawClinicIdParam ? parseClinicIdentifierFromText(rawClinicIdParam) : null;
    const parsedFromCodeParam = rawClinicCodeParam ? parseClinicIdentifierFromText(rawClinicCodeParam) : null;

    const shareCodeCandidates = [
      normalizeClinicShareCode(rawClinicCodeParam),
      parsedFromQuery?.shareCode ?? null,
      parsedFromClinicParam?.shareCode ?? null,
      parsedFromCodeParam?.shareCode ?? null,
    ];

    const clinicIdCandidates = [
      parsedFromQuery?.clinicId ?? null,
      parsedFromClinicParam?.clinicId ?? null,
      parsedFromCodeParam?.clinicId ?? null,
      sanitizeClinicSlug(rawClinicIdParam),
      sanitizeClinicSlug(rawClinicCodeParam),
    ];

    const resolvedShareCode =
      shareCodeCandidates.find((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0) ??
      null;

    const resolvedClinicId =
      clinicIdCandidates.find((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0) ??
      null;

    const effectiveClinicIdentifier = resolvedShareCode ?? resolvedClinicId;

    const coercedDoctorId = coerceFirestoreId(rawDoctorIdParam);
    const doctorIdProvided = Boolean(coercedDoctorId);

    if (!effectiveClinicIdentifier) {
      const availabilityByDoctor = doctorIdProvided
        ? { [coercedDoctorId!]: createPlaceholderAvailability() }
        : {};
      const doctors = doctorIdProvided
        ? [
            {
              id: coercedDoctorId!,
              name: coercedDoctorId,
              specialty: 'Doctor',
              availability: null,
            },
          ]
        : [];

      return {
        clinicId: null,
        clinicShareCode: null,
        doctorId: coercedDoctorId ?? null,
        doctorIdParamProvided: doctorIdProvided,
        status: 'invalid',
        doctors,
        availabilityByDoctor,
        doctorsLoading: false,
      };
    }

    const availabilityByDoctor = doctorIdProvided
      ? { [coercedDoctorId!]: createPlaceholderAvailability() }
      : {};
    const doctors = doctorIdProvided
      ? [
          {
            id: coercedDoctorId!,
            name: coercedDoctorId,
            specialty: 'Doctor',
            availability: null,
          },
        ]
      : [];

    return {
      clinicId: effectiveClinicIdentifier,
      clinicShareCode: resolvedShareCode,
      doctorId: coercedDoctorId ?? null,
      doctorIdParamProvided: doctorIdProvided,
      status: 'valid',
      doctors,
      availabilityByDoctor,
      doctorsLoading: !doctorIdProvided,
    };
  } catch (err) {
    console.error('Error parsing join search params', err);
    return {
      clinicId: null,
      clinicShareCode: null,
      doctorId: null,
      doctorIdParamProvided: false,
      status: 'invalid',
      doctors: [],
      availabilityByDoctor: {},
      doctorsLoading: false,
    };
  }
};

const buildSnapshotFromResponse = (
  response: ClinicDoctorAvailabilityResponse
): DoctorAvailabilitySnapshot => ({
  doctors: response.doctors.map((entry) => ({
    id: entry.doctorId,
    name: entry.profile?.name ?? entry.doctorId,
    specialty: entry.profile?.specialty ?? 'General Practice',
    availability: entry.availability,
  })),
  availabilityByDoctor: response.doctors.reduce<Record<string, DoctorAvailabilityPayload>>((acc, entry) => {
    acc[entry.doctorId] = entry.availability;
    return acc;
  }, {}),
  doctorsLoading: false,
  availabilityError: null,
  clinic: response.clinic ?? null,
});

type JoinFormProps = {
  initialSearchParams: JoinFormSearchParams;
  initialAvailabilityData?: ClinicDoctorAvailabilityResponse | null;
  initialClinicStatus?: 'valid' | 'invalid';
};

export default function JoinForm({ initialSearchParams, initialAvailabilityData, initialClinicStatus }: JoinFormProps) {
  const router = useRouter();
  const joinQueueMutation = useJoinQueue();
  // Prefetch hook available for future optimization when QR scanning is implemented
  // const prefetchAvailability = usePrefetchDoctorAvailability();

  const initialStateRef = useRef<InitialJoinFormState | null>(null);
  if (!initialStateRef.current) {
    initialStateRef.current = buildInitialStateFromSearchParams(initialSearchParams);
  }

  const initialState = initialStateRef.current!;
  const clinicId = initialState.clinicId;
  const clinicShareCode = initialState.clinicShareCode;
  const initialDoctorId = initialState.doctorId;
  const doctorIdParamProvided = initialState.doctorIdParamProvided;

  const [availabilitySnapshot, setAvailabilitySnapshot] = useState<DoctorAvailabilitySnapshot>(() => {
    if (initialAvailabilityData) {
      return buildSnapshotFromResponse(initialAvailabilityData);
    }

    return {
      doctors: initialState.doctors,
      availabilityByDoctor: initialState.availabilityByDoctor,
      doctorsLoading: initialState.doctorsLoading,
      availabilityError: null,
      clinic: null,
    };
  });

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [ageTouched, setAgeTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRedirecting, startRedirect] = useTransition();
  const isBusy = isSubmitting || isRedirecting;
  const busyMessage = isRedirecting
    ? 'Redirecting you to your queue status page…'
    : 'Adding you to the queue. Hang tight!';
  const busyAnnouncement = isBusy ? busyMessage : '';
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<PatientFieldErrors>({});
  const [introVisible, setIntroVisible] = useState(true);
  const introStartRef = useRef<number>(Date.now());

  const [doctorId, setDoctorId] = useState<string | null>(initialDoctorId);
  // Note: doctors, doctorsLoading, availabilityError, and availabilityByDoctor are derived from the snapshot supplied by DoctorAvailabilityCard
  const [notifyStates, setNotifyStates] = useState<Record<string, NotifyState>>({});
  const [status, setStatus] = useState<'valid' | 'invalid'>(initialClinicStatus ?? initialState.status);
  const [clinicSchedulingSettings, setClinicSchedulingSettings] = useState<ClinicSchedulingSettings>(() =>
    getDefaultClinicSchedulingSettings()
  );
  const formattedClinicShareCode = useMemo(() => formatClinicShareCode(clinicShareCode), [clinicShareCode]);
  const handleAvailabilitySnapshot = useCallback((snapshot: DoctorAvailabilitySnapshot) => {
    setAvailabilitySnapshot((prev) => (Object.is(prev, snapshot) ? prev : snapshot));
  }, []);
  const handleDoctorSelected = useCallback((id: string) => {
    autoSelectAppliedRef.current = true;
    setDoctorId(id);
  }, []);
  const autoSelectAppliedRef = useRef(false);

  useEffect(() => {
    if (autoSelectAppliedRef.current) {
      return;
    }

    if (!availabilitySnapshot.doctors.length) {
      return;
    }

    if (initialDoctorId) {
      setDoctorId(initialDoctorId);
      autoSelectAppliedRef.current = true;
      return;
    }

    if (!doctorIdParamProvided && availabilitySnapshot.doctors.length === 1) {
      setDoctorId(availabilitySnapshot.doctors[0].id);
      autoSelectAppliedRef.current = true;
    }
  }, [availabilitySnapshot.doctors, doctorIdParamProvided, initialDoctorId]);

  const invalidateDoctorAvailability = useInvalidateDoctorAvailability();

  const doctors = availabilitySnapshot.doctors;
  const availabilityByDoctor = availabilitySnapshot.availabilityByDoctor;
  const availabilityError = availabilitySnapshot.availabilityError;
  const clinicData = availabilitySnapshot.clinic;

  const getCurrentAvailability = () => {
    if (!doctorId) return null;
    return availabilityByDoctor[doctorId] ?? doctors.find((doc) => doc.id === doctorId)?.availability ?? null;
  };

  const encourageNotification = (targetDoctorId: string) => {
    setNotifyStates((prev) => {
      const current = prev[targetDoctorId];
      if (current?.status === 'success') return prev;
      if (current?.status === 'idle' && current?.message === OFFLINE_NOTIFICATION_PROMPT) return prev;
      return {
        ...prev,
        [targetDoctorId]: {
          status: 'idle',
          message: OFFLINE_NOTIFICATION_PROMPT,
        },
      };
    });
  };

  const selectedDoctor = useMemo(
    () => (doctorId ? doctors.find((doc) => doc.id === doctorId) ?? null : null),
    [doctorId, doctors]
  );

  const selectedAvailability = useMemo(() => {
    if (!doctorId) return null;
    return availabilityByDoctor[doctorId] ?? selectedDoctor?.availability ?? null;
  }, [availabilityByDoctor, doctorId, selectedDoctor]);

  const availabilitySummary = useMemo(
    () => describeAvailability(selectedAvailability),
    [selectedAvailability]
  );

  const selectedEligibility = useMemo(
    () => evaluateJoinEligibility(selectedAvailability, { clinicSettings: clinicSchedulingSettings }),
    [selectedAvailability, clinicSchedulingSettings]
  );

  const doctorIsAvailable = selectedAvailability?.status === 'AVAILABLE';
  const activeNotifyState: NotifyState = doctorId
    ? notifyStates[doctorId] ?? { status: 'idle' }
    : { status: 'idle' };
  const manualCheckInRequired = clinicSchedulingSettings.manualCheckInRequired === true;
  const allowOfflineSignups = clinicSchedulingSettings.allowOfflineSignups === true;
  const manualCheckInActive =
    manualCheckInRequired
    && selectedAvailability?.reasonCode === 'REALTIME_OFFLINE'
    && selectedAvailability?.layer === 'REALTIME_TOGGLE';
  const manualGuidance = manualCheckInActive
    ? allowOfflineSignups
      ? 'Our self check-in kiosk is offline. Please share your details with the front desk so they can add you.'
      : 'Please visit the front desk so a staff member can check you in.'
    : null;
  const defaultNotifyMessage = manualCheckInActive
    ? 'We will message you once check-ins reopen.'
    : 'We will send a WhatsApp message to your phone number once the doctor comes online.';

  const handleJoinQueue = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const validation = validatePatientFields(
      { name, age, phone },
      { requireAge: true, requirePhone: true }
    );
    setFieldErrors(validation.errors);
    setNameTouched(true);
    setAgeTouched(true);
    setPhoneTouched(true);

    if (validation.errors.name || validation.errors.age || validation.errors.phone) {
      setError('Please fix the highlighted fields.');
      toast.error('Please check the highlighted fields.');
      return;
    }

    if (!clinicId || !doctorId) {
      setError('Missing clinic or doctor information. Please scan the clinic QR code again.');
      return;
    }

    const currentAvailability = getCurrentAvailability();
    const decision = evaluateJoinEligibility(currentAvailability, {
      clinicSettings: clinicSchedulingSettings,
    });
    if (!decision.allowJoin) {
      const message = decision.reason ?? 'Doctor is currently unavailable.';
      setError(message);
      encourageNotification(doctorId);
      toast.warning(message);
      return;
    }

    setIsSubmitting(true);

    const sanitizedName = validation.sanitized.name ?? name.trim();
    const sanitizedAge = validation.sanitized.age ?? Number.parseInt(age, 10);
    const sanitizedPhone = validation.sanitized.phone ?? phone.replace(/\D+/g, '');

    try {
      const data = await joinQueueMutation.mutateAsync({
        clinicId,
        doctorId,
        patientData: {
          name: sanitizedName,
          age: sanitizedAge,
          phone: sanitizedPhone,
        },
        optimisticDoctor: selectedDoctor
          ? {
              name: selectedDoctor.name ?? undefined,
              specialty: selectedDoctor.specialty ?? undefined,
            }
          : undefined,
      });

      const { patientId, queueId, doctorId: dId, clinicId: cId, accessToken } = data;
      const joinUrl = `/queue/${cId}/${dId}/${queueId}/${patientId}${
        accessToken ? `?t=${encodeURIComponent(accessToken)}` : ''
      }`;

      toast.success('You have been added to the queue.');

      startRedirect(() => {
        router.push(joinUrl);
      });
    } catch (err) {
      const targetDoctorId = doctorId;

      if (isCallableError(err) && err.code === 'failed-precondition') {
        const details =
          typeof err.details === 'object' && err.details !== null
            ? (err.details as Record<string, unknown>)
            : undefined;
        const availabilityPayload = deserializeAvailabilityPayload(details?.availability);

        const message =
          availabilityPayload?.message ??
          (err instanceof Error ? err.message : 'Doctor is currently unavailable.');
        setError(message);
        if (targetDoctorId) encourageNotification(targetDoctorId);
      } else {
        const message = err instanceof Error ? err.message : 'Failed to join queue. Please try again.';
        setError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNotifyDoctorOnline = async () => {
    if (!clinicId || !doctorId) {
      setError('Missing clinic or doctor information. Please scan the clinic QR code again.');
      toast.error('Unable to schedule a notification without clinic information.');
      return;
    }

    const validation = validatePatientFields(
      { name, age, phone },
      { requireAge: false, requirePhone: true }
    );
    setFieldErrors((prev) => ({ ...prev, phone: validation.errors.phone }));
    setPhoneTouched(true);
    if (validation.errors.phone) {
      toast.error(validation.errors.phone);
      return;
    }

    setNotifyStates((prev) => ({ ...prev, [doctorId]: { status: 'loading' } }));

    try {
      const notifyFn = httpsCallable<
        RequestDoctorOnlineNotificationPayload,
        RequestDoctorOnlineNotificationResult
      >(functions, 'requestDoctorOnlineNotification');

      const { data } = await notifyFn({
        clinicId,
        doctorId,
        phone: validation.sanitized.phone ?? phone.replace(/\D+/g, ''),
        patientName: name.trim() || undefined,
      });

      if (data.availability) {
        invalidateDoctorAvailability({ clinicId, doctorIds: [doctorId] });
      }

      if (data.success) {
        const message = data.alreadyQueued
          ? 'You are already on the notification list. We will message you when the doctor is online.'
          : 'We will message you as soon as the doctor is back online.';
        setNotifyStates((prev) => ({ ...prev, [doctorId]: { status: 'success', message } }));
        toast.success(message);
        return;
      }

      if (data.alreadyOnline) {
        const message = 'Doctor is already online. You can join the queue now.';
        setNotifyStates((prev) => ({
          ...prev,
          [doctorId]: { status: 'error', message },
        }));
        toast.info(message);
        return;
      }

      if (data.enqueueEligible === false) {
        const message = 'Notifications are not available right now. Please try again later.';
        setNotifyStates((prev) => ({
          ...prev,
          [doctorId]: { status: 'error', message },
        }));
        toast.error(message);
        return;
      }

      const fallbackMessage = 'Unable to schedule a notification. Please try again.';
      setNotifyStates((prev) => ({
        ...prev,
        [doctorId]: { status: 'error', message: fallbackMessage },
      }));
      toast.error(fallbackMessage);
    } catch (err) {
      console.error('Failed to request doctor online notification', err);
      const message = 'Could not schedule a notification. Please try again.';
      setNotifyStates((prev) => ({
        ...prev,
        [doctorId]: { status: 'error', message },
      }));
      toast.error(message);
    }
  };

  // Load clinic scheduling settings separately (not dependent on doctor availability)
  useEffect(() => {
    if (!clinicId) {
      setStatus('invalid');
      return;
    }

    if (initialClinicStatus === 'invalid') {
      setStatus('invalid');
      return;
    }

    setStatus('valid');

    let cancelled = false;

    const loadSchedulingSettings = async () => {
      try {
        const data = await fetchClinicSchedulingSettings(clinicId);
        if (!cancelled) {
          setClinicSchedulingSettings(data);
        }
      } catch (err) {
        console.error('Error loading clinic scheduling settings:', err);
        if (!cancelled) {
          setClinicSchedulingSettings(getDefaultClinicSchedulingSettings());
        }
      }
    };

    loadSchedulingSettings();

    return () => {
      cancelled = true;
    };
  }, [clinicId, initialClinicStatus]);

  useEffect(() => {
    if (!introVisible) {
      return;
    }

    if (status === 'invalid') {
      setIntroVisible(false);
      return;
    }

    if (availabilitySnapshot.doctorsLoading) {
      return;
    }

    const elapsed = Date.now() - introStartRef.current;
    const remaining = Math.max(0, MIN_INTRO_DURATION_MS - elapsed);
    const timer = window.setTimeout(() => setIntroVisible(false), remaining);

    return () => window.clearTimeout(timer);
  }, [availabilitySnapshot.doctorsLoading, status, introVisible]);

  // Auto-select doctor when data loads (side effect only)
  if (status === 'invalid') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50/30 via-white to-indigo-50/30 px-4 py-6">
        <Card className="w-full max-w-sm border border-destructive/20 bg-background/95 shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <CardTitle>Invalid Clinic Link</CardTitle>
            <CardDescription>
              The clinic code or link appears to be invalid. Please scan the QR code again or contact the clinic for
              assistance.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-6">
            <Button className="w-full" onClick={() => window.history.back()}>
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      aria-live="polite"
      className="relative min-h-screen bg-gradient-to-br from-blue-50/50 via-white to-cyan-50/30 text-foreground"
    >
      {introVisible ? (
        <div className="fixed inset-0 z-50">
          <JoinLoadingScreen shareCode={formattedClinicShareCode} clinicId={clinicId} className="min-h-full" />
        </div>
      ) : null}

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {busyAnnouncement}
        {error ? `Error: ${error}` : ''}
      </span>

      <main className="flex min-h-screen w-full items-center justify-center p-4">
        <Card className="w-full max-w-md border-border/50 bg-card/95 backdrop-blur-sm shadow-2xl shadow-blue-500/10">
          <CardHeader className="space-y-1 pb-4 text-center">
            <CardTitle className="text-xl font-bold bg-gradient-to-br from-gray-900 to-gray-700 bg-clip-text text-transparent">
              {clinicData?.name?.trim() || 'Clinic'}
            </CardTitle>
            <CardDescription className="font-medium">Virtual Queue System</CardDescription>
            {formattedClinicShareCode ? (
              <p className="text-xs font-medium text-muted-foreground">
                Clinic code: <span className="font-mono tracking-wider text-foreground">{formattedClinicShareCode}</span>
              </p>
            ) : null}
          </CardHeader>

          <Separator className="bg-border/60" />

          <CardContent className="space-y-6 pt-6">
            <Suspense fallback={<DoctorAvailabilitySkeleton message="Grabbing slots... one sec!" />}>
              <DoctorAvailabilityCard
                clinicId={clinicId}
                initialDoctorId={initialDoctorId}
                doctorIdParamProvided={doctorIdParamProvided}
                selectedDoctorId={doctorId}
                onDoctorSelected={handleDoctorSelected}
                onSnapshot={handleAvailabilitySnapshot}
                initialDoctors={initialState.doctors}
                initialAvailabilityByDoctor={initialState.availabilityByDoctor}
                initialAvailabilityData={initialAvailabilityData ?? undefined}
              />
            </Suspense>

            {availabilityError ? (
              <div className="rounded-md border border-sem-warning/40 bg-sem-warning/10 px-3 py-2 text-xs text-sem-warning">
                {availabilityError}
              </div>
            ) : null}

            {/* Only show availability section when doctor is unavailable */}
            {(doctorId || (!doctorIdParamProvided && doctors.length === 1)) && !doctorIsAvailable && (
              <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className={cn('h-2.5 w-2.5 rounded-full', availabilitySummary.indicatorClass)} aria-hidden />
                  {availabilitySummary.headline}
                </div>
                {availabilitySummary.detail ? (
                  <p className="text-xs text-muted-foreground">{availabilitySummary.detail}</p>
                ) : null}

                {manualGuidance ? (
                  <p className="text-xs font-medium text-sem-warning">{manualGuidance}</p>
                ) : (
                  <p className="text-xs text-sem-warning">
                    Enter your details below and tap &ldquo;Notify me when available&rdquo; to receive a WhatsApp alert as soon as
                    the doctor returns.
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {isBusy ? (
              <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden />
                {busyMessage}
              </div>
            ) : null}

            <form className="space-y-4" onSubmit={handleJoinQueue}>
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  placeholder="Your full name"
                  required
                  autoComplete="name"
                  autoCapitalize="words"
                  value={name}
                  onChange={(event) => {
                    const value = event.target.value;
                    setName(value);
                    if (nameTouched) {
                      const { errors } = validatePatientFields({ name: value, age, phone }, { requireAge: true, requirePhone: true });
                      setFieldErrors((prev) => ({ ...prev, name: errors.name }));
                    }
                  }}
                  onBlur={() => {
                    setNameTouched(true);
                    const { errors } = validatePatientFields({ name, age, phone }, { requireAge: true, requirePhone: true });
                    setFieldErrors((prev) => ({ ...prev, name: errors.name }));
                  }}
                  disabled={isBusy}
                />
                {nameTouched && fieldErrors.name ? (
                  <p className="text-xs text-destructive">{fieldErrors.name}</p>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="age">Age</Label>
                  <Input
                    id="age"
                    placeholder="Age"
                    inputMode="numeric"
                    required
                    value={age}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D+/g, '');
                      setAge(digits.slice(0, 3));
                      if (ageTouched) {
                        const { errors } = validatePatientFields(
                          { name, age: digits.slice(0, 3), phone },
                          { requireAge: true, requirePhone: true }
                        );
                        setFieldErrors((prev) => ({ ...prev, age: errors.age }));
                      }
                    }}
                    onBlur={() => {
                      setAgeTouched(true);
                      const { errors } = validatePatientFields({ name, age, phone }, { requireAge: true, requirePhone: true });
                      setFieldErrors((prev) => ({ ...prev, age: errors.age }));
                    }}
                    disabled={isBusy}
                    maxLength={3}
                  />
                  {ageTouched && fieldErrors.age ? (
                    <p className="text-xs text-destructive">{fieldErrors.age}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phoneNumber">Phone number</Label>
                  <Input
                    id="phoneNumber"
                    placeholder="10-digit phone number"
                    inputMode="tel"
                    type="tel"
                    required
                    value={phone}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D+/g, '');
                      setPhone(digits.slice(0, 10));
                      if (phoneTouched) {
                        const { errors } = validatePatientFields(
                          { name, age, phone: digits.slice(0, 10) },
                          { requireAge: true, requirePhone: true }
                        );
                        setFieldErrors((prev) => ({ ...prev, phone: errors.phone }));
                      }
                    }}
                    onBlur={() => {
                      setPhoneTouched(true);
                      const { errors } = validatePatientFields({ name, age, phone }, { requireAge: true, requirePhone: true });
                      setFieldErrors((prev) => ({ ...prev, phone: errors.phone }));
                    }}
                    disabled={isBusy}
                    maxLength={10}
                    aria-invalid={Boolean(phoneTouched && fieldErrors.phone)}
                    className={cn(
                      phoneTouched && fieldErrors.phone
                        ? 'border-destructive/70 focus-visible:ring-destructive'
                        : undefined
                    )}
                  />
                  {phoneTouched && fieldErrors.phone ? (
                    <p className="text-xs text-destructive">{fieldErrors.phone}</p>
                  ) : null}
                </div>
              </div>

              {doctorIsAvailable ? (
                <Button
                  type="submit"
                  className="w-full shadow-lg hover:shadow-xl transition-all"
                  loading={isSubmitting}
                  disabled={isBusy || !doctorId || !selectedEligibility.allowJoin}
                >
                  Join Queue
                </Button>
              ) : (
                <div className="space-y-2.5">
                  <Button
                    type="button"
                    onClick={handleNotifyDoctorOnline}
                    loading={activeNotifyState.status === 'loading'}
                    disabled={isBusy || !doctorId}
                    variant="outline"
                    className="w-full border-sem-warning/60 text-sem-warning hover:bg-sem-warning/10 hover:border-sem-warning shadow-sm"
                  >
                    Notify me when available
                  </Button>
                  <p
                    className={cn(
                      'text-center text-xs leading-relaxed',
                      activeNotifyState.message
                        ? activeNotifyState.status === 'success'
                          ? 'text-sem-success font-medium'
                          : 'text-sem-warning font-medium'
                        : 'text-muted-foreground'
                    )}
                  >
                    {activeNotifyState.message ?? defaultNotifyMessage}
                  </p>
                </div>
              )}
            </form>

            <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Your information is secure.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

