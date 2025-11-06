import 'server-only';

import type { ClinicDoctorAvailabilityResponse } from '../availability';

export class ClinicNotFoundError extends Error {
  constructor(message = 'Clinic not found') {
    super(message);
    this.name = 'ClinicNotFoundError';
  }
}

const DEFAULT_REGION = process.env.FIREBASE_FUNCTIONS_REGION ?? 'asia-south1';
const DEFAULT_PROJECT =
  process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'waitfree-9b06e';

const normalizeOrigin = (value: string | undefined | null) => {
  if (!value) return null;
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const EMULATOR_HOST = normalizeOrigin(
  process.env.FUNCTIONS_EMULATOR_ORIGIN ??
  process.env.WAITFREE_FUNCTIONS_EMULATOR_ORIGIN ??
  (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true'
    ? `http://${process.env.FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5002'}`
    : null)
);

const FUNCTIONS_ORIGIN = normalizeOrigin(
  process.env.WAITFREE_FUNCTIONS_ORIGIN ?? `https://${DEFAULT_REGION}-${DEFAULT_PROJECT}.cloudfunctions.net`
);

const CALLABLE_TIMEOUT_MS = Number.parseInt(process.env.WAITFREE_FUNCTIONS_TIMEOUT_MS ?? '8000', 10);

const AUTH_HEADER_NAME = process.env.WAITFREE_FUNCTIONS_AUTH_HEADER ?? 'x-waitfree-internal-key';
const AUTH_HEADER_VALUE = process.env.WAITFREE_FUNCTIONS_AUTH_KEY;

export interface ServerClinicDoctorAvailabilityParams {
  clinicId: string;
  doctorIds?: string[];
}

export async function getClinicDoctorAvailabilityServer(
  params: ServerClinicDoctorAvailabilityParams
): Promise<ClinicDoctorAvailabilityResponse> {
  const controller = new AbortController();
  const timeout = Number.isFinite(CALLABLE_TIMEOUT_MS) && CALLABLE_TIMEOUT_MS > 0
    ? CALLABLE_TIMEOUT_MS
    : 8000;
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const usingEmulator = Boolean(EMULATOR_HOST);
    const baseUrl = usingEmulator
      ? `${EMULATOR_HOST}/${DEFAULT_PROJECT}/${DEFAULT_REGION}`
      : FUNCTIONS_ORIGIN ?? '';

    if (!baseUrl) {
      throw new Error('No Cloud Functions origin configured');
    }

    const targetUrl = `${baseUrl}/getClinicDoctorAvailability`;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(!usingEmulator && AUTH_HEADER_VALUE ? { [AUTH_HEADER_NAME]: AUTH_HEADER_VALUE } : {}),
      },
      body: JSON.stringify({
        data: {
          clinicId: params.clinicId,
          ...(params.doctorIds && params.doctorIds.length > 0
            ? { doctorIds: params.doctorIds }
            : {}),
        },
      }),
      signal: controller.signal,
      cache: 'no-store',
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      const statusCode = response.status;
      const statusText = `${statusCode} ${response.statusText}`.trim();
      let errorText: string | null = null;
      let errorMessageFromBody: string | null = null;
      let errorStatusFromBody: string | null = null;
      let errorCodeFromBody: string | null = null;

      try {
        errorText = await response.text();
        if (errorText) {
          try {
            const parsed = JSON.parse(errorText) as unknown;
            if (parsed && typeof parsed === 'object' && 'error' in parsed) {
              const errorField = (parsed as { error?: unknown }).error;
              if (errorField && typeof errorField === 'object' && errorField !== null) {
                const message = (errorField as { message?: unknown }).message;
                if (typeof message === 'string' && message.trim().length > 0) {
                  errorMessageFromBody = message.trim();
                }
                const statusValue = (errorField as { status?: unknown }).status;
                if (typeof statusValue === 'string' && statusValue.trim().length > 0) {
                  errorStatusFromBody = statusValue.trim();
                }
                const codeValue = (errorField as { code?: unknown }).code;
                if (typeof codeValue === 'string' && codeValue.trim().length > 0) {
                  errorCodeFromBody = codeValue.trim();
                } else if (typeof codeValue === 'number' && Number.isFinite(codeValue)) {
                  errorCodeFromBody = String(codeValue);
                }
              }
            }

            if (!errorMessageFromBody && parsed && typeof parsed === 'object' && 'message' in parsed) {
              const message = (parsed as { message?: unknown }).message;
              if (typeof message === 'string' && message.trim().length > 0) {
                errorMessageFromBody = message.trim();
              }
            }
            if (!errorStatusFromBody && parsed && typeof parsed === 'object' && 'status' in parsed) {
              const statusValue = (parsed as { status?: unknown }).status;
              if (typeof statusValue === 'string' && statusValue.trim().length > 0) {
                errorStatusFromBody = statusValue.trim();
              }
            }
            if (!errorCodeFromBody && parsed && typeof parsed === 'object' && 'code' in parsed) {
              const codeValue = (parsed as { code?: unknown }).code;
              if (typeof codeValue === 'string' && codeValue.trim().length > 0) {
                errorCodeFromBody = codeValue.trim();
              } else if (typeof codeValue === 'number' && Number.isFinite(codeValue)) {
                errorCodeFromBody = String(codeValue);
              }
            }
          } catch {
            const trimmed = errorText.trim();
            if (trimmed.length > 0) {
              errorMessageFromBody = trimmed;
            }
          }
        }
      } catch {
        // Ignore body parsing errors; fall back to generic messaging.
      }

      const normalizedStatus = errorStatusFromBody?.toUpperCase() ?? null;
      const normalizedCode = errorCodeFromBody?.toUpperCase() ?? null;
      const messageIndicatesMissingClinic = typeof errorMessageFromBody === 'string'
        ? /clinic/i.test(errorMessageFromBody) && (/not\s+found/i.test(errorMessageFromBody) || /not\s+recognized/i.test(errorMessageFromBody) || /unknown/i.test(errorMessageFromBody))
        : false;

      const bodyIndicatesNotFound = normalizedStatus === 'NOT_FOUND' || normalizedCode === 'NOT_FOUND' || normalizedCode === '404';
      const emulatorRouteMissing = usingEmulator && typeof errorText === 'string' && /cannot\s+post/i.test(errorText);

      if (statusCode === 404 && !emulatorRouteMissing && (messageIndicatesMissingClinic || bodyIndicatesNotFound || usingEmulator)) {
        throw new ClinicNotFoundError(errorMessageFromBody ?? 'Clinic identifier not recognized');
      }

      const hint = usingEmulator
        ? 'Verify the Functions emulator is running on the expected host/port.'
        : 'Check the deployed Cloud Function name and WAITFREE_FUNCTIONS_ORIGIN configuration.';

      const detail = errorMessageFromBody ?? hint;
      throw new Error(`Functions request failed: ${statusText}. ${detail}`);
    }

    const payload = (await response.json()) as { result?: ClinicDoctorAvailabilityResponse; data?: unknown };
    if (payload?.result) {
      return payload.result;
    }

    if (payload?.data && typeof payload.data === 'object') {
      return payload.data as ClinicDoctorAvailabilityResponse;
    }

    throw new Error('Unexpected callable response shape');
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error('Timed out contacting availability service');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
