import { requireNormalizedPhone, PhoneNormalizationError } from './phone';

type PatientValidationCode = 'invalid-name' | 'invalid-age' | 'invalid-phone';

export class PatientValidationError extends Error {
  readonly code: PatientValidationCode;

  constructor(message: string, code: PatientValidationCode) {
    super(message);
    this.name = 'PatientValidationError';
    this.code = code;
  }
}

export interface PatientInputLike {
  name?: unknown;
  age?: unknown;
  phone?: unknown;
}

export interface SanitizedPatientData {
  name: string;
  age: number | null;
  phone: string | null;
}

export interface PatientSanitizerOptions {
  requirePhone?: boolean;
  requireAge?: boolean;
}

const collapseWhitespace = (value: string): string => value.replace(/\s+/g, ' ');

const normalizeName = (input: unknown): string => {
  if (typeof input !== 'string') {
    throw new PatientValidationError('Patient name is required', 'invalid-name');
  }
  const trimmed = collapseWhitespace(input.trim());
  if (trimmed.length < 2 || trimmed.length > 100) {
    throw new PatientValidationError('Patient name must be between 2 and 100 characters', 'invalid-name');
  }
  return trimmed;
};

const normalizeAge = (input: unknown, requireAge: boolean): number | null => {
  if (input === null || input === undefined || (typeof input === 'string' && input.trim().length === 0)) {
    if (requireAge) {
      throw new PatientValidationError('Patient age is required', 'invalid-age');
    }
    return null;
  }

  const value = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(value)) {
    throw new PatientValidationError('Patient age must be a number', 'invalid-age');
  }
  const rounded = Math.trunc(value);
  if (rounded !== value) {
    throw new PatientValidationError('Patient age must be an integer', 'invalid-age');
  }
  if (rounded < 1 || rounded > 120) {
    throw new PatientValidationError('Patient age must be between 1 and 120', 'invalid-age');
  }
  return rounded;
};

const normalizePhone = (input: unknown, options: PatientSanitizerOptions): string | null => {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) {
    if (options.requirePhone) {
      throw new PatientValidationError('Patient phone is required', 'invalid-phone');
    }
    return null;
  }
  try {
    return requireNormalizedPhone(raw);
  } catch (error) {
    if (error instanceof PhoneNormalizationError) {
      throw new PatientValidationError(error.message, 'invalid-phone');
    }
    throw new PatientValidationError('Invalid phone number', 'invalid-phone');
  }
};

export const sanitizePatientInput = (
  input: PatientInputLike | null | undefined,
  options: PatientSanitizerOptions = {}
): SanitizedPatientData => {
  const requireAge = options.requireAge !== false;
  const name = normalizeName(input?.name);
  const age = normalizeAge(input?.age, requireAge);
  const phone = normalizePhone(input?.phone, options);
  return { name, age, phone } satisfies SanitizedPatientData;
};

export const assertValidPatientInput = (
  input: PatientInputLike | null | undefined,
  options: PatientSanitizerOptions = {}
): SanitizedPatientData => {
  return sanitizePatientInput(input, options);
};
