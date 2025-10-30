# Patient Identity Feature Progress

_Status updated: 2025-10-31_

## Current State
- Emulator flag `patientResolverV1` remains **enabled=true**, `stage=on`, with joinQueue verification confirming resolver metadata persists end-to-end.
- Production Firestore flag flipped on 2025-10-31 to **enabled=true**, `stage=on` (note `prod-permanent-2025-10-31`).
- ULID-based patient core scaffolding, hashed phone dedupe, and resolver wiring are committed and live.
- Clinic dashboard and patient PWA successfully consume resolver metadata; legacy flows continue to function for historical entries created before the flag flip.
- Only internal fixture clinics have exercised the resolver to date; first real clinic go-live will retroactively inherit the feature.

## Completed Work
- **Patient Core Module** (`functions/src/patients/`)
  - Constants for collections, schema versions, hash versions, and retention policies.
  - ULID generator (`id.ts`), metadata normalizer (`metadata.ts`), phone hashing with HMAC + country code capture (`phoneHash.ts`).
  - Resolver implementation with Firestore transactions, ambiguity queue enqueueing, audit logging, and queue link builder (`resolver.ts`).
  - Feature flag loader backed by Firestore + env overrides (`featureFlag.ts`).
  - Ambiguity review helper (`ambiguityQueue.ts`) and admin listing util (`admin.ts`).
  - Audit log writer (`audit.ts`) and unit test for hashing (`phoneHash.test.ts`).
- **Callable Function Updates** (`functions/src/index.ts`)
  - `joinQueue` integrates resolver, stores `patientIdentityId`, resolver summary, and review flags on queue patient docs, and surfaces metadata to clients while keeping PII out of logs.
  - `manualAddPatient` mirrors resolver behaviour for staff-driven entries, logs linkage, and returns review status.
- **Shared Types** (`types/firestore.ts`) updated with `PatientIdentityLink` and resolver summary shapes for downstream tooling.
- **Client Updates**
  - Clinic dashboard manual add dialog handles resolver fields and warns on review-required cases.
  - Patient PWA join form includes optional resolver metadata in callable response typing, keeping functionality unchanged when flag is off.
- **Tooling & Docs**
  - `npm run patient:flag` script (`seedPatientResolverFlag.ts`) to view/update rollout flag with dry-run option and notes.
  - `npm run patient:dry-run` script (`patientResolverDryRun.ts`) mirrors apply safeguards (date filters, resume token hints, linked patient counts) and exports JSON summaries for validation.
    - Test fixture seeder (`npm run patient:seed-test`) with CLI options (`--primaryPhone`, `--controlPhone`, `--queueDate`, `--delete`) to create or clean up resolver validation clinics using real-format numbers.
    - Backfill tooling (`npm run patient:backfill`) enumerates clinics/queues, emits duplicate hash summaries, and now successfully links queue patients via resolver when run with `--apply --confirm` (resume token support + stats logging).
    - Rollout checklist (`patient-identity-rollout.md`) now carries the finalized runbook: resume tokens, staged batching guidance, owner contacts, and rollback playbook.
    - Monitoring checklist and artifacts (`monitoring/patient-resolver-monitoring.md`, `monitoring/patient-resolver-dashboard.json`, `monitoring/patient-resolver-alert-policy.json`) prepared for Cloud Monitoring rollout.
  - `functions/tmp/runResolverJoinQueue.js` updated with CLI overrides to exercise resolver flows against the emulator.
  - Rollout checklist (`patient-identity-rollout.md`) covering secrets, dry-run, monitoring, and stage-by-stage enablement.
  - Workspace deps updated to include `ulid`; TypeScript build verified.

## Ready Status
- Production dry-run executed on 2025-10-31 (`npm run patient:dry-run -- --json=out/patient-dry-run-2025-10-31.json`) with four duplicate groups (fixture clinics + `kartik-clinic` unlinked entry) and five invalid phone placeholders flagged for follow-up.
- Feature flag promoted directly to `stage=on` in production (`npm run patient:flag -- --enabled=true --stage=on --note='prod-permanent-2025-10-31'`).
- Resolver-on behaviour validated via emulator script and spot-checked against production queue entries post-flip.
- Backfill tooling, dry-run exports, and monitoring artifacts remain staged under version control for further clinic-by-clinic clean-up.

## Post-Launch Follow-ups
- Import monitoring dashboard and alert policies into Cloud Monitoring and wire alert channels (outstanding).
- Run targeted backfill applies for legacy queue docs that remain unlinked (e.g., `kartik-clinic` `queueId=2025-10-30`), capturing resume tokens in the production run log.
- Build the ambiguity review admin UI + clinic reports, archival jobs, and hash rotation upgrades (already tracked).
- Continue to monitor duplicate groups surfaced in `functions/out/patient-dry-run-2025-10-31.json` and rerun dry-run periodically.

## Rollout Tracking
- [x] Secrets configured (`PATIENT_PHONE_HASH_SECRET`, optional `*_V2`).
- [x] Baseline flag document written (`enabled=false`, `stage=off`).
- [x] Duplicate dry-run completed and reviewed (see `functions/out/patient-dry-run.json`).
- [x] Migration/backfill script implemented and approved (fixture + staging clinics validated; resume tokens logged in `functions/out`).
- [x] Parity tests passing locally (CI run pending once branch is pushed).
- [ ] Monitoring & alerting live (dashboard + alert import outstanding).
- [x] Pilot/pilot-equivalent sign-off (skipped; single-owner decision to go direct-to-`on`).
- [x] Post-pilot review / production `stage=on` (2025-10-31 manual flip, note `prod-permanent-2025-10-31`).

Keep this file updated alongside the rollout checklist to track engineering progress and launch readiness.
