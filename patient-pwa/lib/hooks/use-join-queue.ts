import { useMutation } from '@tanstack/react-query'
import { httpsCallable } from 'firebase/functions'
import { toast } from 'sonner'
import { functions } from '../firebase'

interface JoinQueuePayload {
  clinicId: string
  doctorId: string
  patientData: {
    name: string
    age: number
    phone: string
  }
}

interface JoinQueueResult {
  patientId: string
  queueId: string
  doctorId: string
  clinicId: string
  accessToken?: string
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
  return useMutation<JoinQueueResult, Error, JoinQueuePayload, JoinQueueContext>({
    mutationFn: async (payload: JoinQueuePayload) => {
      const joinFn = httpsCallable<JoinQueuePayload, JoinQueueResult>(functions, 'joinQueue')
      const { data } = await joinFn(payload)

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
      
      // Store access token in sessionStorage
      try {
        if (data.accessToken && data.patientId) {
          sessionStorage.setItem(`patientToken:${data.patientId}`, data.accessToken)
        }
      } catch (storageError) {
        console.warn('Failed to store access token in sessionStorage', storageError)
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
    { success: boolean; queueId?: string; message?: string },
    Error,
    { clinicId: string; doctorId: string; queueId: string; patientId: string },
    JoinQueueContext
  >({
    mutationFn: async (payload) => {
      const rejoinFn = httpsCallable<
        typeof payload,
        { success: boolean; queueId?: string; message?: string }
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
    },
  })
}
