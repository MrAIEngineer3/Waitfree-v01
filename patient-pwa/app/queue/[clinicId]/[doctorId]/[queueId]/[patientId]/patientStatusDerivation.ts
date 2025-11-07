import type { Patient, Queue } from './usePatientQueueRealtimeBridge';

type ResolvedStatus = Patient['status'] | null;

export function derivePatientStatusFromQueue(
  patient: Patient | null,
  queue: Queue | null
): ResolvedStatus {
  if (!patient || !queue) {
    return null;
  }

  if (patient.status === 'cancelled') {
    return 'cancelled';
  }

  if (queue.status === 'ended') {
    return 'completed';
  }

  const patientToken = typeof patient.tokenNumber === 'number' ? patient.tokenNumber : null;
  const currentToken = typeof queue.currentToken === 'number' ? queue.currentToken : null;

  if (patientToken === null || currentToken === null) {
    return null;
  }

  if (currentToken > patientToken) {
    return 'completed';
  }

  return null;
}
