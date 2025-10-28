# Test Coverage Progress

This log tracks the current automated test coverage status and the next batches of tests we plan to add while preparing for dependency upgrades.

## Functions service
- [x] E2E: `functions/tests/authorization.e2e.test.ts`
- [x] E2E: `functions/tests/patientLifecycle.e2e.test.ts`
- [x] E2E: `functions/tests/scheduleOverrides.e2e.test.ts`
- [x] Unit: `functions/src/utils/` (timing, phone, patient)
- [x] Unit: `functions/src/notifier.test.ts`
- [x] Unit: `functions/src/patientCancelToken.test.ts`
- [x] Unit: `functions/src/scheduling/resolveDoctorAvailability.test.ts`
- [x] Unit: `functions/src/scheduling/requestDoctorOnlineNotification.test.ts`
- [x] Unit: `functions/src/scheduling/notificationQueue.test.ts`
- [x] Unit: `functions/src/scheduling/setDoctorRealTimeStatus.test.ts` *(added this iteration)*
- [x] Unit: `functions/src/notificationEngine.test.ts` *(added this iteration)*
- [x] Integration: callable `joinQueue` happy-path (emulator-backed) *(added this iteration)*
- [x] Integration: queue lifecycle callables — join, cancel, rejoin, advance, auto-advance toggle, status updates via `functions/tests/queueLifecycle.e2e.test.ts` *(added this iteration)*
- [ ] Integration: queue lifecycle negative paths *(pending – invalid token + paused queue covered; still need double rejoin, unauthorized staff, edge-case cleanup)*

## Patient PWA
- [ ] Component/UI: queue landing + join flow smoke tests *(pending)*
- [ ] E2E: patient rejoin via browser automation (Playwright) once API harness stabilises *(pending)*

## Clinic dashboard
- [ ] Component/UI: App shell + queue list rendering smoke tests *(pending)*
- [ ] E2E: happy-path navigation (staff sign-in, queue management) before major framework bumps *(pending)*

## Next actions
1. Add validation / negative-path coverage for queue lifecycle callables (join, cancel, rejoin, advance, status). *(pending)*
2. Add validation / negative-path coverage for `joinQueue` (e.g., unavailable doctor, invalid payload). *(pending)*
3. Introduce front-end smoke tests for the patient PWA and clinic dashboard to cover critical user flows. *(pending)*

*Progress updated: 2025-10-28*
