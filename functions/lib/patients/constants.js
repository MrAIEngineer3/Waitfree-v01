"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PATIENT_METADATA_RESERVED_KEYS = exports.METADATA_OPTIONAL_FIELDS = exports.PHONE_HASH_DEFAULT_VERSION = exports.AMBIGUITY_DEEP_ARCHIVE_AFTER_DAYS = exports.AMBIGUITY_NEARLINE_TTL_DAYS = exports.AMBIGUITY_ACTIVE_TTL_DAYS = exports.PATIENT_RESOLVER_VERSION = exports.PATIENT_METADATA_SCHEMA_VERSION = exports.PATIENT_CORE_SCHEMA_VERSION = exports.PATIENT_AUDIT_COLLECTION = exports.PATIENT_AMBIGUITY_COLLECTION = exports.PATIENT_PHONE_LOOKUP_COLLECTION = exports.PATIENTS_COLLECTION = void 0;
exports.PATIENTS_COLLECTION = 'patients';
exports.PATIENT_PHONE_LOOKUP_COLLECTION = 'patientPhoneLookup';
exports.PATIENT_AMBIGUITY_COLLECTION = 'patientAmbiguityQueue';
exports.PATIENT_AUDIT_COLLECTION = 'patientAuditLog';
exports.PATIENT_CORE_SCHEMA_VERSION = 1;
exports.PATIENT_METADATA_SCHEMA_VERSION = 1;
exports.PATIENT_RESOLVER_VERSION = 'patientResolverV1';
exports.AMBIGUITY_ACTIVE_TTL_DAYS = 90;
exports.AMBIGUITY_NEARLINE_TTL_DAYS = 180;
exports.AMBIGUITY_DEEP_ARCHIVE_AFTER_DAYS = 365;
exports.PHONE_HASH_DEFAULT_VERSION = 'v1';
exports.METADATA_OPTIONAL_FIELDS = [
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
];
exports.PATIENT_METADATA_RESERVED_KEYS = new Set([
    'schemaVersion',
    'createdAt',
    'updatedAt',
    'createdBy',
    'updatedBy'
]);
//# sourceMappingURL=constants.js.map