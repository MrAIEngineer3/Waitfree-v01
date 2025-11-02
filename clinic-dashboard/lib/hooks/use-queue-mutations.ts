import { useMutation, useQueryClient } from '@tanstack/react-query'
import { httpsCallable } from 'firebase/functions'
import { toast } from 'sonner'
import { functions } from '../firebase'

interface Patient {
  id: string
  name?: string
  status: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

// Helper to get error message
function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message)
  }
  return fallback
}

/**
 * Hook for calling a patient (status: waiting -> in-progress)
 * Optimistically updates UI before backend confirms
 */
export function useCallPatient(clinicId: string, doctorId: string, queueId: string) {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (patientId: string) => {
      const updatePatientStatus = httpsCallable(functions, 'updatePatientStatus')
      await updatePatientStatus({ 
        clinicId, 
        doctorId, 
        queueId, 
        patientId, 
        newStatus: 'in-progress' 
      })
    },
    
    onMutate: async (patientId: string) => {
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      const queryKey = ['patients', clinicId, doctorId, queueId]
      await queryClient.cancelQueries({ queryKey })
      
      // Snapshot the previous value
      const previousPatients = queryClient.getQueryData<Patient[]>(queryKey)
      
      // Optimistically update to new value
      queryClient.setQueryData<Patient[]>(queryKey, (old) =>
        old?.map(p => p.id === patientId ? { ...p, status: 'in-progress' } : p)
      )
      
      // Return context with previous value for rollback
      return { previousPatients, patientId }
    },
    
    onError: (error, _patientId, context) => {
      // Rollback on error
      if (context?.previousPatients) {
        const queryKey = ['patients', clinicId, doctorId, queueId]
        queryClient.setQueryData(queryKey, context.previousPatients)
      }
      console.error('Error calling patient:', error)
      toast.error(getErrorMessage(error, 'Failed to call patient'))
    },
    
    onSuccess: (data, patientId) => {
      // Find patient name for success message
      const patients = queryClient.getQueryData<Patient[]>(['patients', clinicId, doctorId, queueId])
      const patient = patients?.find(p => p.id === patientId)
      toast.success(`${patient?.name || 'Patient'} has been called`)
    },
    
    // Note: We don't need onSettled/invalidateQueries because Firestore listeners
    // will automatically sync the real data from the backend
  })
}

/**
 * Hook for completing a patient (status: in-progress -> completed)
 * Optimistically updates UI before backend confirms
 */
export function useCompletePatient(clinicId: string, doctorId: string, queueId: string) {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (patientId: string) => {
      const updatePatientStatus = httpsCallable(functions, 'updatePatientStatus')
      await updatePatientStatus({ 
        clinicId, 
        doctorId, 
        queueId, 
        patientId, 
        newStatus: 'completed' 
      })
    },
    
    onMutate: async (patientId: string) => {
      const queryKey = ['patients', clinicId, doctorId, queueId]
      await queryClient.cancelQueries({ queryKey })
      
      const previousPatients = queryClient.getQueryData<Patient[]>(queryKey)
      
      queryClient.setQueryData<Patient[]>(queryKey, (old) =>
        old?.map(p => p.id === patientId ? { ...p, status: 'completed' } : p)
      )
      
      return { previousPatients, patientId }
    },
    
    onError: (error, _patientId, context) => {
      if (context?.previousPatients) {
        const queryKey = ['patients', clinicId, doctorId, queueId]
        queryClient.setQueryData(queryKey, context.previousPatients)
      }
      console.error('Error completing patient:', error)
      toast.error(getErrorMessage(error, 'Failed to complete patient'))
    },
    
    onSuccess: (data, patientId) => {
      const patients = queryClient.getQueryData<Patient[]>(['patients', clinicId, doctorId, queueId])
      const patient = patients?.find(p => p.id === patientId)
      toast.success(`${patient?.name || 'Patient'} marked as completed`)
    },
  })
}

/**
 * Hook for cancelling a patient (status: * -> cancelled)
 * Optimistically updates UI before backend confirms
 */
export function useCancelPatient(clinicId: string, doctorId: string, queueId: string) {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (patientId: string) => {
      const updatePatientStatus = httpsCallable(functions, 'updatePatientStatus')
      await updatePatientStatus({ 
        clinicId, 
        doctorId, 
        queueId, 
        patientId, 
        newStatus: 'cancelled' 
      })
    },
    
    onMutate: async (patientId: string) => {
      const queryKey = ['patients', clinicId, doctorId, queueId]
      await queryClient.cancelQueries({ queryKey })
      
      const previousPatients = queryClient.getQueryData<Patient[]>(queryKey)
      
      queryClient.setQueryData<Patient[]>(queryKey, (old) =>
        old?.map(p => p.id === patientId ? { ...p, status: 'cancelled' } : p)
      )
      
      return { previousPatients, patientId }
    },
    
    onError: (error, _patientId, context) => {
      if (context?.previousPatients) {
        const queryKey = ['patients', clinicId, doctorId, queueId]
        queryClient.setQueryData(queryKey, context.previousPatients)
      }
      console.error('Error cancelling patient:', error)
      toast.error(getErrorMessage(error, 'Failed to cancel patient'))
    },
    
    onSuccess: (data, patientId) => {
      const patients = queryClient.getQueryData<Patient[]>(['patients', clinicId, doctorId, queueId])
      const patient = patients?.find(p => p.id === patientId)
      toast.success(`${patient?.name || 'Patient'} has been cancelled`)
    },
  })
}

/**
 * Hook for uncalling a patient (status: in-progress -> waiting)
 * Optimistically updates UI before backend confirms
 */
export function useUncallPatient(clinicId: string, doctorId: string, queueId: string) {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (patientId: string) => {
      const updatePatientStatus = httpsCallable(functions, 'updatePatientStatus')
      await updatePatientStatus({ 
        clinicId, 
        doctorId, 
        queueId, 
        patientId, 
        newStatus: 'waiting' 
      })
    },
    
    onMutate: async (patientId: string) => {
      const queryKey = ['patients', clinicId, doctorId, queueId]
      await queryClient.cancelQueries({ queryKey })
      
      const previousPatients = queryClient.getQueryData<Patient[]>(queryKey)
      
      queryClient.setQueryData<Patient[]>(queryKey, (old) =>
        old?.map(p => p.id === patientId ? { ...p, status: 'waiting' } : p)
      )
      
      return { previousPatients, patientId }
    },
    
    onError: (error, _patientId, context) => {
      if (context?.previousPatients) {
        const queryKey = ['patients', clinicId, doctorId, queueId]
        queryClient.setQueryData(queryKey, context.previousPatients)
      }
      console.error('Error uncalling patient:', error)
      toast.error(getErrorMessage(error, 'Failed to uncall patient'))
    },
    
    onSuccess: (data, patientId) => {
      const patients = queryClient.getQueryData<Patient[]>(['patients', clinicId, doctorId, queueId])
      const patient = patients?.find(p => p.id === patientId)
      toast.success(`${patient?.name || 'Patient'} has been moved back to waiting`)
    },
  })
}
