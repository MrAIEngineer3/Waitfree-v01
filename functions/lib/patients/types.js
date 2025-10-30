"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PATIENT_RESOLVER_IDENTIFIER = exports.PATIENT_CORE_DEFAULTS = exports.defaultPatientMetadata = void 0;
const constants_1 = require("./constants");
const defaultPatientMetadata = () => ({
    schemaVersion: constants_1.PATIENT_METADATA_SCHEMA_VERSION,
    metadata: {}
});
exports.defaultPatientMetadata = defaultPatientMetadata;
exports.PATIENT_CORE_DEFAULTS = {
    schemaVersion: constants_1.PATIENT_CORE_SCHEMA_VERSION,
    metadataVersion: constants_1.PATIENT_METADATA_SCHEMA_VERSION,
    auditVersion: 1,
    status: 'active'
};
exports.PATIENT_RESOLVER_IDENTIFIER = constants_1.PATIENT_RESOLVER_VERSION;
//# sourceMappingURL=types.js.map