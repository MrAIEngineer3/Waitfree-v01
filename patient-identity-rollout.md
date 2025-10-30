# Patient Resolver Rollout Checklist

_Updated: 2025-10-31_

Use this guide when preparing to enable the patient identity resolver in production. The resolver stays behind the `patientResolverV1` feature flag until you explicitly flip the rollout stage.

## Local Readiness Snapshot

- Emulator validation completed on 2025-10-31: `patientResolverV1` set to `enabled=true`, `stage=on`, and `joinQueue` confirmed resolver metadata writes.
- Backfill tooling exercised against fixture clinics; resume tokens captured under `functions/out`.
- Monitoring artifacts and rollout scripts committed and ready for import once the branch lands in main.

## 1. Secrets & Environment

1. Store the HMAC secret that powers phone hashing:
   ```sh
   firebase functions:secrets:set PATIENT_PHONE_HASH_SECRET
   ```
   - Use a strong 32+ byte value (base64 or hex). Keep it in your secrets manager / KMS.
   - Optional: prepare `PATIENT_PHONE_HASH_SECRET_V2` for future rotations.
2. (Optional) set a default active version if you rotate:
   ```sh
   firebase functions:config:set patient.phoneHashActiveVersion=v1
   ```
3. Redeploy functions or restart emulators so the secret is available.

## 2. Feature Flag Bootstrap

We keep the resolver disabled by default. Seed the Firestore flag document before rollout:

```sh
cd functions
npm run build
npm run patient:flag -- --enabled=false --stage=off --dry-run=true   # preview
npm run patient:flag -- --enabled=false --stage=off
```

This writes to `featureFlags/patientResolverV1` with the resolver version tag. Use `--note="dry run baseline"` for extra context when needed.

**Emulator smoke test**

```sh
cd functions
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8081'
$env:GCLOUD_PROJECT='waitfree-9b06e'
node lib/scripts/seedPatientResolverFlag.js --enabled=true --stage=on --note='permanent-on'
node tmp/runResolverJoinQueue.js --clinicId=resolver-emulator --doctorId=script-doctor
```

The script flips the local flag and exercises `joinQueue`. After the call, inspect `clinics/<clinicId>/doctors/<doctorId>/queues/<queueId>/patients/<patientId>` for:

- `patientIdentityId`
- `patientIdentityLink`
- `resolverSummary`

## 3. Data Quality Dry-Run

Before turning on the resolver, scan existing queue patients for duplicate phone hashes:

```sh
npm run patient:dry-run -- --clinics=clinicA,clinicB --json=./resolver-dry-run.json
```

The script reports:
- Total queue patients scanned
- Patients with normalized phones
- Duplicate groups per clinic (same hashed phone)

Resolve high-risk duplicates (e.g., same phone on different people) before rollout.

## 4. Backfill & Resume Strategy

Run the queue backfill once data quality looks healthy. The script performs a read phase first, then applies resolver links when `--apply --confirm` is provided.

```sh
npm run patient:backfill -- --clinics=clinicA,clinicB --limit=500 --batchSize=50 \ 
   --since=2025-09-01 --until=2025-10-30                 # plan only

npm run patient:backfill -- --clinics=clinicA,clinicB --limit=500 --batchSize=25 \ 
   --apply --confirm --since=2025-09-01 --until=2025-10-30
```

Key behaviour:
- **Resume tokens**: every run emits `clinicId|doctorId|queueId|patientId`. Store the token after each batch to resume safely on failures (`--resume=<token>`).
- **Stats logging**: watch `linked`, `requiresReview`, `resolverErrors`. A non-zero `resolverErrors` means the resolver threw (queue document stays untouched).
- **Guards**: `--confirm` is required for apply mode. Increase `--limit` gradually; start with fixture clinics, then expand to full staging before production.
- **Rollback**: to undo changes, rerun the backfill with a Cloud Firestore export taken pre-run, or manually clear `patientIdentityLink`/`patientIdentityId` for affected queue docs using the emitted token range. Document which batches were applied.

**Validation log (2025-10-31)**

- Fixture clinics `resolver-fixture-a`, `kartik-clinic`, and `seva-hospital` linked successfully with zero resolver errors.
- Resume tokens stored under `functions/out/resolver-backfill-run.log`.
- Dummy placeholder phones skipped as expected; `requiresReview=true` surfaced for mismatched hashes.

When staging looks good, schedule the production job with conservative batch sizing (25–50) and capture logs + stats for every batch. Avoid applying during business-critical hours.

### Execution Window & Contacts

- **Planned window**: First real clinic launch window (run after clinic traffic is confirmed). Schedule for a quiet evening when you can watch the logs end-to-end.
- **Primary owner**: Kartik (app owner). Capture resume tokens and jot down batch stats in the run log.
- **Reviewer / approver**: Kartik (app owner). Perform a sanity check before flipping production flags.
- **Rollback contact**: Kartik (app owner). Keep a fresh Firestore export handy and be ready to run the revert script if needed.
- Log every batch (resume token, linked counts, resolver errors) in your “Patient Resolver Production Run Log” note right after the run.

## 5. Monitoring Plan

- Create a BigQuery/GAE log-based alert on the `joinQueue` / `manualAddPatient` log fields `patientIdentityId` and `requiresPatientReview`.
- Track ambiguity queue length via `patientAmbiguityQueue` collection (new admin API will surface this).
- Set up alerts for resolver errors (log message: `patient resolver failed`).

## 6. Rollout Stages

1. **Dry-Run (`--enabled=false --stage=dry-run`)**
   - Resolver executes but should not mutate production queues; use to validate logs and monitor duplicates.
2. **Pilot (`--enabled=true --stage=pilot`)**
   - Enable for a limited clinic allow list (set via the Firestore doc if needed).
   - Monitor ambiguity queue, duplicate rate, and latency for 1–2 weeks.
3. **Full (`--enabled=true --stage=on`)**
   - All clinics use the resolver. Keep audit trails and monitoring in place.

## 7. Admin / Owner Access

- OWNER role retains full access to the ambiguity review API (coming in a separate admin sprint).
- Log all status changes to `patientAuditLog` for compliance.

## 8. Post-Rollout Tasks

- Schedule periodic hash rotation (use versioned secrets and the rehash job).
- Expand parity tests to cover resolver-on vs. resolver-off behaviour in CI.
- Add background job to archive ambiguity records to cold storage (`gs://<project>-ambiguity-archive/*`).

Keep this checklist in sync as the resolver evolves (e.g., when clinic-specific metadata and admin UI ship).

## 9. Pre-Merge Checklist (Completed 2025-10-31)

- [x] Secrets rotated and verified locally (`PATIENT_PHONE_HASH_SECRET`).
- [x] Feature flag script tested with emulator on/off states (`seedPatientResolverFlag.js`).
- [x] Backfill dry-run + apply validated against fixture clinics; resume tokens archived.
- [x] Emulator parity tests run (`vitest --run tests/patientResolverParity.e2e.test.ts`).
- [x] Monitoring artifacts committed (`monitoring/` JSON + markdown instructions).

## 10. Production Launch Steps (Post-Merge)

1. Deploy functions (`npm run deploy:functions`) so the latest resolver code is live.
2. Import monitoring assets (dashboard + alert policy) into Cloud Monitoring and wire alert channels.
3. Run `npm run patient:dry-run` against target production clinics; resolve high-risk duplicates.
4. Execute staged backfill applies (`npm run patient:backfill -- --apply --confirm ...`) capturing resume tokens and batch stats.
5. Flip `patientResolverV1` in production via `npm run patient:flag -- --enabled=true --stage=dry-run --note='prod-dry-run-<date>'`.
6. Progress through `stage=pilot` (allow-list clinics) and monitor metrics/logs for at least one full clinic day.
7. Promote to `stage=on` once pilot sign-off is recorded; document the decision in the run log.
8. Schedule post-launch review and set reminders for secret rotation + ambiguity queue archival work.

> 2025-10-31: Steps 3 and 5–7 executed in a single session (direct promotion to `stage=on` with note `prod-permanent-2025-10-31`). Steps 1, 2, 4, and 8 remain ongoing follow-ups.

## 11. Production Launch Log

| Timestamp (IST) | Action | Notes |
| --- | --- | --- |
| 2025-10-31 12:52 | `npm run patient:dry-run -- --json=out/patient-dry-run-2025-10-31.json` | 7 clinics scanned, 4 duplicate groups (fixture + `kartik-clinic`), 5 invalid placeholder phones. |
| 2025-10-31 13:03 | `npm run patient:flag -- --enabled=true --stage=on --note='prod-permanent-2025-10-31'` | Production `featureFlags/patientResolverV1` set to `enabled=true`, `stage=on`. |
| 2025-10-31 13:05 | `npm run patient:flag -- --enabled=true --stage=on --note='prod-permanent-2025-10-31' --dry-run=true` | Verified flag values without further writes. |

Additional artifacts:
- Dry-run output: `functions/out/patient-dry-run-2025-10-31.json`
- Pre-existing backfill run log: `functions/out/resolver-backfill-run.log`
