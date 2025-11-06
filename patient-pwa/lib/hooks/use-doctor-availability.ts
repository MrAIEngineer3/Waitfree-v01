import {
    useQuery,
    useQueryClient,
    useSuspenseQuery,
    type QueryFunction,
    type UseQueryOptions,
    type UseQueryResult,
    type UseSuspenseQueryOptions,
} from '@tanstack/react-query'
import { getClinicDoctorAvailability, type ClinicDoctorAvailabilityResponse } from '../availability'

interface UseDoctorAvailabilityOptions {
  /**
   * Clinic ID to fetch availability for
   */
  clinicId: string | null
  
  /**
   * Optional array of specific doctor IDs to fetch
   * If omitted, fetches all doctors for the clinic
   */
  doctorIds?: string[]
  
  /**
   * Whether to enable the query
   * Set to false to prevent automatic fetching
   */
  enabled?: boolean
  
  /**
   * How long cached data remains fresh (in milliseconds)
   * Default: 30 seconds (availability changes are not frequent)
   */
  staleTime?: number
  
  /**
   * How long to keep unused data in cache (in milliseconds)
   * Default: 5 minutes
   */
  gcTime?: number
  
  /**
   * Whether to refetch on window focus
   * Default: true (ensures up-to-date availability when user returns)
   */
  refetchOnWindowFocus?: boolean

  /**
   * Optional initial server data to hydrate the cache instantly
   */
  initialData?: ClinicDoctorAvailabilityResponse

  /**
   * Optional placeholder data to render while real data is loading
   */
  placeholderData?: ClinicDoctorAvailabilityResponse

}

export const doctorAvailabilityQueryKey = (
  clinicId: string | null | undefined,
  doctorIds?: string[]
) =>
  doctorIds && doctorIds.length > 0
    ? (['doctor-availability', clinicId, ...[...doctorIds].sort()] as const)
    : (['doctor-availability', clinicId] as const)

/**
 * Hook for fetching doctor availability with smart caching
 * 
 * Features:
 * - Caches availability data for 30 seconds (configurable)
 * - Instant loading from cache on subsequent requests
 * - Automatic background refetch when stale
 * - Refetches on window focus for fresh data
 * - Reduces 10s doctor info loading to instant (from cache)
 * 
 * @example
 * ```tsx
 * const { data, isLoading, error } = useDoctorAvailability({
 *   clinicId: 'clinic123',
 *   doctorIds: ['doc1', 'doc2'], // Optional
 *   staleTime: 60000, // 1 minute
 * })
 * ```
 */
const buildDoctorAvailabilityOptions = ({
  clinicId,
  doctorIds,
  enabled = true,
  staleTime = 30000,
  gcTime = 5 * 60 * 1000,
  refetchOnWindowFocus = true,
  initialData,
  placeholderData,
}: UseDoctorAvailabilityOptions): UseQueryOptions<ClinicDoctorAvailabilityResponse, Error, ClinicDoctorAvailabilityResponse> => {
  const queryKey = doctorAvailabilityQueryKey(clinicId, doctorIds)

  const options: UseQueryOptions<ClinicDoctorAvailabilityResponse, Error, ClinicDoctorAvailabilityResponse> = {
    queryKey,
    queryFn: async () => {
      if (!clinicId) {
        throw new Error('Clinic ID is required')
      }

      const startTime = performance.now()
      const response = await getClinicDoctorAvailability(clinicId, doctorIds)
      const duration = performance.now() - startTime

      console.log(
        `[useDoctorAvailability] Fetched availability for clinic ${clinicId}` +
        (doctorIds ? ` (${doctorIds.length} doctors)` : ' (all doctors)') +
        ` in ${duration.toFixed(0)}ms`
      )

      return response
    },
    enabled: enabled && !!clinicId,
    staleTime,
    gcTime,
    refetchOnWindowFocus,
    retry: 2, // Retry failed requests twice
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff
  }

  if (initialData) {
    options.initialData = initialData
  }

  if (placeholderData) {
    options.placeholderData = placeholderData
  }

  return options
}

export function useDoctorAvailability(options: UseDoctorAvailabilityOptions): UseQueryResult<ClinicDoctorAvailabilityResponse, Error> {
  return useQuery(buildDoctorAvailabilityOptions(options))
}

export function useDoctorAvailabilitySuspense(options: UseDoctorAvailabilityOptions): UseQueryResult<ClinicDoctorAvailabilityResponse, Error> {
  const suspenseOptions = buildDoctorAvailabilityOptions(options)

  const normalizedOptions: UseSuspenseQueryOptions<ClinicDoctorAvailabilityResponse, Error, ClinicDoctorAvailabilityResponse> = {
    ...suspenseOptions,
    queryFn: suspenseOptions.queryFn as QueryFunction<ClinicDoctorAvailabilityResponse>,
  }

  return useSuspenseQuery(normalizedOptions) as UseQueryResult<ClinicDoctorAvailabilityResponse, Error>
}

/**
 * Hook to prefetch doctor availability data
 * Useful for warming up the cache before user needs the data
 * 
 * @example
 * ```tsx
 * const prefetchAvailability = usePrefetchDoctorAvailability()
 * 
 * // Prefetch when scanning QR code
 * prefetchAvailability({ clinicId: 'clinic123' })
 * ```
 */
export function usePrefetchDoctorAvailability() {
  const queryClient = useQueryClient()

  return async (options: { clinicId: string; doctorIds?: string[] }) => {
    const { clinicId, doctorIds } = options

    const queryKey = doctorAvailabilityQueryKey(clinicId, doctorIds)

    await queryClient.prefetchQuery({
      queryKey,
      queryFn: async () => {
        const startTime = performance.now()
        const response = await getClinicDoctorAvailability(clinicId, doctorIds)
        const duration = performance.now() - startTime

        console.log(
          `[prefetch] Warmed cache for clinic ${clinicId}` +
          (doctorIds ? ` (${doctorIds.length} doctors)` : ' (all doctors)') +
          ` in ${duration.toFixed(0)}ms`
        )

        return response
      },
      staleTime: 30000, // 30 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes
    })
  }
}

/**
 * Hook to manually invalidate doctor availability cache
 * Useful when you know availability has changed (e.g., doctor went online/offline)
 * 
 * @example
 * ```tsx
 * const invalidateAvailability = useInvalidateDoctorAvailability()
 * 
 * // After doctor updates their status
 * invalidateAvailability({ clinicId: 'clinic123' })
 * ```
 */
export function useInvalidateDoctorAvailability() {
  const queryClient = useQueryClient()

  return (options: { clinicId: string; doctorIds?: string[] }) => {
    const { clinicId, doctorIds } = options

    if (doctorIds && doctorIds.length > 0) {
      // Invalidate specific doctor queries
      doctorIds.forEach(doctorId => {
        queryClient.invalidateQueries({
          queryKey: doctorAvailabilityQueryKey(clinicId, [doctorId]),
        })
      })
    } else {
      // Invalidate all queries for this clinic
      queryClient.invalidateQueries({
        queryKey: doctorAvailabilityQueryKey(clinicId),
      })
    }

    console.log(
      `[invalidate] Cleared availability cache for clinic ${clinicId}` +
      (doctorIds ? ` (${doctorIds.length} doctors)` : ' (all doctors)')
    )
  }
}
