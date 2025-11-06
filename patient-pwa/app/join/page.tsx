import type { ClinicDoctorAvailabilityResponse } from '@/lib/availability';
import { parseClinicIdentifierFromQuery, parseClinicIdentifierFromText } from '@/lib/clinicIdentifier';
import { doctorAvailabilityQueryKey } from '@/lib/hooks/use-doctor-availability';
import { ClinicNotFoundError, getClinicDoctorAvailabilityServer } from '@/lib/server/availability';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { Suspense } from 'react';
import JoinForm from './JoinForm';

type JoinSearchParams = Record<string, string | string[] | undefined>;

type JoinPageProps = {
  searchParams?: Promise<JoinSearchParams>;
};

export default async function JoinPage({ searchParams }: JoinPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  
  // Create a new QueryClient for this request
  const queryClient = new QueryClient();
  
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string') {
          params.append(key, entry);
        }
      }
      continue;
    }

    if (typeof value === 'string') {
      params.append(key, value);
    }
  }

  const identifierFromQuery = parseClinicIdentifierFromQuery(params);

  let clinicId: string | null = identifierFromQuery?.clinicId ?? null;

  if (!clinicId) {
    const clinicParam = typeof resolvedSearchParams.clinic === 'string' ? resolvedSearchParams.clinic : null;
    if (clinicParam) {
      const parsed = parseClinicIdentifierFromText(clinicParam, { preferSlugOnAmbiguous: true });
      clinicId = parsed?.clinicId ?? clinicId;
    }
  }

  const doctorParamCandidates: Array<string | null | undefined> = [
    params.get('doctorId'),
    params.get('doctor'),
    params.get('d'),
    typeof resolvedSearchParams.doctor === 'string' ? resolvedSearchParams.doctor : null,
  ];

  const initialDoctorId = doctorParamCandidates.find((candidate) => typeof candidate === 'string' && candidate.length > 0) ?? null;

  let initialAvailabilityData: ClinicDoctorAvailabilityResponse | null = null;

  let clinicStatusOverride: 'valid' | 'invalid' | undefined;

  if (clinicId) {
    try {
      initialAvailabilityData = await getClinicDoctorAvailabilityServer({
        clinicId,
        doctorIds: initialDoctorId ? [initialDoctorId] : undefined,
      });

      const queryKey = doctorAvailabilityQueryKey(clinicId, initialDoctorId ? [initialDoctorId] : undefined);
      queryClient.setQueryData(queryKey, initialAvailabilityData);

      console.log(`[SSR] Prefetched availability for clinic ${clinicId}`);
    } catch (error) {
      if (error instanceof ClinicNotFoundError) {
        clinicStatusOverride = 'invalid';
        console.warn('[SSR] Clinic not found while prefetching availability:', error.message);
      } else {
        console.error('[SSR] Failed to prefetch availability:', error);
      }
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-white to-indigo-50 text-sm text-slate-600">
            Preparing the queue experience…
          </div>
        }
      >
        <JoinForm
          initialSearchParams={resolvedSearchParams}
          initialAvailabilityData={initialAvailabilityData}
          initialClinicStatus={clinicStatusOverride}
        />
      </Suspense>
    </HydrationBoundary>
  );
}
