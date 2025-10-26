import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRejoinRedirectUrl } from '../app/queue/[clinicId]/[doctorId]/[queueId]/[patientId]/rejoinUtils';

describe('buildRejoinRedirectUrl', () => {
  it('returns base path without token when accessToken is missing', () => {
    const url = buildRejoinRedirectUrl({
      clinicId: 'clinic-1',
      doctorId: 'doctor-2',
      queueId: 'queue-3',
      patientId: 'patient-4'
    });
    assert.equal(url, '/queue/clinic-1/doctor-2/queue-3/patient-4');
  });

  it('appends encoded token as query string when provided', () => {
    const url = buildRejoinRedirectUrl({
      clinicId: 'clinic',
      doctorId: 'doc',
      queueId: 'queue',
      patientId: 'patient',
      accessToken: 'token value'
    });
    assert.equal(url, '/queue/clinic/doc/queue/patient?t=token%20value');
  });

  it('ignores whitespace-only tokens', () => {
    const url = buildRejoinRedirectUrl({
      clinicId: 'c',
      doctorId: 'd',
      queueId: 'q',
      patientId: 'p',
      accessToken: '   '
    });
    assert.equal(url, '/queue/c/d/q/p');
  });
});
