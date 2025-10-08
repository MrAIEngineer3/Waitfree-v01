# Notification System Phases

This document summarizes the evolved notification logic. Engine + Phase 1 are now ENABLED by default; flags are only used to explicitly disable for debugging.

## Overview
Two phases:
- Phase 1 (baseline telemetry + completion): Adds per-patient `service` timing fields and queue-level rolling average service time; sends a "completed" thank-you notification.
- Phase 2 (position engine): Replaces legacy staged notifications (three-away, two-away, one-away, now) with a recompute engine that emits position-based milestones (pos3, pos2, pos1, now) plus ETA minutes.

Both phases are ON by default. Environment flags only disable them when explicitly set to 0.

## Environment Flags
| Flag | Values | Default (if unset) | Effect |
|------|--------|--------------------|--------|
| `PHASE1_NOTIFICATIONS` | `0` to disable | Enabled (default) | Set to `0` only if you want to turn off service timing + completed notification.
| `NEW_NOTIFICATION_ENGINE` | `0` to disable | Enabled (default) | Set to `0` to temporarily disable position recompute engine.

## Data Model Additions (Phase 1)
Patient document (`clinics/{c}/doctors/{d}/queues/{q}/patients/{p}`):
```
service: {
  startedAt: Timestamp,           // first transition to in-progress
  completedAt: Timestamp,         // first transition to completed after started
  serviceDurationMs: number       // computed (completedAt - startedAt) once
}
notifications.completed: true     // after completion notification sent
```
Queue document:
```
metrics: {
  avgServiceMs: number,           // EMA (alpha=0.2) of serviceDurationMs
  updatedAt: Timestamp
}
```

## Engine (Phase 2) Behavior
Recompute runs after relevant status transitions. It:
1. Reads all active patients (status in {waiting, in-progress}).
2. Sorts by tokenNumber.
3. Identifies milestones relative to current serving position:
   - pos3: 3rd patient away from active service window (>=3 away)
   - pos2: 2 away
   - pos1: 1 away
   - now: patient transitioning to in-progress or currently in-progress (if not previously notified)
4. Uses `queue.metrics.avgServiceMs` for ETA calculation; falls back to 8 minutes (480000 ms) if none.
5. Writes `notifications.pos3|pos2|pos1|now` flags on each patient doc exactly once; sends matching notification.

Legacy staged notification keys (`three-away`, `two-away`, `one-away`) have been removed. Active keys now: `pos3`, `pos2`, `pos1`, `now`.

## Duplicate Suppression
- Engine is always active; legacy staged code removed.
- Engine sets its own flags so each milestone triggers once.

## Local Testing Steps
### 1. Clean Emulator State (optional)
Stop existing emulators so new env vars apply to function runtime.

### 2. Running Locally (Defaults)
Just start emulators; no env setup needed:
```
firebase emulators:start --only functions,firestore,auth
```
Then in a new shell:
```
cd functions
npm run build
node lib/scripts/phase2Test.js
```
Expected logs:
- `Notification engine recompute (default-on)`
- `Notification engine run complete` with sent > 0
- Phase1 debug lines on completion

### 3. Disabling (Debug Only)
Disable engine:
```
$env:NEW_NOTIFICATION_ENGINE="0"; firebase emulators:start --only functions,firestore,auth
```
Disable Phase1 timing:
```
$env:PHASE1_NOTIFICATIONS="0"; firebase emulators:start --only functions,firestore,auth
```

### 4. Troubleshooting
- Missing pos* flags: look for skip log (engine disabled) or ensure status transitions happened.
- No durations: verify patient moved in-progress then completed.
- ETA always fallback: complete several patients to seed avgServiceMs.

## Deployment Considerations
1. Deploy current code (engine + Phase1 always on) and monitor serviceDurationMs + avgServiceMs.
2. For emergency rollback, redeploy with one or both flags set to 0 in the runtime environment.
3. Expect only `pos3|pos2|pos1|now|completed|joined|cancelled` notification types.

## Future Enhancements
- Add batch recompute on queue pause/resume.
- Include estimated wait minutes in patient view API.
- Add patient-specific ETA recalculation when avgServiceMs shifts significantly.

---
Maintained by: Notification System Owner
Last Updated: 2025-10-02
