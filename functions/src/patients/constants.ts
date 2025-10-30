export const PATIENTS_COLLECTION = 'patients';
export const PATIENT_PHONE_LOOKUP_COLLECTION = 'patientPhoneLookup';
export const PATIENT_AMBIGUITY_COLLECTION = 'patientAmbiguityQueue';
export const PATIENT_AUDIT_COLLECTION = 'patientAuditLog';

export const PATIENT_CORE_SCHEMA_VERSION = 1;
export const PATIENT_METADATA_SCHEMA_VERSION = 1;
export const PATIENT_RESOLVER_VERSION = 'patientResolverV1';

export const AMBIGUITY_ACTIVE_TTL_DAYS = 90;
export const AMBIGUITY_NEARLINE_TTL_DAYS = 180;
export const AMBIGUITY_DEEP_ARCHIVE_AFTER_DAYS = 365;

export const PHONE_HASH_DEFAULT_VERSION = 'v1';

export const METADATA_OPTIONAL_FIELDS = [
  'gender',
  'dob',
  'age',
  'address',
  'alternatePhone',
  'guardianName',
  'bloodGroup',
  'allergies',
  'chronicConditions',
  'preferredLanguage',
  'notes'
] as const;

export const PATIENT_METADATA_RESERVED_KEYS = new Set([
  'schemaVersion',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy'
]);
