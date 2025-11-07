# Analytics Enablement & Admin Dashboard Plan

## 1. Context
- Branch: `feature/analytics`
- Date: 2025-11-07
- Apps touched: `clinic-dashboard`, `patient-pwa`, Firebase Functions
- Primary goals: (a) enable Firebase Analytics end to end, (b) document the original admin dashboard build plan for future reference

## 2. Firebase Analytics Implementation
### 2.1 Objectives
- Auto-init Firebase Analytics on web clients once a Measurement ID is present
- Support structured, privacy-aware event logging from UI and server
- Provide a quick validation path before every deployment

### 2.2 Client Integration
- Both dashboards expose `loadAnalytics()` in `lib/firebase.ts`
  - Handles analytics availability checks (`isSupported`), emulator gating, and singleton caching
  - Re-exports Analytics instance to the rest of the app lazily to avoid blocking SSR
- Shared helper `lib/analytics.ts` wraps `logEvent`
  - Normalizes params (string trimming, number/boolean passthrough, JSON stringify for objects)
  - Provides `anonymizeId` utility for hashing queue IDs before transmission
  - Silences failures in production while exposing console warnings in `NODE_ENV=development`
- UI components call `trackAnalyticsEvent()` for key flows (queue interactions, status toggles, etc.)

### 2.3 Server Event Logging
- Cloud Functions (`functions/src/index.ts`) exposes `recordAnalyticsEvent`
  - Accepts event name, canonical parameters, created timestamp
  - Writes into Firestore `analyticsEvents` collection with `serverTimestamp`
  - All write paths funnel through `anonymizeIdentifier` helper to keep PHI out of analytics
- Existing queue status updates now fan-out to analytics logging, keeping parity with legacy reports

### 2.4 Environment & Configuration
- Required public env vars (set in hosting platform or `.env.local` files):
  - `NEXT_PUBLIC_FIREBASE_API_KEY`
  - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
  - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
  - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
  - `NEXT_PUBLIC_FIREBASE_APP_ID`
  - `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` → `G-RRJG1S0KS4`
- Local overrides added:
  - `clinic-dashboard/.env.local`
  - `patient-pwa/.env.local`
- Emulator flag remains opt-in: `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true`
- Service credential path (for smoke tests or SSR scripts): set `GOOGLE_APPLICATION_CREDENTIALS`

### 2.5 Build & Runtime Notes
- `npm run dev --workspace clinic-dashboard` (or `patient-pwa`) for local development
- Production builds pick up the same env variables; no code changes required to enable analytics per env
- Firebase Functions share the same project ID (`waitfree-9b06e`) to guarantee data colocation

## 3. Validation & Monitoring
### 3.1 Smoke Test Script
- Command: `npm run test:analytics`
- Prerequisites: set `GOOGLE_APPLICATION_CREDENTIALS` (unless using Firestore emulator)
- Behavior: inserts `smoke_test_event` into `analyticsEvents` collection and prints the latest documents

### 3.2 DebugView Workflow (Local & Prod)
1. Ensure valid env vars are loaded (restart dev server after editing `.env.local`)
2. Open the app with the debug flag, e.g. `http://localhost:3000/?firebase_debug=1`
3. Trigger user flows; watch network tab for `collect?v=2&tid=G-RRJG1S0KS4`
4. In Firebase Console → Analytics → DebugView, select the device with the ⚡ icon to inspect events (allow ~30 seconds)

### 3.3 Firestore Audit Trail
- Collection: `analyticsEvents`
- Fields: `eventName`, `params`, `createdAt`
- Useful for cross-checking analytics during outages or when DebugView is delayed

### 3.4 Production Checklist
- Confirm hosting environment defines `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`
- Run smoke test against production project at least once per release
- Monitor DebugView immediately post-deploy, then rely on standard GA4 reports for aggregate metrics

## 4. Original Admin Dashboard Build Plan
### 4.1 Vision
Deliver a unified clinic operations panel that tracks live patient queues, doctor availability, and communications, while feeding analytics for operational reporting.

### 4.2 Phase Breakdown
1. **Foundation**
   - Migrate legacy listeners to TanStack Query driven hooks
   - Establish design tokens and reusable UI primitives (buttons, badges, cards)
   - Harden authentication and environment guards (emulator detection, anonymous sign-in toggle)

2. **Queue Operations**
   - Replace legacy `QueueList` with responsive `ImprovedQueueList`
   - Implement action menus for call/complete/cancel flows with optimistic UI states
   - Introduce auto-advance toggle and wait time visualizations

3. **Doctor Availability & Scheduling**
   - Surface doctor status controls with real-time indicators
   - Build availability management screens (as outlined in `DOCTOR_AVAILABILITY_REDESIGN.md`)
   - Sync provider updates to patient-facing PWA notifications

4. **Insights & Reporting**
   - Feed queue events into analytics (this sprint)
   - Create operational dashboards (wait time trends, conversion funnels) using GA4 + BigQuery exports
   - Add alerting hooks in Firebase Functions for SLA breaches (e.g. long wait times)

5. **Polish & Rollout**
   - Complete header/sidebar redesign for consistent navigation
   - A/B test new layouts via feature flags
   - Document rollout steps, staging validation, and monitoring backstops

### 4.3 Dependencies & Tooling
- Next.js App Router (`app/` directory)
- Firebase (Auth, Firestore, Functions, Storage, Analytics)
- TanStack Query for data orchestration
- shadcn/ui + Tailwind semantic tokens for UI consistency
- Vitest + Playwright (planned) for regression coverage

### 4.4 Outstanding TODOs
- Backfill historical analytics events for prior queues if needed
- Add automated GA4 smoke test to CI (service account via Secret Manager)
- Wire GA4 conversion events into marketing dashboards
- Continue documenting component redesigns (`HEADER_REDESIGN_SUMMARY.md`, `SIDEBAR_UPGRADE_SUMMARY.md`)

## 5. Next Steps
- Propagate measurement ID and Firebase config into production secrets
- Schedule a monitoring run post-deployment (DebugView + Firestore audit)
- Align analytics naming schema with product stakeholders before adding new events
- Update onboarding documentation once admin dashboard rollout milestones progress
