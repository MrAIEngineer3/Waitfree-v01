"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertValidPatientInput = exports.sanitizePatientInput = exports.PatientValidationError = void 0;
const phone_1 = require("./phone");
class PatientValidationError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'PatientValidationError';
        this.code = code;
    }
}
exports.PatientValidationError = PatientValidationError;
const collapseWhitespace = (value) => value.replace(/\s+/g, ' ');
const normalizeName = (input) => {
    if (typeof input !== 'string') {
        throw new PatientValidationError('Patient name is required', 'invalid-name');
    }
    const trimmed = collapseWhitespace(input.trim());
    if (trimmed.length < 2 || trimmed.length > 100) {
        throw new PatientValidationError('Patient name must be between 2 and 100 characters', 'invalid-name');
    }
    return trimmed;
};
const normalizeAge = (input, requireAge) => {
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
const normalizePhone = (input, options) => {
    const raw = typeof input === 'string' ? input.trim() : '';
    if (!raw) {
        if (options.requirePhone) {
            throw new PatientValidationError('Patient phone is required', 'invalid-phone');
        }
        return null;
    }
    try {
        return (0, phone_1.requireNormalizedPhone)(raw);
    }
    catch (error) {
        if (error instanceof phone_1.PhoneNormalizationError) {
            throw new PatientValidationError(error.message, 'invalid-phone');
        }
        throw new PatientValidationError('Invalid phone number', 'invalid-phone');
    }
};
const sanitizePatientInput = (input, options = {}) => {
    const requireAge = options.requireAge !== false;
    const name = normalizeName(input?.name);
    const age = normalizeAge(input?.age, requireAge);
    const phone = normalizePhone(input?.phone, options);
    return { name, age, phone };
};
exports.sanitizePatientInput = sanitizePatientInput;
const assertValidPatientInput = (input, options = {}) => {
    return (0, exports.sanitizePatientInput)(input, options);
};
exports.assertValidPatientInput = assertValidPatientInput;
//# sourceMappingURL=patient.js.map