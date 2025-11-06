import { signInWithCustomToken, type Auth } from 'firebase/auth';
import { httpsCallable, type Functions, type HttpsCallable } from 'firebase/functions';
import { ensurePatientToken } from './tokenStorage';

export interface EstablishSessionArgs {
  clinicId: string;
  doctorId: string;
  queueId: string;
  patientId: string;
}

export interface EstablishSessionContext {
  locationHref: string;
  replaceUrl: (url: string) => void;
  storage: Storage;
}

export interface EstablishSessionDeps {
  createSession: HttpsCallable<CreatePatientSessionPayload, CreatePatientSessionResult>;
  signInWithCustomToken: typeof signInWithCustomToken;
  auth: Auth;
}

export interface CreatePatientSessionPayload {
  clinicId: string;
  doctorId: string;
  queueId: string;
  patientId: string;
  token: string;
}

export interface CreatePatientSessionResult {
  success: boolean;
  token: string;
  patient?: unknown;
}

export class SessionEstablishmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionEstablishmentError';
  }
}

export async function establishPatientSession(
  args: EstablishSessionArgs,
  context: EstablishSessionContext,
  deps: EstablishSessionDeps
): Promise<string> {
  const { clinicId, doctorId, queueId, patientId } = args;

  if (!clinicId || !doctorId || !queueId || !patientId) {
    throw new SessionEstablishmentError('Missing required parameters in URL');
  }

  const { storage, locationHref, replaceUrl } = context;

  try {
    ensurePatientToken({
      patientId,
      storage,
      locationUrl: new URL(locationHref),
      replaceUrl
    });
  } catch (err) {
    throw new SessionEstablishmentError(
      err instanceof Error ? err.message : 'Failed to normalize access token'
    );
  }

  const storedToken = storage.getItem(`patientToken:${patientId}`);
  if (!storedToken) {
    throw new SessionEstablishmentError('Missing access token. Please re-join the queue or use the join form.');
  }

  let customToken: string;
  try {
    const response = await deps.createSession({ clinicId, doctorId, queueId, patientId, token: storedToken });
    customToken = response.data?.token ?? '';
  } catch {
    throw new SessionEstablishmentError('Unable to authenticate your session. Please re-join the queue.');
  }

  if (!customToken) {
    throw new SessionEstablishmentError('Unable to authenticate your session. Please re-join the queue.');
  }

  try {
    await deps.signInWithCustomToken(deps.auth, customToken);
  } catch {
    throw new SessionEstablishmentError('Unable to authenticate your session. Please re-join the queue.');
  }

  return storedToken;
}

export function buildSessionDeps(functionsInstance: Functions, authInstance: Auth): EstablishSessionDeps {
  const createSession = httpsCallable<CreatePatientSessionPayload, CreatePatientSessionResult>(functionsInstance, 'createPatientSession');
  return {
    createSession,
    signInWithCustomToken,
    auth: authInstance
  };
}
