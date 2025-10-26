export interface RejoinRedirectParams {
  clinicId: string;
  doctorId: string;
  queueId: string;
  patientId: string;
  accessToken?: string | null;
}

/**
 * Builds the navigation URL for a patient who has rejoined the queue.
 * Ensures we only append a token query parameter when a non-empty token is available.
 */
export function buildRejoinRedirectUrl({
  clinicId,
  doctorId,
  queueId,
  patientId,
  accessToken
}: RejoinRedirectParams): string {
  const base = `/queue/${clinicId}/${doctorId}/${queueId}/${patientId}`;
  if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
    return base;
  }
  return `${base}?t=${encodeURIComponent(accessToken)}`;
}
