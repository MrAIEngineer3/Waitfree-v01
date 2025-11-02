'use client';

import { useDoctorAvailability } from '@/lib/hooks/use-doctor-availability';
import { useJoinQueue } from '@/lib/hooks/use-join-queue';
import { httpsCallable } from 'firebase/functions';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { formatClinicShareCode, normalizeClinicShareCode, parseClinicIdentifierFromQuery, parseClinicIdentifierFromText } from '@/lib/clinicIdentifier';
import { cn } from '@/lib/utils';

import {
    getClinicDoctorAvailability,
    type ClinicDoctorAvailabilityEntry,
    type ClinicSummary,
    type DoctorAvailabilityPayload,
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

const OFFLINE_NOTIFICATION_PROMPT =
  'You can request a notification when the doctor is back online.';

const createPlaceholderAvailability = (message = 'Fetching the latest status…'): DoctorAvailabilityPayload => ({
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

type DoctorListEntry = {
  id: string;
  name?: string | null;
  specialty?: string | null;
  availability?: DoctorAvailabilityPayload | null;
};

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

const AVAILABILITY_TONE_BADGE: Record<
  ReturnType<typeof describeAvailability>['tone'],
  { badgeVariant: 'success' | 'warning' | 'secondary'; badgeClassName?: string }
> = {
  positive: { badgeVariant: 'success' },
  warning: { badgeVariant: 'warning' },
  neutral: { badgeVariant: 'secondary', badgeClassName: 'text-muted-foreground bg-muted/40' },
};

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

function formatNextAvailability(iso: string | null | undefined) {
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

function describeAvailability(availability: DoctorAvailabilityPayload | null | undefined) {
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
  
  // Remove any existing "Expected back" text from the message to avoid duplication
  baseMessage = baseMessage.replace(/Expected back:?\s*[^.]*\.?/i, '').trim();
  
  // Smart formatting: append our clean formatted time if available
  let detail = baseMessage;
  if (next) {
    detail = `${baseMessage.replace(/\.$/, '')}. Expected back ${next}.`;
  } else {
    detail = baseMessage.endsWith('.') ? baseMessage : `${baseMessage}.`;
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

export default function JoinForm() {
  const router = useRouter();
  const joinQueueMutation = useJoinQueue();

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [ageTouched, setAgeTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<PatientFieldErrors>({});

  const [clinicId, setClinicId] = useState<string | null>(null);
  const [clinicShareCode, setClinicShareCode] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [doctorIdParamProvided, setDoctorIdParamProvided] = useState(false);
  const [doctors, setDoctors] = useState<DoctorListEntry[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [availabilityByDoctor, setAvailabilityByDoctor] = useState<Record<string, DoctorAvailabilityPayload>>({});
  const [notifyStates, setNotifyStates] = useState<Record<string, NotifyState>>({});
  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid'>('loading');
  const [clinicData, setClinicData] = useState<ClinicSummary | null>(null);
  const [clinicSchedulingSettings, setClinicSchedulingSettings] = useState<ClinicSchedulingSettings>(() =>
    getDefaultClinicSchedulingSettings()
  );
  const formattedClinicShareCode = useMemo(() => formatClinicShareCode(clinicShareCode), [clinicShareCode]);

  const initOnceRef = useRef(false);
  const isMountedRef = useRef(false);

  // TanStack Query hook for doctor availability with caching
  // This provides instant loading from cache and automatic background refetch
  const doctorAvailabilityQuery = useDoctorAvailability({
    clinicId,
    doctorIds: doctorId ? [doctorId] : undefined,
    enabled: !!clinicId && status === 'valid',
    staleTime: 30000, // 30 seconds
  });

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

  const handleJoinQueue = (event: React.FormEvent<HTMLFormElement>) => {
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

    setIsLoading(true);

    joinQueueMutation.mutate(
      {
        clinicId,
        doctorId,
        patientData: {
          name: validation.sanitized.name ?? name.trim(),
          age: validation.sanitized.age ?? Number.parseInt(age, 10),
          phone: validation.sanitized.phone ?? phone.replace(/\D+/g, ''),
        },
      },
      {
        onSuccess: (data) => {
          const { patientId, queueId, doctorId: dId, clinicId: cId, accessToken } = data;
          
          const joinUrl = `/queue/${cId}/${dId}/${queueId}/${patientId}${
            accessToken ? `?t=${encodeURIComponent(accessToken)}` : ''
          }`;
          router.push(joinUrl);
          toast.success('You have been added to the queue.');
        },
        onError: (err) => {
          const targetDoctorId = doctorId;

          if (isCallableError(err) && err.code === 'failed-precondition') {
            const details =
              typeof err.details === 'object' && err.details !== null
                ? (err.details as Record<string, unknown>)
                : undefined;
            const availabilityPayload = deserializeAvailabilityPayload(details?.availability);

            if (availabilityPayload && targetDoctorId) {
              setAvailabilityByDoctor((prev) => ({ ...prev, [targetDoctorId]: availabilityPayload }));
            }

            const message =
              availabilityPayload?.message ??
              (err instanceof Error ? err.message : 'Doctor is currently unavailable.');
            setError(message);
            // Toast already handled by mutation hook
            if (targetDoctorId) encourageNotification(targetDoctorId);
          } else {
            const message = err instanceof Error ? err.message : 'Failed to join queue. Please try again.';
            setError(message);
            // Toast already handled by mutation hook
          }
        },
        onSettled: () => {
          setIsLoading(false);
        },
      }
    );
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
        const existing = availabilityByDoctor[doctorId];
        const updatedAvailability: DoctorAvailabilityPayload = {
          status: data.availability.status,
          layer: data.availability.layer,
          reasonCode: data.availability.reasonCode,
          message: data.availability.message ?? null,
          computedAt: new Date().toISOString(),
          nextAvailableAt: data.availability.nextAvailableAt ?? null,
          activeOverride: existing?.activeOverride ?? null,
          realTimeStatus: data.availability.realTimeStatus ?? null,
          debug: existing?.debug ?? null,
        };
        setAvailabilityByDoctor((prev) => ({ ...prev, [doctorId]: updatedAvailability }));
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

  useEffect(() => {
    isMountedRef.current = true;
    if (initOnceRef.current) {
      return () => {
        isMountedRef.current = false;
      };
    }
    initOnceRef.current = true;

    try {
      let rawClinicIdParam = '';
      let rawClinicCodeParam = '';
      let rawDoctorIdParam = '';
      let parsedFromQuery: ReturnType<typeof parseClinicIdentifierFromQuery> = null;

      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        parsedFromQuery = parseClinicIdentifierFromQuery(params);
        rawClinicIdParam = params.get('clinicId') || params.get('c') || '';
        rawClinicCodeParam = params.get('code') || params.get('clinicCode') || params.get('shareCode') || '';
        rawDoctorIdParam = params.get('doctorId') || params.get('d') || '';
      }

      const parsedFromClinicParam = rawClinicIdParam
        ? parseClinicIdentifierFromText(rawClinicIdParam)
        : null;
      const parsedFromCodeParam = rawClinicCodeParam ? parseClinicIdentifierFromText(rawClinicCodeParam) : null;

      const shareCodeCandidates = [
        normalizeClinicShareCode(rawClinicCodeParam),
        parsedFromQuery?.shareCode ?? null,
        parsedFromClinicParam?.shareCode ?? null,
        parsedFromCodeParam?.shareCode ?? null,
      ];

      const resolvedShareCode = shareCodeCandidates.find((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0) ?? null;

      const effectiveClinicIdentifier = resolvedShareCode ?? null;
      const effectiveShareCode = resolvedShareCode;

      const coerceFirestoreId = (value: string | null | undefined): string | null => {
        if (!value) return null;
        const str = `${value}`.trim();
        if (!str) return null;

        try {
          const url = new URL(str);
          const byQuery =
            url.searchParams.get('clinicId') ||
            url.searchParams.get('doctorId') ||
            url.searchParams.get('c') ||
            url.searchParams.get('d');
          if (byQuery && /^[A-Za-z0-9-_.~]+$/.test(byQuery)) return byQuery;
        } catch {
          // not a URL
        }

        const cleaned = str.match(/[A-Za-z0-9-_.~]+/g)?.join('') || '';
        return cleaned || null;
      };

      const coercedDoctorId = coerceFirestoreId(rawDoctorIdParam);
      const doctorIdWasProvided = Boolean(coercedDoctorId);

      setDoctorIdParamProvided(doctorIdWasProvided);

      if (!effectiveClinicIdentifier) {
        setClinicId(null);
        setClinicShareCode(null);
        setDoctorId(coercedDoctorId ?? null);
        setClinicSchedulingSettings(getDefaultClinicSchedulingSettings());
        setStatus('invalid');
        return;
      }

    setClinicId(effectiveClinicIdentifier);
    setClinicShareCode(effectiveShareCode);
      setDoctorId(coercedDoctorId ?? null);
      setClinicSchedulingSettings(getDefaultClinicSchedulingSettings());
      setStatus('valid');
      setClinicData(null);
      if (coercedDoctorId) {
        setDoctors([
          {
            id: coercedDoctorId,
            name: coercedDoctorId,
            specialty: 'Doctor',
            availability: null,
          },
        ]);
        setDoctorsLoading(false);
        setAvailabilityByDoctor({
          [coercedDoctorId]: createPlaceholderAvailability(),
        });
      } else {
        setDoctors([]);
        setDoctorsLoading(true);
        setAvailabilityByDoctor({});
      }

      const loadAvailability = async () => {
        let mergedDoctors: DoctorListEntry[] = [];

        if (isMountedRef.current && !coercedDoctorId) {
          setDoctorsLoading(true);
        }

        try {
          if (isMountedRef.current) {
            setAvailabilityError(null);
          }

          const response = await getClinicDoctorAvailability(
            effectiveClinicIdentifier,
            coercedDoctorId ? [coercedDoctorId] : undefined
          );

          if (!isMountedRef.current) {
            return;
          }

          setClinicData(response.clinic ?? null);

          const entries = response.doctors;

          const availabilityMap = entries.reduce<Record<string, DoctorAvailabilityPayload>>((acc, entry) => {
            acc[entry.doctorId] = entry.availability;
            return acc;
          }, {});

          if (entries.length > 0) {
            setAvailabilityByDoctor((prev) => ({ ...prev, ...availabilityMap }));
          } else if (coercedDoctorId) {
            setAvailabilityByDoctor((prev) => ({
              ...prev,
              [coercedDoctorId]: createPlaceholderAvailability('Doctor availability is currently offline.'),
            }));
          }

          if (!isMountedRef.current) {
            return;
          }

          const resolvedDoctors: DoctorListEntry[] = entries.map((entry: ClinicDoctorAvailabilityEntry) => ({
            id: entry.doctorId,
            name: entry.profile?.name ?? entry.doctorId,
            specialty: entry.profile?.specialty ?? 'General Practice',
            availability: entry.availability,
          }));

          if (resolvedDoctors.length > 0) {
            mergedDoctors = resolvedDoctors;
            setDoctors(resolvedDoctors);
          } else if (coercedDoctorId) {
            mergedDoctors = [
              {
                id: coercedDoctorId,
                name: coercedDoctorId,
                specialty: 'Doctor',
                availability: availabilityMap[coercedDoctorId] ?? null,
              },
            ];
            setDoctors(mergedDoctors);
          } else {
            mergedDoctors = [];
            setDoctors([]);
          }

          if (isMountedRef.current) {
            setDoctorId((current) => {
              if (current) {
                return current;
              }

              if (coercedDoctorId) {
                return coercedDoctorId;
              }

              if (!doctorIdWasProvided && !coercedDoctorId && resolvedDoctors.length === 1) {
                return resolvedDoctors[0].id;
              }

              if (!doctorIdWasProvided && !coercedDoctorId && mergedDoctors.length === 1) {
                return mergedDoctors[0].id;
              }

              return current;
            });
          }
        } catch (err) {
          console.error('Error fetching doctor availability:', err);
          if (isMountedRef.current) {
            setAvailabilityError(
              err instanceof Error ? err.message : 'Failed to load doctor availability.'
            );
            setAvailabilityByDoctor((prev) => {
              const next = { ...prev };
              const doctorIds =
                mergedDoctors.length > 0
                  ? mergedDoctors.map((entry) => entry.id)
                  : coercedDoctorId
                    ? [coercedDoctorId]
                    : Object.keys(prev);
              doctorIds.forEach((id) => {
                if (!next[id]) {
                  next[id] = createPlaceholderAvailability('Unable to load live availability.');
                }
              });
              return next;
            });
          }
        }

        if (isMountedRef.current) {
          setDoctorsLoading(false);
        }
      };

      const loadSchedulingSettings = async () => {
        try {
          const data = await fetchClinicSchedulingSettings(effectiveClinicIdentifier);
          if (isMountedRef.current) {
            setClinicSchedulingSettings(data);
          }
        } catch (err) {
          console.error('Error loading clinic scheduling settings:', err);
          if (isMountedRef.current) {
            setClinicSchedulingSettings(getDefaultClinicSchedulingSettings());
          }
        }
      };

      loadAvailability();
      loadSchedulingSettings();
    } catch (err) {
      console.error('Error reading search params', err);
      setStatus('invalid');
    }

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Sync TanStack Query data with component state
  // This updates availability when query succeeds (either from cache or network)
  useEffect(() => {
    if (doctorAvailabilityQuery.data) {
      const { clinic, doctors: doctorEntries } = doctorAvailabilityQuery.data;
      
      // Update clinic data if available
      if (clinic) {
        setClinicData(clinic);
      }

      // Update availability map
      const availabilityMap = doctorEntries.reduce<Record<string, DoctorAvailabilityPayload>>((acc, entry) => {
        acc[entry.doctorId] = entry.availability;
        return acc;
      }, {});

      if (Object.keys(availabilityMap).length > 0) {
        setAvailabilityByDoctor((prev) => ({ ...prev, ...availabilityMap }));
        setAvailabilityError(null);
      }

      // Update doctors list
      const resolvedDoctors: DoctorListEntry[] = doctorEntries.map((entry: ClinicDoctorAvailabilityEntry) => ({
        id: entry.doctorId,
        name: entry.profile?.name ?? entry.doctorId,
        specialty: entry.profile?.specialty ?? 'General Practice',
        availability: entry.availability,
      }));

      if (resolvedDoctors.length > 0) {
        setDoctors(resolvedDoctors);
      }
    }

    if (doctorAvailabilityQuery.error) {
      console.error('[useDoctorAvailability] Query error:', doctorAvailabilityQuery.error);
      setAvailabilityError(
        doctorAvailabilityQuery.error instanceof Error
          ? doctorAvailabilityQuery.error.message
          : 'Failed to load doctor availability.'
      );
    }

    // Update loading state based on query status
    setDoctorsLoading(doctorAvailabilityQuery.isLoading || doctorAvailabilityQuery.isFetching);
  }, [doctorAvailabilityQuery.data, doctorAvailabilityQuery.error, doctorAvailabilityQuery.isLoading, doctorAvailabilityQuery.isFetching]);

  useEffect(() => {
    if (status !== 'loading') return;
    const timer = setTimeout(() => {
      setStatus((s) => (s === 'loading' ? 'invalid' : s));
    }, 6000);
    return () => clearTimeout(timer);
  }, [status]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50/30 via-white to-indigo-50/30 px-4 py-6">
        <Card className="w-full max-w-sm border border-border/60 bg-background/90 shadow-xl">
          <CardContent className="grid gap-4 p-6">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-9 w-full" />
            <div className="grid grid-cols-5 gap-3">
              <Skeleton className="col-span-2 h-10" />
              <Skeleton className="col-span-3 h-10" />
            </div>
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

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
      className="min-h-screen bg-gradient-to-br from-blue-50/50 via-white to-cyan-50/30 text-foreground"
    >
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {isLoading ? 'Submitting your details…' : ''}
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
            {!doctorIdParamProvided && doctors.length === 1 ? (
              <div className="rounded-xl border-2 border-border/50 bg-gradient-to-br from-muted/30 via-background/90 to-muted/20 p-4 sm:p-6 shadow-md">
                {doctorsLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="mx-auto h-14 w-14 sm:h-16 sm:w-16 rounded-full" />
                    <Skeleton className="mx-auto h-5 sm:h-6 w-32 sm:w-40" />
                    <Skeleton className="mx-auto h-4 w-24 sm:w-32" />
                  </div>
                ) : (
                  (() => {
                    const solo = doctors[0];
                    const availability = availabilityByDoctor[solo.id] ?? solo.availability ?? null;
                    const summary = describeAvailability(availability);

                    const badgeConfig = AVAILABILITY_TONE_BADGE[summary.tone];

                    return (
                      <div className="flex flex-col items-center space-y-3 sm:space-y-4">
                        {/* Doctor Avatar */}
                        <div className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-primary/10 text-xl sm:text-2xl font-bold text-primary shadow-sm ring-2 ring-primary/20">
                          {(solo.name || solo.id).charAt(0).toUpperCase()}
                        </div>
                        
                        {/* Doctor Info */}
                        <div className="space-y-1.5 sm:space-y-2 text-center">
                          <h3 className="text-base sm:text-lg font-bold text-foreground leading-tight">
                            {solo.name || solo.id}
                          </h3>
                          <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                            {solo.specialty || 'General Practice'}
                          </p>
                        </div>

                        {/* Availability Badge */}
                        <Badge
                          className={cn(
                            'inline-flex items-center gap-1.5 sm:gap-2 rounded-full px-3 sm:px-4 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold shadow-sm',
                            badgeConfig.badgeClassName
                          )}
                          variant={badgeConfig.badgeVariant}
                        >
                          <span className={cn('h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full', summary.indicatorClass)} aria-hidden />
                          {summary.statusLabel}
                        </Badge>

                        {/* Detail Message */}
                        {summary.detail && (
                          <p className="text-[11px] sm:text-xs leading-relaxed text-muted-foreground max-w-xs px-2">
                            {summary.detail}
                          </p>
                        )}
                      </div>
                    );
                  })()
                )}
              </div>
            ) : null}

            {!doctorIdParamProvided && doctors.length > 1 ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-sm font-semibold text-foreground">Select a doctor</Label>
                  <p className="text-xs text-muted-foreground">Choose from the available doctors below</p>
                </div>
                <ScrollArea className="max-h-96 rounded-xl border border-border/60 bg-muted/10">
                  <div className="space-y-2.5 p-3">
                    {doctorsLoading ? (
                      <div className="space-y-2.5">
                        <Skeleton className="h-24 w-full rounded-lg" />
                        <Skeleton className="h-24 w-full rounded-lg" />
                      </div>
                    ) : (
                      doctors.map((docEntry) => {
                        const selected = doctorId === docEntry.id;
                        const availability = availabilityByDoctor[docEntry.id] ?? docEntry.availability ?? null;
                        const summary = describeAvailability(availability);
                        const badgeConfig = AVAILABILITY_TONE_BADGE[summary.tone];

                        return (
                          <Button
                            key={docEntry.id}
                            type="button"
                            variant="ghost"
                            className={cn(
                              'h-auto w-full justify-start rounded-lg border-2 p-3 sm:p-4 text-left transition-all duration-200',
                              selected
                                ? 'border-primary bg-primary/5 shadow-md shadow-primary/10 hover:bg-primary/10'
                                : 'border-border/50 bg-background/80 hover:border-primary/30 hover:bg-muted/40 hover:shadow-sm'
                            )}
                            onClick={() => setDoctorId(docEntry.id)}
                          >
                            <div className="flex w-full items-start gap-2.5 sm:gap-4">
                              {/* Doctor Avatar/Icon */}
                              <div className={cn(
                                'flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-full text-base sm:text-lg font-bold transition-colors',
                                selected 
                                  ? 'bg-primary/15 text-primary' 
                                  : 'bg-muted/60 text-muted-foreground'
                              )}>
                                {(docEntry.name || docEntry.id).charAt(0).toUpperCase()}
                              </div>

                              {/* Doctor Info */}
                              <div className="flex min-w-0 flex-1 flex-col gap-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <h3 className="truncate text-sm sm:text-base font-semibold leading-tight text-foreground">
                                      {docEntry.name || docEntry.id}
                                    </h3>
                                    <p className="mt-0.5 text-xs font-medium text-muted-foreground truncate">
                                      {docEntry.specialty || 'General Practice'}
                                    </p>
                                  </div>
                                  <Badge
                                    variant={badgeConfig.badgeVariant}
                                    className={cn(
                                      'shrink-0 inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-0.5 text-[10px] sm:text-xs font-medium',
                                      badgeConfig.badgeClassName
                                    )}
                                  >
                                    <span className={cn('h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full', summary.indicatorClass)} aria-hidden />
                                    {summary.statusLabel}
                                  </Badge>
                                </div>
                                {summary.detail ? (
                                  <p className="text-[11px] sm:text-xs leading-relaxed text-muted-foreground/90 mt-0.5 line-clamp-2">
                                    {summary.detail}
                                  </p>
                                ) : null}
                              </div>

                              {/* Selection Indicator */}
                              {selected && (
                                <div className="hidden sm:flex shrink-0 items-center justify-center ml-2">
                                  <svg
                                    className="h-5 w-5 text-primary"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                </div>
                              )}
                            </div>
                          </Button>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>
            ) : null}

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
                  disabled={isLoading}
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
                    disabled={isLoading}
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
                    disabled={isLoading}
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
                  loading={isLoading}
                  disabled={isLoading || !doctorId || !selectedEligibility.allowJoin}
                >
                  Join Queue
                </Button>
              ) : (
                <div className="space-y-2.5">
                  <Button
                    type="button"
                    onClick={handleNotifyDoctorOnline}
                    loading={activeNotifyState.status === 'loading'}
                    disabled={isLoading || !doctorId}
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

      {isLoading ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md">
          <Card className="w-full max-w-xs border-primary/20 shadow-2xl">
            <CardContent className="space-y-4 p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 ring-4 ring-primary/5">
                <div className="h-6 w-6 animate-spin rounded-full border-3 border-primary border-t-transparent" />
              </div>
              <CardTitle className="text-base font-semibold">Joining queue</CardTitle>
              <CardDescription className="text-sm">Please wait while we add you to the queue…</CardDescription>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

