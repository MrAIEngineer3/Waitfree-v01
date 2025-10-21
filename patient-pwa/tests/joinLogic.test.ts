import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { deserializeAvailabilityPayload, evaluateJoinEligibility } from '../lib/joinLogic';
import type { DoctorAvailabilityPayload } from '../lib/availability';

describe('evaluateJoinEligibility', () => {
  it('allows joining when availability is unknown', () => {
    const decision = evaluateJoinEligibility(null);
    assert.equal(decision.allowJoin, true);
  });

  it('blocks joining when doctor is unavailable', () => {
    const availability: DoctorAvailabilityPayload = {
      status: 'UNAVAILABLE',
      layer: 'DEFAULT_ROTA',
      reasonCode: 'DEFAULT_OFFLINE',
      message: 'Doctor is offline.',
      computedAt: new Date().toISOString(),
      nextAvailableAt: null,
      activeOverride: null,
      realTimeStatus: null,
      debug: null
    };

    const decision = evaluateJoinEligibility(availability);
    assert.equal(decision.allowJoin, false);
    assert.equal(decision.reason, 'Doctor is offline.');
  });
});

describe('deserializeAvailabilityPayload', () => {
  it('parses structured availability payloads', () => {
    const now = new Date().toISOString();
    const result = deserializeAvailabilityPayload({
      status: 'UNAVAILABLE',
      layer: 'DEFAULT_ROTA',
      reasonCode: 'DEFAULT_OFFLINE',
      message: 'Offline for the day',
      computedAt: now,
      nextAvailableAt: now,
      activeOverride: {
        id: 'override-1',
        type: 'blocker',
        start: now,
        end: now,
        note: 'Leave',
        createdAt: now,
        updatedAt: now,
        reasonCode: 'leave'
      },
      realTimeStatus: {
        online: false,
        note: 'Lunch',
        source: 'staff',
        updatedAt: now
      },
      debug: { sample: true }
    });

    assert.ok(result);
    assert.equal(result?.status, 'UNAVAILABLE');
    assert.equal(result?.message, 'Offline for the day');
    assert.equal(result?.activeOverride?.id, 'override-1');
    assert.equal(result?.realTimeStatus?.online, false);
  });

  it('returns null for malformed input', () => {
    const result = deserializeAvailabilityPayload(undefined);
    assert.equal(result, null);
  });
});
