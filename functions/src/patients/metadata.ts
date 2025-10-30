import { PATIENT_METADATA_RESERVED_KEYS, PATIENT_METADATA_SCHEMA_VERSION } from './constants';
import type { PatientMetadata, PatientMetadataInput } from './types';

const sanitizeString = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.length <= maxLength ? trimmed : trimmed.slice(0, maxLength);
};

const sanitizeNullableString = (value: unknown, maxLength: number): string | null => {
  const sanitized = sanitizeString(value, maxLength);
  return sanitized ?? null;
};

const sanitizeStringList = (value: unknown, maxEntries: number, entryMaxLength: number): string[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const result: string[] = [];
  for (const entry of value) {
    const sanitized = sanitizeString(entry, entryMaxLength);
    if (sanitized) {
      result.push(sanitized);
    }
    if (result.length >= maxEntries) {
      break;
    }
  }
  return result.length > 0 ? result : null;
};

const sanitizeMetadataRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const result: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    if (typeof rawKey !== 'string') {
      continue;
    }
    const key = rawKey.trim();
    if (!key) {
      continue;
    }
    if (PATIENT_METADATA_RESERVED_KEYS.has(key)) {
      continue;
    }
    if (typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean' || rawValue === null) {
      result[key] = rawValue;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
};

export const normalizePatientMetadata = (input: PatientMetadataInput | null | undefined): PatientMetadata => {
  const metadata: PatientMetadata = {
    schemaVersion: PATIENT_METADATA_SCHEMA_VERSION,
    metadata: {}
  };

  if (!input) {
    return metadata;
  }

  metadata.gender = sanitizeNullableString(input.gender, 32);
  metadata.dob = sanitizeNullableString(input.dob, 32);

  if (typeof input.age === 'number' && Number.isFinite(input.age)) {
    const age = Math.trunc(input.age);
    if (age > 0 && age <= 150) {
      metadata.age = age;
    }
  }

  metadata.address = sanitizeNullableString(input.address, 512);
  metadata.guardianName = sanitizeNullableString(input.guardianName, 120);
  metadata.bloodGroup = sanitizeNullableString(input.bloodGroup, 16);
  metadata.preferredLanguage = sanitizeNullableString(input.preferredLanguage, 64);
  metadata.notes = sanitizeNullableString(input.notes, 1024);

  metadata.allergies = sanitizeStringList(input.allergies, 32, 64);
  metadata.chronicConditions = sanitizeStringList(input.chronicConditions, 64, 64);
  metadata.tags = sanitizeStringList(input.tags, 32, 64);

  const metadataMap = sanitizeMetadataRecord(input.metadata ?? null);
  metadata.metadata = metadataMap ?? {};

  return metadata;
};
