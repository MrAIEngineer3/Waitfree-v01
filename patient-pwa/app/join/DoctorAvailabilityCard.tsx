'use client';

import { useEffect, useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import type { ClinicDoctorAvailabilityResponse, DoctorAvailabilityPayload } from '@/lib/availability';
import { useDoctorAvailabilitySuspense } from '@/lib/hooks/use-doctor-availability';
import { cn } from '@/lib/utils';

import { createPlaceholderAvailability, describeAvailability } from './availabilityHelpers';
import type { DoctorAvailabilitySnapshot, DoctorListEntry } from './types';

const AVAILABILITY_TONE_BADGE: Record<ReturnType<typeof describeAvailability>['tone'], { badgeVariant: 'success' | 'warning' | 'secondary'; badgeClassName?: string }> = {
  positive: { badgeVariant: 'success' },
  warning: { badgeVariant: 'warning' },
  neutral: { badgeVariant: 'secondary', badgeClassName: 'text-muted-foreground bg-muted/40' },
};

export type DoctorAvailabilityCardProps = {
  clinicId: string | null;
  initialDoctorId: string | null;
  doctorIdParamProvided: boolean;
  selectedDoctorId: string | null;
  onDoctorSelected: (doctorId: string) => void;
  onSnapshot: (snapshot: DoctorAvailabilitySnapshot) => void;
  initialDoctors: DoctorListEntry[];
  initialAvailabilityByDoctor: Record<string, DoctorAvailabilityPayload>;
  initialAvailabilityData?: ClinicDoctorAvailabilityResponse | null;
};

export function DoctorAvailabilityCard({
  clinicId,
  initialDoctorId,
  doctorIdParamProvided,
  selectedDoctorId,
  onDoctorSelected,
  onSnapshot,
  initialDoctors,
  initialAvailabilityByDoctor,
  initialAvailabilityData,
}: DoctorAvailabilityCardProps) {
  const placeholderResponse = useMemo((): ClinicDoctorAvailabilityResponse | undefined => {
    if (!clinicId) return undefined;

    const baseDoctors = initialAvailabilityData?.doctors ?? initialDoctors;
    const doctors = baseDoctors.length
      ? baseDoctors
      : initialDoctorId
        ? [{ doctorId: initialDoctorId, profile: null, availability: createPlaceholderAvailability() }]
        : [];

    if (!doctors.length) return undefined;

    return {
      clinicId,
      clinic: initialAvailabilityData?.clinic ?? null,
      count: doctors.length,
      doctors: doctors.map((entry) => {
        if ('doctorId' in entry) {
          return entry as ClinicDoctorAvailabilityResponse['doctors'][number];
        }

        return {
          doctorId: entry.id,
          profile: entry.name || entry.specialty ? {
            name: entry.name ?? null,
            specialty: entry.specialty ?? null,
            avatarUrl: null,
          } : null,
          availability: initialAvailabilityByDoctor[entry.id] ?? createPlaceholderAvailability(),
        } satisfies ClinicDoctorAvailabilityResponse['doctors'][number];
      }),
      requestedDoctorIds: initialAvailabilityData?.requestedDoctorIds,
    } satisfies ClinicDoctorAvailabilityResponse;
  }, [clinicId, initialAvailabilityData, initialDoctors, initialAvailabilityByDoctor, initialDoctorId]);

  const doctorIds = useMemo(() => (initialDoctorId ? [initialDoctorId] : undefined), [initialDoctorId]);

  const availabilityQuery = useDoctorAvailabilitySuspense({
    clinicId,
    doctorIds,
    enabled: !!clinicId,
    staleTime: 30000,
    initialData: initialAvailabilityData ?? undefined,
    placeholderData: placeholderResponse,
  });

  const response = availabilityQuery.data as ClinicDoctorAvailabilityResponse | undefined;

  const doctors: DoctorListEntry[] = useMemo(() => {
    if (response) {
      return response.doctors.map((entry) => ({
        id: entry.doctorId,
        name: entry.profile?.name ?? entry.doctorId,
        specialty: entry.profile?.specialty ?? 'General Practice',
        availability: entry.availability,
      }));
    }

    if (initialDoctors.length) {
      return initialDoctors;
    }

    if (initialDoctorId) {
      return [
        {
          id: initialDoctorId,
          name: initialDoctorId,
          specialty: 'Doctor',
          availability: initialAvailabilityByDoctor[initialDoctorId] ?? createPlaceholderAvailability(),
        },
      ];
    }

    return [];
  }, [response, initialDoctors, initialDoctorId, initialAvailabilityByDoctor]);

  const availabilityByDoctor = useMemo(() => {
    if (response) {
      return response.doctors.reduce<Record<string, DoctorAvailabilityPayload>>((acc, entry) => {
        acc[entry.doctorId] = entry.availability;
        return acc;
      }, {});
    }

    return doctors.reduce<Record<string, DoctorAvailabilityPayload>>((acc, entry) => {
      if (entry.availability) {
        acc[entry.id] = entry.availability;
      }
      return acc;
    }, { ...initialAvailabilityByDoctor });
  }, [response, doctors, initialAvailabilityByDoctor]);

  const hasDoctorResponse = Boolean(response && response.doctors.length > 0);
  const doctorsLoading = !hasDoctorResponse && (availabilityQuery.isPending || availabilityQuery.isFetching);

  const availabilityError = availabilityQuery.error
    ? availabilityQuery.error instanceof Error
      ? availabilityQuery.error.message
      : 'Failed to load doctor availability.'
    : null;

  const snapshot = useMemo<DoctorAvailabilitySnapshot>(() => ({
    doctors,
    availabilityByDoctor,
    doctorsLoading: availabilityQuery.isPending || availabilityQuery.isFetching,
    availabilityError,
    clinic: response?.clinic ?? initialAvailabilityData?.clinic ?? null,
  }), [
    availabilityByDoctor,
    availabilityError,
    availabilityQuery.isFetching,
    availabilityQuery.isPending,
    doctors,
    initialAvailabilityData?.clinic,
    response?.clinic,
  ]);

  useEffect(() => {
    onSnapshot(snapshot);
  }, [onSnapshot, snapshot]);

  if (!clinicId) {
    return null;
  }

  if (!doctors.length && doctorsLoading) {
    return <DoctorAvailabilitySkeleton message="Grabbing slots... one sec!" />;
  }

  if (!doctors.length) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
        We couldn&apos;t find any doctors for this clinic yet. Please double-check the clinic code.
      </div>
    );
  }

  if (!doctorIdParamProvided && doctors.length === 1) {
    const solo = doctors[0];
    const availability = availabilityByDoctor[solo.id] ?? solo.availability ?? null;
    const summary = describeAvailability(availability);
    const badgeConfig = AVAILABILITY_TONE_BADGE[summary.tone];

    return (
      <div className="rounded-xl border-2 border-border/50 bg-gradient-to-br from-muted/30 via-background/90 to-muted/20 p-4 sm:p-6 shadow-md">
        {doctorsLoading ? (
          <DoctorAvailabilitySkeleton message="Grabbing slots... one sec!" compact />
        ) : (
          <div className="flex flex-col items-center space-y-3 sm:space-y-4">
            <div className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-primary/10 text-xl sm:text-2xl font-bold text-primary shadow-sm ring-2 ring-primary/20">
              {(solo.name || solo.id).charAt(0).toUpperCase()}
            </div>
            <div className="space-y-1.5 sm:space-y-2 text-center">
              <h3 className="text-base sm:text-lg font-bold text-foreground leading-tight">
                {solo.name || solo.id}
              </h3>
              <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                {solo.specialty || 'General Practice'}
              </p>
            </div>
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
            {summary.detail ? (
              <p className="text-[11px] sm:text-xs leading-relaxed text-muted-foreground max-w-xs px-2">
                {summary.detail}
              </p>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Select a doctor</p>
        <p className="text-xs text-muted-foreground">Choose from the available doctors below</p>
      </div>
      <ScrollArea className="max-h-96 rounded-xl border border-border/60 bg-muted/10">
        <div className="space-y-2.5 p-3">
          {doctorsLoading ? (
            <DoctorAvailabilitySkeleton message="Grabbing slots... one sec!" />
          ) : (
            doctors.map((docEntry) => {
              const selected = selectedDoctorId === docEntry.id;
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
                  onClick={() => onDoctorSelected(docEntry.id)}
                >
                  <div className="flex w-full items-start gap-2.5 sm:gap-4">
                    <div
                      className={cn(
                        'flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-full text-base sm:text-lg font-bold transition-colors',
                        selected ? 'bg-primary/15 text-primary' : 'bg-muted/60 text-muted-foreground'
                      )}
                    >
                      {(docEntry.name || docEntry.id).charAt(0).toUpperCase()}
                    </div>
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
                    {selected ? (
                      <div className="hidden sm:flex shrink-0 items-center justify-center ml-2">
                        <svg className="h-5 w-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    ) : null}
                  </div>
                </Button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export function DoctorAvailabilitySkeleton({ message, compact = false }: { message: string; compact?: boolean }) {
  if (compact) {
    return (
      <div className="space-y-3">
        <Skeleton className="mx-auto h-14 w-14 sm:h-16 sm:w-16 rounded-full" />
        <Skeleton className="mx-auto h-5 sm:h-6 w-32 sm:w-40" />
        <Skeleton className="mx-auto h-4 w-24 sm:w-32" />
        <p className="text-center text-xs text-muted-foreground">{message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <p className="text-center text-xs text-muted-foreground">{message.replace("'", '&rsquo;')}</p>
    </div>
  );
}
