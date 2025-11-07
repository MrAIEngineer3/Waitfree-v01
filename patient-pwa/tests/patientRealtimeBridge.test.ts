import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    classifyFirestoreError,
    getRetryDelayForAttempt
} from '../app/queue/[clinicId]/[doctorId]/[queueId]/[patientId]/usePatientQueueRealtimeBridge';

describe('getRetryDelayForAttempt', () => {
  it('returns base delay for first attempt', () => {
    assert.equal(getRetryDelayForAttempt(1), 1000);
  });

  it('doubles delay with each attempt up to max', () => {
    assert.equal(getRetryDelayForAttempt(2), 2000);
    assert.equal(getRetryDelayForAttempt(3), 4000);
    assert.equal(getRetryDelayForAttempt(4), 8000);
  });

  it('caps delay at max threshold', () => {
    assert.equal(getRetryDelayForAttempt(10), 30000);
    assert.equal(getRetryDelayForAttempt(15), 30000);
  });
});

describe('classifyFirestoreError', () => {
  it('classifies auth failures', () => {
    const result = classifyFirestoreError({ code: 'permission-denied', message: 'permission denied' });
    assert.equal(result.kind, 'auth');
    assert.equal(result.code, 'permission-denied');
  });

  it('classifies transient failures', () => {
    const result = classifyFirestoreError({ code: 'unavailable', message: 'unavailable' });
    assert.equal(result.kind, 'transient');
  });

  it('treats unknown errors sensibly', () => {
    const result = classifyFirestoreError(new Error('boom'));
    assert.equal(result.kind, 'unknown');
    assert.equal(result.message, 'boom');
  });
});
