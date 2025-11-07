import type { Doctor, Patient, Queue } from '@/app/queue/[clinicId]/[doctorId]/[queueId]/[patientId]/usePatientQueueRealtimeBridge'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { httpsCallable } from 'firebase/functions'
import { toast } from 'sonner'
import { anonymizeId, trackAnalyticsEvent } from '../analytics'
import { functions } from '../firebase'

interface JoinQueueCallablePayload {
  clinicId: string
  doctorId: string
  patientData: {
    name: string
    age: number
    phone: string
  }
}

interface JoinQueuePayload extends JoinQueueCallablePayload {
  optimisticDoctor?: {
    name?: string
    specialty?: string
  }
}

interface JoinQueueResult {
  patientId: string
  queueId: string
  doctorId: string
  clinicId: string
  accessToken?: string
  tokenNumber?: number
  patientIdentityId?: string
  patientResolver?: {
    version: string
    matchType: string
    confidence: string
    requiresReview: boolean
    metadataVersion: number
    ambiguityId?: string | null
  } | null
}

interface JoinQueueContext {
  optimisticPatientId?: string
  startTime: number
}

interface RejoinQueueResult {
  success: boolean
  queueId?: string
  message?: string
  rejoin?: {
    clinicId: string
    doctorId: string
    queueId: string
    patientId: string
    accessToken: string
  }
}

// Helper to get error message
function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message)
  }
  return fallback
}

/**
 * Hook for joining a queue with optimistic feedback
 * Provides instant "Joining..." feedback while backend processes
 */
export function useJoinQueue() {
  const queryClient = useQueryClient()

  return useMutation<JoinQueueResult, Error, JoinQueuePayload, JoinQueueContext>({
    mutationFn: async (payload: JoinQueuePayload) => {
      const { optimisticDoctor, ...callablePayload } = payload
      void optimisticDoctor

      const joinFn = httpsCallable<JoinQueueCallablePayload, JoinQueueResult>(functions, 'joinQueue')
      const { data } = await joinFn(callablePayload)

      if (!data?.patientId) {
        throw new Error('Failed to join queue. Please try again.')
      }

      return data
    },

    onMutate: async () => {
      // Provide optimistic feedback
      const startTime = performance.now()
      
      // We can't show optimistic "success" for join queue because we need the real patientId
      // But we can track timing for UX feedback
      return { startTime }
    },

    onError: (error, variables, context) => {
      const duration = context ? performance.now() - context.startTime : 0
      console.error('Error joining queue:', error, `(${duration.toFixed(0)}ms)`)
      
      const errorMessage = getErrorMessage(error, 'Failed to join queue. Please try again.')
      toast.error(errorMessage)
    },

    onSuccess: (data, variables, context) => {
      const duration = context ? performance.now() - context.startTime : 0
      console.log(`Successfully joined queue in ${duration.toFixed(0)}ms`)

      trackAnalyticsEvent('queue_joined', {
        clinic_id: data.clinicId,
        doctor_id: data.doctorId,
        queue_id: data.queueId,
        wait_duration_ms: Math.round(duration),
        patient_hint: anonymizeId(data.patientId),
        source: 'patient_pwa'
      })

      trackAnalyticsEvent('patient_joined', {
        clinic_id: data.clinicId,
        doctor_id: data.doctorId,
        queue_id: data.queueId,
        token_number: data.tokenNumber ?? null,
        patient_hint: anonymizeId(data.patientId),
        resolver_match: data.patientResolver?.matchType ?? null,
        source: 'patient_pwa'
      })
      
      // Store access token in sessionStorage
      try {
        if (data.accessToken && data.patientId) {
          sessionStorage.setItem(`patientToken:${data.patientId}`, data.accessToken)
        }
      } catch (storageError) {
        console.warn('Failed to store access token in sessionStorage', storageError)
      }

      try {
        const patientKey = ['patient-view', data.clinicId, data.doctorId, data.queueId, data.patientId] as const
        const queueKey = ['queue', data.clinicId, data.doctorId, data.queueId] as const
        const doctorKey = ['doctor', data.clinicId, data.doctorId] as const

        const optimisticPatient: Patient = {
          id: data.patientId,
          name: variables.patientData.name,
          age: variables.patientData.age,
          phone: variables.patientData.phone,
          tokenNumber: data.tokenNumber ?? 0,
          status: 'waiting',
          joinedAt: new Date(),
          queueId: data.queueId,
          clinicId: data.clinicId,
          doctorId: data.doctorId,
        }

        queryClient.setQueryData<Patient | undefined>(patientKey, (prev) => prev ?? optimisticPatient)

        queryClient.setQueryData<Queue | undefined>(queueKey, (prev) => {
          if (prev) {
            return prev
          }
          const fallbackCurrent = Math.max(optimisticPatient.tokenNumber - 1, 0)
          return {
            id: data.queueId,
            doctorId: data.doctorId,
            clinicId: data.clinicId,
            status: 'active',
            currentToken: fallbackCurrent,
            totalPatients: 1,
            completedPatients: 0,
          }
        })

        queryClient.setQueryData<Doctor | undefined>(doctorKey, (prev) => prev ?? {
          id: data.doctorId,
          clinicId: data.clinicId,
          name: variables.optimisticDoctor?.name ?? variables.doctorId,
          specialty: variables.optimisticDoctor?.specialty ?? 'Doctor',
        })
      } catch (cacheError) {
        console.warn('Failed to seed optimistic queue cache', cacheError)
      }

      // Success toast is handled by the component after navigation
      // to avoid duplicate toasts
    },
  })
}

/**
 * Hook for rejoining a queue (when patient was cancelled/completed)
 * Used in the queue status page
 */
export function useRejoinQueue() {
  return useMutation<
    RejoinQueueResult,
    Error,
    { clinicId: string; doctorId: string; queueId: string; patientId: string; token: string },
    JoinQueueContext
  >({
    mutationFn: async (payload) => {
      const rejoinFn = httpsCallable<
        typeof payload,
        RejoinQueueResult
      >(functions, 'patientRejoinQueue')
      
      const { data } = await rejoinFn(payload)

      if (!data?.success) {
        throw new Error(data?.message || 'Failed to rejoin queue. Please try again.')
      }

      return data
    },

    onMutate: async () => {
      const startTime = performance.now()
      return { startTime }
    },

    onError: (error, variables, context) => {
      const duration = context ? performance.now() - context.startTime : 0
      console.error('Error rejoining queue:', error, `(${duration.toFixed(0)}ms)`)
      
      const errorMessage = getErrorMessage(error, 'Failed to rejoin queue. Please try again.')
      toast.error(errorMessage)
    },

    onSuccess: (data, variables, context) => {
      const duration = context ? performance.now() - context.startTime : 0
      console.log(`Successfully rejoined queue in ${duration.toFixed(0)}ms`)
      
      toast.success(data.message || 'Successfully rejoined the queue!')

      trackAnalyticsEvent('queue_joined', {
        clinic_id: variables.clinicId,
        doctor_id: variables.doctorId,
        queue_id: data.rejoin?.queueId ?? variables.queueId,
        wait_duration_ms: Math.round(duration),
        patient_hint: anonymizeId(variables.patientId),
        source: 'patient_pwa_rejoin'
      })
    },
  })
}
