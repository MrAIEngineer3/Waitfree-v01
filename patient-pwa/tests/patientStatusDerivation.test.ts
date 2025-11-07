import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { derivePatientStatusFromQueue } from '../app/queue/[clinicId]/[doctorId]/[queueId]/[patientId]/patientStatusDerivation';
import type { Patient, Queue } from '../app/queue/[clinicId]/[doctorId]/[queueId]/[patientId]/usePatientQueueRealtimeBridge';

const basePatient: Patient = {
  id: 'patient-1',
  name: 'Test',
  age: 34,
  phone: '1234567890',
  tokenNumber: 15,
  status: 'waiting',
  joinedAt: null,
  queueId: 'queue-1',
  clinicId: 'clinic-1',
  doctorId: 'doctor-1'
};

const baseQueue: Queue = {
  id: 'queue-1',
  clinicId: 'clinic-1',
  doctorId: 'doctor-1',
  status: 'active',
  currentToken: 10,
  totalPatients: 20,
  completedPatients: 5
};

describe('derivePatientStatusFromQueue', () => {
  it('returns null when inputs missing', () => {
    assert.equal(derivePatientStatusFromQueue(null, baseQueue), null);
    assert.equal(derivePatientStatusFromQueue(basePatient, null), null);
  });

  it('picks up cancelled status from patient record', () => {
    const patient: Patient = { ...basePatient, status: 'cancelled' };
    assert.equal(derivePatientStatusFromQueue(patient, baseQueue), 'cancelled');
  });

  it('promotes to completed when queue token surpasses patient token', () => {
    const queue: Queue = { ...baseQueue, currentToken: basePatient.tokenNumber + 2 };
    assert.equal(derivePatientStatusFromQueue(basePatient, queue), 'completed');
  });

  it('does not promote when tokens match but status still waiting', () => {
    const queue: Queue = { ...baseQueue, currentToken: basePatient.tokenNumber };
    assert.equal(derivePatientStatusFromQueue(basePatient, queue), null);
  });

  it('promotes to completed when queue ended', () => {
    const queue: Queue = { ...baseQueue, status: 'ended' };
    assert.equal(derivePatientStatusFromQueue(basePatient, queue), 'completed');
  });
});
