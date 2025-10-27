import { PhoneNumberUtil, PhoneNumberFormat } from 'google-libphonenumber';

const REGION_IN = 'IN';

const phoneUtil = PhoneNumberUtil.getInstance();

export class PhoneNormalizationError extends Error {
  readonly code: 'invalid-phone' | 'empty-phone';

  constructor(message: string, code: 'invalid-phone' | 'empty-phone' = 'invalid-phone') {
    super(message);
    this.name = 'PhoneNormalizationError';
    this.code = code;
  }
}

const normalizeInternal = (input: string, requireValue: boolean): string | null => {
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
    return phoneUtil.format(parsed, PhoneNumberFormat.E164);
  } catch (error) {
    if (error instanceof PhoneNormalizationError) {
      throw error;
    }
    throw new PhoneNormalizationError('Invalid phone number format');
  }
};

export const requireNormalizedPhone = (input: string): string => {
  const normalized = normalizeInternal(input, true);
  if (!normalized) {
    throw new PhoneNormalizationError('Phone number is required', 'empty-phone');
  }
  return normalized;
};

export const normalizePhoneIfPresent = (input: string | null | undefined): string | null => {
  try {
    return normalizeInternal(input ?? '', false);
  } catch (error) {
    if (error instanceof PhoneNormalizationError && error.code === 'empty-phone') {
      return null;
    }
    throw error;
  }
};

export const isLikelyValidIndianPhone = (input: string | null | undefined): boolean => {
  if (!input) {
    return false;
  }
  try {
    const parsed = phoneUtil.parseAndKeepRawInput(input, REGION_IN);
    return phoneUtil.isValidNumber(parsed) && phoneUtil.isValidNumberForRegion(parsed, REGION_IN);
  } catch {
    return false;
  }
};
