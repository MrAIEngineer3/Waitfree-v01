"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLikelyValidIndianPhone = exports.normalizePhoneIfPresent = exports.requireNormalizedPhone = exports.PhoneNormalizationError = void 0;
const google_libphonenumber_1 = require("google-libphonenumber");
const REGION_IN = 'IN';
const phoneUtil = google_libphonenumber_1.PhoneNumberUtil.getInstance();
class PhoneNormalizationError extends Error {
    constructor(message, code = 'invalid-phone') {
        super(message);
        this.name = 'PhoneNormalizationError';
        this.code = code;
    }
}
exports.PhoneNormalizationError = PhoneNormalizationError;
const normalizeInternal = (input, requireValue) => {
    const trimmed = (input ?? '').trim();
    if (!trimmed) {
        if (requireValue) {
            throw new PhoneNormalizationError('Phone number is required', 'empty-phone');
        }
        return null;
    }
    try {
        const parsed = phoneUtil.parseAndKeepRawInput(trimmed, REGION_IN);
        if (!phoneUtil.isValidNumber(parsed) || !phoneUtil.isValidNumberForRegion(parsed, REGION_IN)) {
            throw new PhoneNormalizationError('Invalid phone number for India');
        }
        return phoneUtil.format(parsed, google_libphonenumber_1.PhoneNumberFormat.E164);
    }
    catch (error) {
        if (error instanceof PhoneNormalizationError) {
            throw error;
        }
        throw new PhoneNormalizationError('Invalid phone number format');
    }
};
const requireNormalizedPhone = (input) => {
    const normalized = normalizeInternal(input, true);
    if (!normalized) {
        throw new PhoneNormalizationError('Phone number is required', 'empty-phone');
    }
    return normalized;
};
exports.requireNormalizedPhone = requireNormalizedPhone;
const normalizePhoneIfPresent = (input) => {
    try {
        return normalizeInternal(input ?? '', false);
    }
    catch (error) {
        if (error instanceof PhoneNormalizationError && error.code === 'empty-phone') {
            return null;
        }
        throw error;
    }
};
exports.normalizePhoneIfPresent = normalizePhoneIfPresent;
const isLikelyValidIndianPhone = (input) => {
    if (!input) {
        return false;
    }
    try {
        const parsed = phoneUtil.parseAndKeepRawInput(input, REGION_IN);
        return phoneUtil.isValidNumber(parsed) && phoneUtil.isValidNumberForRegion(parsed, REGION_IN);
    }
    catch {
        return false;
    }
};
exports.isLikelyValidIndianPhone = isLikelyValidIndianPhone;
//# sourceMappingURL=phone.js.map