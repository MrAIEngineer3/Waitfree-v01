# Patient Identity Resolver – Staging Sign-off

_Date: 2025-10-30_

## Scope
- Environment: local Firebase emulators / staging Firestore project with **test fixture clinics only**.
- Clinics covered:
  - `resolver-test-clinic` (fixture seeded via `npm run patient:seed-test`)
  - `kartik-clinic` (manual test clinic)
  - `seva-hospital` (manual test clinic)
- No production clinics have onboarded yet; all data represents developer-generated fixtures.

## Backfill Runs

| Clinic | Command | Result Summary | Resume Token |
| --- | --- | --- | --- |
| resolver-test-clinic | `npm run patient:backfill -- --clinicIds=resolver-test-clinic --limit=10 --batchSize=1 --apply --confirm` | 3 processed, 3 linked, 0 resolver errors, 0 skipped (post phone-hash timestamp fix) | `resolver-test-clinic\|resolver-test-doctor\|2025-10-29-test\|test-patient-3` |
| kartik-clinic | `npm run patient:backfill -- --clinicIds=kartik-clinic --limit=100 --batchSize=10 --apply --confirm` | 5 processed, 4 linked, 1 skipped invalid placeholder phone, 0 resolver errors | `kartik-clinic\|dr-kartik-soni\|2025-10-19\|z4oePUuoDIama9gNXl3R` |
| seva-hospital | `npm run patient:backfill -- --clinicIds=seva-hospital --limit=100 --batchSize=10 --apply --confirm` | 6 processed, 6 linked, 0 resolver errors | `seva-hospital\|kartik-soni\|2025-10-19\|HOmQrpkGGqLymNfzjP63` |

Additional plan-only sweep (`npm run patient:backfill -- --limit=200 --batchSize=25`) scanned 6 clinics/25 queues, producing 3 duplicate hash groups and 5 invalid phone warnings (all placeholder numbers).

## Observations
- Timestamp adjustment (`Timestamp.now()` for phone hash entries) resolved Firestore constraint errors; all applies complete successfully.
- Placeholder numbers such as `1111111111` and `123456789` continue to fail normalization and are skipped with `skippedInvalidPhone` increments.
- No resolver exceptions occurred during final staging runs; `resolverErrors` remained 0.
- Duplicate groups surfaced only within fixture clinics using shared test numbers.

## Next Steps Before Production
1. Populate execution window, owner, and rollback contact in `patient-identity-rollout.md` once real clinics are ready.
2. Capture Firestore export prior to the production backfill for rollback safety.
3. Ensure monitoring dashboards and parity tests are in place before enabling the `patientResolverV1` flag for real clinics.

_Approved by:_ `TBD`
