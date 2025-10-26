# Cancel Token Feature Plan

## Overview
Implement a safe self-service cancellation flow for patients on the WaitFree PWA, including a follow-up pathway to rejoin the queue without rescanning.

## Objectives
- Allow patients with status `waiting` to cancel their token from the queue status page.
- Ensure cancellations trigger existing notification workflows and are logged with appropriate metadata.
- Provide an immediate "rejoin" option that issues a new token via the standard joining flow.
- Maintain data integrity, observability, and a clear experience for both patients and staff.

## Deliverables
1. **Backend callable functions** supporting patient-driven cancel and rejoin actions with token validation and guardrails.
2. **Patient PWA UI updates** to drive the new flows, including confirmation dialog, error handling, and rejoin CTA.
3. **Type and schema updates** to persist cancellation metadata without breaking existing consumers.
4. **Tests & QA guidance** covering critical happy paths and edge cases.
5. **Documentation updates** (this plan, plus any follow-up notes in existing docs if needed).

## Task Breakdown
- [x] Design callable contract and data validation rules.
- [x] Implement `patientCancelToken` callable (token verification, status guard, metadata, notification reuse).
- [x] Extend shared Firestore types & ensure dashboard tolerance for new fields.
- [x] Update queue status page UI (cancel button, confirmation flow, sonner messaging).
- [x] Add client wiring to call the new cancel callable and handle optimistic updates.
- [x] Implement `patientRejoinQueue` callable leveraging existing `joinQueue` logic.
- [x] Add rejoin CTA & flow in the PWA, including navigation/token storage refresh.
- [x] Verify WhatsApp notifications fire correctly for cancel + rejoin scenarios.
- [x] Add/update automated tests (client utilities) and document manual test scenarios.
- [ ] Final review & cleanup (including updating this plan with status and notes).

## Milestones & Notes
- **Planning complete** – requirements clarified with stakeholder.
- **Implementation phase** – tasks above executed in sequence, updating status after each.
- **Validation phase** – run targeted manual tests (emulator & production as applicable).
- **Handover** – summarize changes, highlight remaining risks, and link relevant docs.

## Open Considerations
- Communicate in UI that rejoining issues a new token number.
- Ensure callable error responses are patient-friendly while not leaking sensitive info.
- Monitor for duplicate notifications; adjust if backend logs indicate double sends.

(Progress updates will be appended here as tasks complete.)

### Progress Log
- 2025-10-26: Finalized callable contracts. `patientCancelToken` will accept `{ clinicId, doctorId, queueId, patientId, token }` and enforce `status === 'waiting'` before delegating to `updatePatientStatusHandler`. `patientRejoinQueue` will accept the same payload, require `status === 'cancelled'`, re-run availability checks, and reuse `joinQueue` to issue a fresh token. Both responses will return `{ success, status, message, ... }` with guarded error codes.
- 2025-10-26: Implemented `patientCancelToken` callable with token hashing, waiting-status guard, cancellation metadata capture, and reuse of `updatePatientStatusHandler` to trigger notifications.
- 2025-10-26: Implemented `patientRejoinQueue` callable to validate tokens, ensure cancelled status, rehydrate patient demographics, and call `joinQueueHandler` for a fresh token while logging rejoin metadata.
- 2025-10-26: Updated `types/firestore.ts` with optional cancellation metadata to keep type consumers in sync.
- 2025-10-26: Updated queue status page with confirmation dialog, loading feedback, and contextual messaging for cancel/rejoin states.
- 2025-10-26: Wired patient queue UI to new callables with optimistic state updates and navigation to the new token on rejoin.
- 2025-10-26: Verified WhatsApp notifications fire once for cancel/rejoin paths during manual QA.
- 2025-10-26: Added `buildRejoinRedirectUrl` helper + unit tests (now 11/11 passing via `npm run test`) and captured manual test coverage notes.
- 2025-10-26: Added Vitest coverage for `patientCancelTokenHandler` to guard callable edge cases.
