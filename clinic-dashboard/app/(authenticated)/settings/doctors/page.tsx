"use client";
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { db } from '@/lib/firebase';
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import { useClinicContext } from '@/components/ClinicContext';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { setDoctorRealTimeStatus, updateDoctorDefaultRota } from '@/lib/scheduling';
import { toast } from 'sonner';

interface DoctorRealTimeStatus {
  online: boolean;
  updatedAt: Date | null;
  note?: string | null;
  source?: string | null;
}

interface Doctor {
  id: string;
  name: string;
  specialty: string;
  email?: string;
  phone?: string;
  clinicId: string;
  createdAt?: string;
  realTimeStatus: DoctorRealTimeStatus;
}

type DoctorRecord = Omit<Doctor, 'id'>;

interface StoredTimeBlock {
  start: string;
  end: string;
  label?: string | null;
}

interface SchedulingDefaultRota {
  timeZone?: string | null;
  week?: Partial<Record<string, StoredTimeBlock[]>> | null;
}

interface FirestoreRealTimeStatus {
  online?: boolean;
  updatedAt?: unknown;
  note?: string | null;
  source?: string | null;
}

interface SchedulingDocument {
  timeZone?: string | null;
  defaultRota?: SchedulingDefaultRota | null;
  realTimeStatus?: FirestoreRealTimeStatus | null;
}

interface DoctorSchedulingRecord {
  scheduling?: SchedulingDocument | null;
}

const resolveTimestamp = (value: unknown): Date | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'object' && value !== null) {
    const maybe = value as { toDate?: () => Date; seconds?: number; nanoseconds?: number };
    if (typeof maybe.toDate === 'function') {
      try {
        const date = maybe.toDate();
        return Number.isNaN(date.getTime()) ? null : date;
      } catch {
        return null;
      }
    }

    if (typeof maybe.seconds === 'number') {
      const seconds = maybe.seconds;
      const nanos = typeof maybe.nanoseconds === 'number' ? maybe.nanoseconds : 0;
      const millis = seconds * 1000 + Math.floor(nanos / 1_000_000);
      const date = new Date(millis);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }

  return null;
};

const normalizeRealTimeStatus = (
  raw?: FirestoreRealTimeStatus | null
): DoctorRealTimeStatus => ({
  online: raw?.online === true,
  note: typeof raw?.note === 'string' ? raw.note : null,
  source: typeof raw?.source === 'string' ? raw.source : null,
  updatedAt: resolveTimestamp(raw?.updatedAt ?? null)
});

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
type DayKey = typeof DAY_KEYS[number];

const DAY_LABELS: Record<DayKey, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday'
};

const DEFAULT_TIME_ZONE = 'Asia/Kolkata';
// Generate time component options
const HOUR_OPTIONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const MINUTE_OPTIONS = ['00', '30'];
const PERIOD_OPTIONS = ['AM', 'PM'];

// Parse time string to components
const parseTime = (timeStr: string): { hour: string; minute: string; period: string } => {
  const [time, period] = timeStr.split(' ');
  const [hour, minute] = time.split(':');
  return { hour, minute, period };
};

// Format time components to string
const formatTime = (hour: string, minute: string, period: string): string => {
  return `${hour}:${minute} ${period}`;
};

// Convert AM/PM time to 24-hour format for storage
const convertTo24Hour = (time12h: string): string => {
  const { hour, minute, period } = parseTime(time12h);
  let hourNum = parseInt(hour);
  
  if (period === 'PM' && hourNum !== 12) {
    hourNum += 12;
  } else if (period === 'AM' && hourNum === 12) {
    hourNum = 0;
  }
  
  return `${hourNum.toString().padStart(2, '0')}:${minute}`;
};

// Convert 24-hour format to AM/PM for display
const convertTo12Hour = (time24h: string): string => {
  const [hours, minutes] = time24h.split(':');
  const hour = parseInt(hours);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  
  return `${displayHour}:${minutes} ${period}`;
};

const time24ToMinutes = (time24h: string): number => {
  const [hours, minutes] = time24h.split(':');
  const hourNum = parseInt(hours, 10);
  const minuteNum = parseInt(minutes, 10);
  return hourNum * 60 + minuteNum;
};

interface TimeBlockState {
  id: string;
  start: string;
  end: string;
  label?: string | null;
}

interface DayScheduleState {
  enabled: boolean;
  blocks: TimeBlockState[];
}

interface AvailabilityFormState {
  timeZone: string;
  days: Record<DayKey, DayScheduleState>;
}

const createShiftId = () => Math.random().toString(36).slice(2, 10);

const createDefaultBlock = (existingCount = 0): TimeBlockState => {
  const defaults: Array<{ start: string; end: string }> = [
    { start: '9:00 AM', end: '5:00 PM' },
    { start: '6:00 PM', end: '9:00 PM' }
  ];
  const preset = defaults[Math.min(existingCount, defaults.length - 1)];
  return {
    id: createShiftId(),
    start: preset.start,
    end: preset.end,
    label: null
  };
};

const createInitialAvailabilityState = (): AvailabilityFormState => {
  const days = DAY_KEYS.reduce<Record<DayKey, DayScheduleState>>((acc, key) => {
    const enabled = key !== 'saturday' && key !== 'sunday';
    acc[key] = {
      enabled,
      blocks: enabled ? [createDefaultBlock()] : []
    };
    return acc;
  }, {} as Record<DayKey, DayScheduleState>);

  return {
    timeZone: DEFAULT_TIME_ZONE,
    days
  };
};

export default function DoctorsSettingsPage() {
  const { clinicId } = useClinicContext();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', specialty: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [availabilityDoctor, setAvailabilityDoctor] = useState<Doctor | null>(null);
  const [availabilityState, setAvailabilityState] = useState<AvailabilityFormState>(() => createInitialAvailabilityState());
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [availabilitySuccess, setAvailabilitySuccess] = useState<string | null>(null);
  const [pendingRealtimeStatus, setPendingRealtimeStatus] = useState<Map<string, boolean>>(() => new Map());
  const [togglingRealtimeStatus, setTogglingRealtimeStatus] = useState<Set<string>>(() => new Set());
  // const [confirm, setConfirm] = useState<{ open: boolean; id?: string; name?: string }>({ open: false });

  const doctorsCol = useMemo(() => (clinicId ? collection(db, 'clinics', clinicId, 'doctors') : null), [clinicId]);

  useEffect(() => {
    if (!doctorsCol) {
      setDoctors([]);
      setLoading(false);
      return;
    }
    const q = query(doctorsCol, orderBy('name'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Doctor[] = [];
        snap.forEach((d) => {
          const data = d.data() as Partial<DoctorRecord & DoctorSchedulingRecord>;
          const scheduling = (data?.scheduling ?? null) as SchedulingDocument | null;
          const realTimeStatus = normalizeRealTimeStatus(scheduling?.realTimeStatus ?? null);

          list.push({
            id: d.id,
            clinicId: clinicId!,
            name: data?.name ?? '',
            specialty: data?.specialty ?? '',
            email: data?.email ?? undefined,
            phone: data?.phone ?? undefined,
            createdAt: data?.createdAt,
            realTimeStatus
          });
        });
        setDoctors(list);
        setLoading(false);
      },
      (err) => {
        setError(err.message || 'Failed to load doctors');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [doctorsCol, clinicId]);

  useEffect(() => {
    setPendingRealtimeStatus((prev) => {
      if (prev.size === 0) {
        return prev;
      }

      let mutated = false;
      const next = new Map(prev);
      prev.forEach((pendingValue, doctorId) => {
        const doctor = doctors.find((item) => item.id === doctorId);
        if (doctor && doctor.realTimeStatus.online === pendingValue) {
          next.delete(doctorId);
          mutated = true;
        }
      });

      return mutated ? next : prev;
    });
  }, [doctors]);

  function startAdd() {
    setEditing(null);
    setForm({ name: '', specialty: '', email: '', phone: '' });
    setAdding(true);
  }

  function startEdit(d: Doctor) {
    setEditing(d);
    setForm({ name: d.name, specialty: d.specialty, email: d.email || '', phone: d.phone || '' });
  }

  function closeAvailabilityManager() {
    setAvailabilityDoctor(null);
    setAvailabilityState(createInitialAvailabilityState());
    setAvailabilityLoading(false);
    setAvailabilitySaving(false);
    setAvailabilityError(null);
    setAvailabilitySuccess(null);
  }

  async function openAvailabilityManager(doctor: Doctor) {
    if (!clinicId) {
      return;
    }
    setAvailabilityDoctor(doctor);
    setAvailabilityState(createInitialAvailabilityState());
    setAvailabilityLoading(true);
    setAvailabilityError(null);
    setAvailabilitySuccess(null);
    try {
      const ref = doc(db, 'clinics', clinicId, 'doctors', doctor.id);
      const snapshot = await getDoc(ref);
      if (!snapshot.exists()) {
        setAvailabilityLoading(false);
        return;
      }
      const data = snapshot.data() as DoctorSchedulingRecord | undefined;
      const scheduling = data?.scheduling ?? null;
      const defaultRota = scheduling?.defaultRota ?? null;

      const nextState = createInitialAvailabilityState();
      if (typeof defaultRota?.timeZone === 'string') {
        nextState.timeZone = defaultRota.timeZone;
      } else if (typeof scheduling?.timeZone === 'string') {
        nextState.timeZone = scheduling.timeZone;
      }
      if (defaultRota?.week && typeof defaultRota.week === 'object') {
        const week = defaultRota.week as Partial<Record<string, StoredTimeBlock[]>>;
        for (const dayKey of DAY_KEYS) {
          const blocks = week[dayKey];
          if (Array.isArray(blocks) && blocks.length > 0) {
            const converted = blocks
              .map((block) => {
                if (typeof block?.start !== 'string' || typeof block?.end !== 'string') {
                  return null;
                }
                const convertedBlock: TimeBlockState = {
                  id: createShiftId(),
                  start: convertTo12Hour(block.start),
                  end: convertTo12Hour(block.end),
                  label: typeof block.label === 'string' ? block.label : null
                };
                return convertedBlock;
              })
              .filter((block): block is TimeBlockState => block !== null);

            if (converted.length > 0) {
              nextState.days[dayKey] = {
                enabled: true,
                blocks: converted
              };
            } else {
              nextState.days[dayKey] = {
                enabled: false,
                blocks: []
              };
            }
          }
        }
      }
      setAvailabilityState(nextState);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load availability';
      setAvailabilityError(message);
    } finally {
      setAvailabilityLoading(false);
    }
  }

  async function saveAvailability(e: React.FormEvent) {
    e.preventDefault();
    if (!clinicId || !availabilityDoctor) {
      return;
    }
    setAvailabilitySaving(true);
    setAvailabilityError(null);
    setAvailabilitySuccess(null);

    const payloadWeek: Record<string, { start: string; end: string; label?: string | null }[]> = {};
    for (const dayKey of DAY_KEYS) {
      const config = availabilityState.days[dayKey];
      if (!config.enabled) {
        continue;
      }

      if (!config.blocks.length) {
        setAvailabilityError(`${DAY_LABELS[dayKey]}: add at least one shift or disable the day.`);
        setAvailabilitySaving(false);
        return;
      }

      const normalizedBlocks: Array<{
        start24: string;
        end24: string;
        startMinutes: number;
        endMinutes: number;
        label: string | null;
      }> = [];

      for (const block of config.blocks) {
        if (!block.start || !block.end) {
          setAvailabilityError(`${DAY_LABELS[dayKey]} has an incomplete shift.`);
          setAvailabilitySaving(false);
          return;
        }
        const start24 = convertTo24Hour(block.start);
        const end24 = convertTo24Hour(block.end);
        if (start24 >= end24) {
          setAvailabilityError(`${DAY_LABELS[dayKey]}: shift start must be before shift end.`);
          setAvailabilitySaving(false);
          return;
        }
        const startMinutes = time24ToMinutes(start24);
        const endMinutes = time24ToMinutes(end24);
        normalizedBlocks.push({
          start24,
          end24,
          startMinutes,
          endMinutes,
          label: block.label ?? null
        });
      }

      normalizedBlocks.sort((a, b) => a.startMinutes - b.startMinutes);

      for (let i = 1; i < normalizedBlocks.length; i += 1) {
        if (normalizedBlocks[i].startMinutes < normalizedBlocks[i - 1].endMinutes) {
          setAvailabilityError(`${DAY_LABELS[dayKey]}: shifts cannot overlap.`);
          setAvailabilitySaving(false);
          return;
        }
      }

      payloadWeek[dayKey] = normalizedBlocks.map((block) => ({
        start: block.start24,
        end: block.end24,
        label: block.label ?? null
      }));
    }

    if (Object.keys(payloadWeek).length === 0) {
      setAvailabilityError('Please enable at least one working day.');
      setAvailabilitySaving(false);
      return;
    }

    try {
      await updateDoctorDefaultRota({
        clinicId,
        doctorId: availabilityDoctor.id,
        timeZone: availabilityState.timeZone,
        week: payloadWeek
      });
      setAvailabilitySuccess('Availability updated successfully.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update availability';
      setAvailabilityError(message);
    } finally {
      setAvailabilitySaving(false);
    }
  }

  const addShift = (dayKey: DayKey) => {
    setAvailabilityState((prev) => {
      const day = prev.days[dayKey];
      const nextBlocks = [...day.blocks, createDefaultBlock(day.blocks.length)];
      return {
        ...prev,
        days: {
          ...prev.days,
          [dayKey]: {
            enabled: true,
            blocks: nextBlocks
          }
        }
      };
    });
  };

  const removeShift = (dayKey: DayKey, blockId: string) => {
    setAvailabilityState((prev) => {
      const day = prev.days[dayKey];
      const nextBlocks = day.blocks.filter((block) => block.id !== blockId);
      return {
        ...prev,
        days: {
          ...prev.days,
          [dayKey]: {
            enabled: nextBlocks.length > 0 ? day.enabled : false,
            blocks: nextBlocks
          }
        }
      };
    });
  };

  async function saveDoctor(e: React.FormEvent) {
    e.preventDefault();
    if (!clinicId || !doctorsCol) return;
    if (!form.name.trim() || !form.specialty.trim()) {
      setError('Name and specialty are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      if (editing) {
        await updateDoc(doc(db, 'clinics', clinicId, 'doctors', editing.id), {
          name: form.name.trim(),
          specialty: form.specialty.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
        });
      } else {
        await addDoc(doctorsCol, {
          name: form.name.trim(),
          specialty: form.specialty.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          clinicId,
          createdAt: now,
        });
      }
      setEditing(null);
      setAdding(false);
      setForm({ name: '', specialty: '', email: '', phone: '' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : undefined;
      setError(message || 'Failed to save doctor');
    } finally {
      setSaving(false);
    }
  }

  async function removeDoctor(id: string) {
    if (!clinicId) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'clinics', clinicId, 'doctors', id));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : undefined;
      setError(message || 'Failed to delete');
    } finally {
      setSaving(false);
    }
  }

  const handleToggleRealTimeStatus = async (doctor: Doctor, nextOnline: boolean) => {
    const pendingOverride = pendingRealtimeStatus.get(doctor.id);
    const effectiveCurrent = typeof pendingOverride === 'boolean' ? pendingOverride : doctor.realTimeStatus.online;

    if (effectiveCurrent === nextOnline) {
      return;
    }

    if (!clinicId) {
      toast.error('Select a clinic before updating availability.');
      return;
    }

    setPendingRealtimeStatus((prev) => {
      const next = new Map(prev);
      next.set(doctor.id, nextOnline);
      return next;
    });

    setTogglingRealtimeStatus((prev) => {
      const next = new Set(prev);
      next.add(doctor.id);
      return next;
    });

    try {
      await setDoctorRealTimeStatus({
        clinicId,
        doctorId: doctor.id,
        online: nextOnline,
        source: 'staff'
      });

      toast.success(
        `${doctor.name} ${nextOnline ? 'is now available for real-time queueing' : 'has been marked offline'}`
      );
    } catch (err) {
      console.error('Failed to update doctor real-time status', err);
      toast.error('Failed to update doctor availability. Please try again.');
      setPendingRealtimeStatus((prev) => {
        const next = new Map(prev);
        next.delete(doctor.id);
        return next;
      });
    } finally {
      setTogglingRealtimeStatus((prev) => {
        const next = new Set(prev);
        next.delete(doctor.id);
        return next;
      });
    }
  };

  return (
    <div className="max-w-6xl space-y-6">
      {/* Page Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
          <svg className="w-6 h-6 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Medical Staff</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage doctors and medical professionals in your clinic</p>
        </div>
        <Button onClick={startAdd} variant="accent">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Add Doctor
        </Button>
      </div>

      <Separator />

      {!clinicId && (
        <Card variant="outline">
          <CardContent className="p-6">
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No Clinic Selected</h3>
              <p className="text-sm text-muted-foreground">Attach your account to a clinic to manage doctors.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Doctors Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading doctors…</span>
          </div>
        </div>
      ) : doctors.length === 0 && clinicId ? (
        <Card variant="outline">
          <CardContent className="p-6">
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-950 dark:to-purple-950 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-violet-500 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No Doctors Added</h3>
              <p className="text-sm text-muted-foreground mb-6">Get started by adding your first medical professional</p>
              <Button onClick={startAdd} variant="default">
                Add Your First Doctor
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {doctors.map((d) => {
            const pendingOverride = pendingRealtimeStatus.get(d.id);
            const online = typeof pendingOverride === 'boolean' ? pendingOverride : d.realTimeStatus.online;
            const isToggling = togglingRealtimeStatus.has(d.id);
            const statusColor = online ? 'bg-emerald-500' : 'bg-gray-300';
            const statusLabel = online ? 'Online' : 'Offline';
            const updatedAtLabel = d.realTimeStatus.updatedAt
              ? d.realTimeStatus.updatedAt.toLocaleString()
              : null;

            return (
              <Card key={d.id} className="group hover:shadow-lg transition-all duration-300 relative">
                <CardContent className="p-6 space-y-4">
                {/* Delete Icon - Top Right */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors flex items-center justify-center"
                      aria-label="Delete doctor"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove doctor?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to remove <b>{d.name}</b>? This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => removeDoctor(d.id)}>Remove</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {/* Doctor Info */}
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-semibold text-lg shadow-md">
                    {d.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground text-lg truncate">{d.name}</h3>
                    <p className="text-sm text-violet-600 dark:text-violet-400 font-medium">{d.specialty}</p>
                  </div>
                </div>

                {/* Real-time Controls */}
                <div className="rounded-lg border border-border bg-muted px-3 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${statusColor}`} />
                      <span className="text-sm font-semibold text-foreground">{statusLabel}</span>
                      {isToggling && (
                        <svg className="w-4 h-4 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <div onClick={(e) => e.stopPropagation()}>
                            <Switch
                              checked={online}
                              onCheckedChange={() => {}}
                              disabled={isToggling || !clinicId}
                              aria-label={`Toggle ${d.name} online status`}
                            />
                          </div>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {online ? 'Set Doctor Offline?' : 'Set Doctor Online?'}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {online
                                ? `${d.name} will be marked as offline. New patients won't be able to join their queue.`
                                : `${d.name} will be marked as online and available for patients to join the queue.`
                              }
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleToggleRealTimeStatus(d, !online)}>
                              {online ? 'Set Offline' : 'Set Online'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {online
                      ? 'Patients can see this doctor in the live queue.'
                      : 'Patients will not see this doctor in the live queue.'}
                  </p>
                  {updatedAtLabel && (
                    <p className="text-[11px] text-muted-foreground">Updated {updatedAtLabel}</p>
                  )}
                </div>

                {/* Contact Info */}
                {(d.email || d.phone) && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    {d.email && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span className="truncate">{d.email}</span>
                      </div>
                    )}
                    {d.phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        <span>{d.phone}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center gap-0 pt-2 border-t border-border">
                  <button
                    onClick={() => openAvailabilityManager(d)}
                    className="flex-1 px-3 py-2.5 bg-violet-50 dark:bg-violet-950 hover:bg-violet-100 dark:hover:bg-violet-900 text-violet-700 dark:text-violet-300 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>Availability</span>
                  </button>
                  
                  <div className="w-px h-8 bg-border mx-2"></div>
                  
                  <button
                    onClick={() => startEdit(d)}
                    className="flex-1 px-3 py-2.5 bg-muted hover:bg-accent text-foreground rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <span>Edit</span>
                  </button>
                </div>
              </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {(adding || !!editing) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-8 py-6">
              <h2 className="text-2xl font-semibold text-white">
                {editing ? 'Edit Doctor' : 'Add New Doctor'}
              </h2>
              <p className="text-sm text-violet-100 mt-1">
                {editing ? 'Update doctor information' : 'Fill in the details to add a new doctor'}
              </p>
            </div>

            <form onSubmit={saveDoctor} className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-foreground">
                    Full Name
                    <span className="text-red-500 ml-1">*</span>
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                    placeholder="Dr. Jane Smith"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-foreground">
                    Specialty
                    <span className="text-red-500 ml-1">*</span>
                  </label>
                  <input
                    value={form.specialty}
                    onChange={(e) => setForm((p) => ({ ...p, specialty: e.target.value }))}
                    className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                    placeholder="Cardiologist"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-foreground">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                    placeholder="doctor@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-foreground">
                    Phone Number
                  </label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
                  <svg className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-4 border-t border-border">
                <Button type="submit" loading={saving} variant="default" className="w-full sm:w-auto">
                  {editing ? 'Save Changes' : 'Add Doctor'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setEditing(null);
                    setAdding(false);
                    setForm({ name: '', specialty: '', email: '', phone: '' });
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {availabilityDoctor && (
        <Dialog open={!!availabilityDoctor} onOpenChange={(open) => !open && closeAvailabilityManager()}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-xl flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                Doctor Availability
              </DialogTitle>
              <DialogDescription>
                Configure the default weekly schedule for {availabilityDoctor.name}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={saveAvailability} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                {/* Weekly Schedule */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Weekly Schedule</Label>
                  <p className="text-xs text-muted-foreground">All times are in {availabilityState.timeZone}</p>
                  <div className="space-y-2">
                    {DAY_KEYS.map((dayKey) => {
                      const config = availabilityState.days[dayKey];
                      return (
                        <div
                          key={dayKey}
                          className={`grid grid-cols-12 gap-3 p-3 rounded-lg border transition-colors ${
                            config.enabled 
                              ? 'border-violet-200 bg-violet-50/30' 
                              : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          {/* Day Toggle */}
                          <div className="col-span-12 md:col-span-4 flex items-center gap-2">
                            <Switch
                              id={`day-${dayKey}`}
                              checked={config.enabled}
                              onCheckedChange={(checked) =>
                                setAvailabilityState((prev) => ({
                                  ...prev,
                                  days: {
                                    ...prev.days,
                                    [dayKey]: {
                                        ...prev.days[dayKey],
                                        enabled: checked,
                                        blocks: checked
                                        ? (prev.days[dayKey].blocks.length
                                            ? prev.days[dayKey].blocks
                                            : [createDefaultBlock()])
                                        : prev.days[dayKey].blocks
                                    }
                                  }
                                }))
                              }
                              disabled={availabilityLoading}
                            />
                            <Label 
                              htmlFor={`day-${dayKey}`} 
                              className={`cursor-pointer font-medium ${config.enabled ? 'text-gray-900' : 'text-gray-500'}`}
                            >
                              {DAY_LABELS[dayKey]}
                            </Label>
                          </div>

                          {/* Time Selectors */}
                            <div className="col-span-12 md:col-span-8 space-y-3">
                              {config.enabled ? (
                                <>
                                  {config.blocks.map((block, index) => {
                                    const startParts = parseTime(block.start);
                                    const endParts = parseTime(block.end);
                                    return (
                                      <div
                                        key={block.id}
                                        className="rounded-lg border border-gray-200 bg-white/70 p-3 shadow-sm sm:p-4"
                                      >
                                        <div className="mb-3 flex items-center justify-between">
                                          <span className="text-sm font-medium text-gray-700">Shift {index + 1}</span>
                                          {config.blocks.length > 1 && (
                                            <button
                                              type="button"
                                              onClick={() => removeShift(dayKey, block.id)}
                                              className="text-xs font-medium text-red-600 hover:text-red-700"
                                              disabled={availabilityLoading}
                                            >
                                              Remove
                                            </button>
                                          )}
                                        </div>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                          <div className="space-y-2">
                                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Start</span>
                                            <div className="flex items-center justify-start gap-1.5">
                                              <Select
                                                value={startParts.hour}
                                                onValueChange={(hour) => {
                                                  const { minute, period } = parseTime(block.start);
                                                  setAvailabilityState((prev) => {
                                                    const day = prev.days[dayKey];
                                                    const updatedBlocks = day.blocks.map((existing) =>
                                                      existing.id === block.id
                                                        ? { ...existing, start: formatTime(hour, minute, period) }
                                                        : existing
                                                    );
                                                    return {
                                                      ...prev,
                                                      days: {
                                                        ...prev.days,
                                                        [dayKey]: {
                                                          ...day,
                                                          blocks: updatedBlocks
                                                        }
                                                      }
                                                    };
                                                  });
                                                }}
                                                disabled={availabilityLoading}
                                              >
                                                <SelectTrigger className="h-9 w-[60px] text-sm">
                                                  <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {HOUR_OPTIONS.map((hourOption) => (
                                                    <SelectItem key={`start-hour-${dayKey}-${block.id}-${hourOption}`} value={hourOption}>
                                                      {hourOption}
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>

                                              <span className="text-sm text-gray-400">:</span>

                                              <Select
                                                value={startParts.minute}
                                                onValueChange={(minute) => {
                                                  const { hour, period } = parseTime(block.start);
                                                  setAvailabilityState((prev) => {
                                                    const day = prev.days[dayKey];
                                                    const updatedBlocks = day.blocks.map((existing) =>
                                                      existing.id === block.id
                                                        ? { ...existing, start: formatTime(hour, minute, period) }
                                                        : existing
                                                    );
                                                    return {
                                                      ...prev,
                                                      days: {
                                                        ...prev.days,
                                                        [dayKey]: {
                                                          ...day,
                                                          blocks: updatedBlocks
                                                        }
                                                      }
                                                    };
                                                  });
                                                }}
                                                disabled={availabilityLoading}
                                              >
                                                <SelectTrigger className="h-9 w-[60px] text-sm">
                                                  <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {MINUTE_OPTIONS.map((minuteOption) => (
                                                    <SelectItem key={`start-minute-${dayKey}-${block.id}-${minuteOption}`} value={minuteOption}>
                                                      {minuteOption}
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>

                                              <Select
                                                value={startParts.period}
                                                onValueChange={(period) => {
                                                  const { hour, minute } = parseTime(block.start);
                                                  setAvailabilityState((prev) => {
                                                    const day = prev.days[dayKey];
                                                    const updatedBlocks = day.blocks.map((existing) =>
                                                      existing.id === block.id
                                                        ? { ...existing, start: formatTime(hour, minute, period) }
                                                        : existing
                                                    );
                                                    return {
                                                      ...prev,
                                                      days: {
                                                        ...prev.days,
                                                        [dayKey]: {
                                                          ...day,
                                                          blocks: updatedBlocks
                                                        }
                                                      }
                                                    };
                                                  });
                                                }}
                                                disabled={availabilityLoading}
                                              >
                                                <SelectTrigger className="h-9 w-[65px] text-sm">
                                                  <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {PERIOD_OPTIONS.map((periodOption) => (
                                                    <SelectItem key={`start-period-${dayKey}-${block.id}-${periodOption}`} value={periodOption}>
                                                      {periodOption}
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            </div>
                                          </div>

                                          <div className="space-y-2">
                                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">End</span>
                                            <div className="flex items-center justify-start gap-1.5">
                                              <Select
                                                value={endParts.hour}
                                                onValueChange={(hour) => {
                                                  const { minute, period } = parseTime(block.end);
                                                  setAvailabilityState((prev) => {
                                                    const day = prev.days[dayKey];
                                                    const updatedBlocks = day.blocks.map((existing) =>
                                                      existing.id === block.id
                                                        ? { ...existing, end: formatTime(hour, minute, period) }
                                                        : existing
                                                    );
                                                    return {
                                                      ...prev,
                                                      days: {
                                                        ...prev.days,
                                                        [dayKey]: {
                                                          ...day,
                                                          blocks: updatedBlocks
                                                        }
                                                      }
                                                    };
                                                  });
                                                }}
                                                disabled={availabilityLoading}
                                              >
                                                <SelectTrigger className="h-9 w-[60px] text-sm">
                                                  <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {HOUR_OPTIONS.map((hourOption) => (
                                                    <SelectItem key={`end-hour-${dayKey}-${block.id}-${hourOption}`} value={hourOption}>
                                                      {hourOption}
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>

                                              <span className="text-sm text-gray-400">:</span>

                                              <Select
                                                value={endParts.minute}
                                                onValueChange={(minute) => {
                                                  const { hour, period } = parseTime(block.end);
                                                  setAvailabilityState((prev) => {
                                                    const day = prev.days[dayKey];
                                                    const updatedBlocks = day.blocks.map((existing) =>
                                                      existing.id === block.id
                                                        ? { ...existing, end: formatTime(hour, minute, period) }
                                                        : existing
                                                    );
                                                    return {
                                                      ...prev,
                                                      days: {
                                                        ...prev.days,
                                                        [dayKey]: {
                                                          ...day,
                                                          blocks: updatedBlocks
                                                        }
                                                      }
                                                    };
                                                  });
                                                }}
                                                disabled={availabilityLoading}
                                              >
                                                <SelectTrigger className="h-9 w-[60px] text-sm">
                                                  <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {MINUTE_OPTIONS.map((minuteOption) => (
                                                    <SelectItem key={`end-minute-${dayKey}-${block.id}-${minuteOption}`} value={minuteOption}>
                                                      {minuteOption}
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>

                                              <Select
                                                value={endParts.period}
                                                onValueChange={(period) => {
                                                  const { hour, minute } = parseTime(block.end);
                                                  setAvailabilityState((prev) => {
                                                    const day = prev.days[dayKey];
                                                    const updatedBlocks = day.blocks.map((existing) =>
                                                      existing.id === block.id
                                                        ? { ...existing, end: formatTime(hour, minute, period) }
                                                        : existing
                                                    );
                                                    return {
                                                      ...prev,
                                                      days: {
                                                        ...prev.days,
                                                        [dayKey]: {
                                                          ...day,
                                                          blocks: updatedBlocks
                                                        }
                                                      }
                                                    };
                                                  });
                                                }}
                                                disabled={availabilityLoading}
                                              >
                                                <SelectTrigger className="h-9 w-[65px] text-sm">
                                                  <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {PERIOD_OPTIONS.map((periodOption) => (
                                                    <SelectItem key={`end-period-${dayKey}-${block.id}-${periodOption}`} value={periodOption}>
                                                      {periodOption}
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}

                                  <div className="pt-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      onClick={() => addShift(dayKey)}
                                      disabled={availabilityLoading}
                                    >
                                      + Add shift
                                    </Button>
                                  </div>
                                </>
                              ) : (
                                <p className="text-sm text-muted-foreground">Day is disabled</p>
                              )}
                            </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Loading State */}
                {availabilityLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    Loading schedule…
                  </div>
                )}

                {/* Error Message */}
                {availabilityError && (
                  <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-red-700">{availabilityError}</span>
                  </div>
                )}

                {/* Success Message */}
                {availabilitySuccess && (
                  <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                    <svg className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm text-emerald-700">{availabilitySuccess}</span>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <DialogFooter className="mt-6 pt-4 border-t flex-col sm:flex-row gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={closeAvailabilityManager}
                  disabled={availabilitySaving}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  loading={availabilitySaving} 
                  variant="default" 
                  disabled={availabilityLoading}
                  className="w-full sm:w-auto"
                >
                  Save Availability
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}


    </div>
  );
}
