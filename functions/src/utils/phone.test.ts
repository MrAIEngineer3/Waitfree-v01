import { describe, it, expect } from 'vitest';

import {
  requireNormalizedPhone,
  normalizePhoneIfPresent,
  isLikelyValidIndianPhone,
  PhoneNormalizationError
} from './phone';

describe('phone utilities', () => {
  it('normalizes valid Indian numbers to E.164', () => {
    const result = requireNormalizedPhone(' 9876543210 ');
    expect(result).toBe('+919876543210');
  });

  it('throws a PhoneNormalizationError for invalid inputs', () => {
    expect(() => requireNormalizedPhone('12345')).toThrow(PhoneNormalizationError);
  });

  it('returns null when optional phone input is blank', () => {
    expect(normalizePhoneIfPresent('')).toBeNull();
    expect(normalizePhoneIfPresent('   ')).toBeNull();
  });

  it('bubbles up errors for invalid optional numbers', () => {
    expect(() => normalizePhoneIfPresent('invalid')).toThrow(PhoneNormalizationError);
  });

  it('detects likely valid Indian numbers', () => {
    expect(isLikelyValidIndianPhone('+919876543210')).toBe(true);
    expect(isLikelyValidIndianPhone('12345')).toBe(false);
    expect(isLikelyValidIndianPhone(null)).toBe(false);
  });
});
