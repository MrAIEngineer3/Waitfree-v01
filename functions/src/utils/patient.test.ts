import { describe, it, expect } from 'vitest';

import {
  sanitizePatientInput,
  assertValidPatientInput,
  PatientValidationError
} from './patient';

describe('patient utilities', () => {
  it('sanitizes basic patient input with defaults', () => {
    const result = sanitizePatientInput({
      name: '  Jane   Doe ',
      age: '30',
      phone: '9876543210'
    });

    expect(result).toEqual({
      name: 'Jane Doe',
      age: 30,
      phone: '+919876543210'
    });
  });

  it('allows optional age when requireAge is false', () => {
    const result = sanitizePatientInput({ name: 'John Smith', age: '', phone: '9876543210' }, { requireAge: false });
    expect(result.age).toBeNull();
  });

  it('throws when patient name is missing or too short', () => {
    expect(() => sanitizePatientInput({ name: 'J', age: 25, phone: '9876543210' })).toThrow(PatientValidationError);
  });

  it('throws when age is non-numeric', () => {
    expect(() => sanitizePatientInput({ name: 'John Smith', age: 'abc', phone: '9876543210' })).toThrow(
      PatientValidationError
    );
  });

  it('requires phone when configured', () => {
    expect(() =>
      sanitizePatientInput({ name: 'John Smith', age: 35, phone: '' }, { requirePhone: true })
    ).toThrow(PatientValidationError);
  });

  it('assertValidPatientInput mirrors sanitizePatientInput', () => {
    const data = assertValidPatientInput({ name: 'Amy Pond', age: 28, phone: '9876543210' });
    expect(data).toEqual({ name: 'Amy Pond', age: 28, phone: '+919876543210' });
  });
});
