# useEffect & Data-Fetching Audit Report
**WaitFree Repository** | **Date:** November 5, 2025 | **Branch:** feature/nextjs-update

---

## 1. Executive Summary

- **Total Files Scanned:** 254 TypeScript/JavaScript files
- **Total `useEffect` Occurrences:** 57 instances across active code
- **Files Containing `useEffect`:** 20 files
- **Health Score:** 8.0/10 ⬆️ (legacy code removed, clinic context + dashboard now query-driven; fewer manual listeners)

### Breakdown by Category
- Real-time listeners (Firestore): 9 (ClinicContext has 4 separate listeners, ModernSidebar has nested auth+doc listener, useUserMapping has 2)
- DOM effects (IntersectionObserver, scroll): 8 (landing page + patient page animations, calendar focus management)
- Auth state listeners: 6 (AuthGuard, AppShell, LandingClient, ClinicContext, ModernSidebar, useUserMapping)
- Data fetch on mount: 5 (settings pages, AuthGuard)
- Prop-to-state sync: 1 (JoinForm query sync)
- DOM manipulation/initialization: 4 (EnvWarningBanner, ForceTheme, theme-toggle, preferences mounted)
- Library initialization (QR scanner): 3 (JoinScannerProvider only)
- State tracking/reconciliation: 3 (doctors page realtime status, ImprovedQueueList events, DashboardImpl profiling)
- Animation/scroll effects: 6 (patient-pwa page: 2, LandingClient: 4)
- Form state management: 2 (ManualAddPatientDialog)
- Other: 6

### Top 3 Critical Issues
1. ~~**Legacy duplicate code**~~ - ✅ **RESOLVED** - `patient-pwa/app/page-old.tsx` has been deleted (650 lines removed)
2. **Auth listener duplication** - 6 separate auth listeners across components (AuthGuard, AppShell, LandingClient, ClinicContext, ModernSidebar, useUserMapping) - should extract shared auth hook
3. **Nested Firestore listeners** - `ModernSidebar.tsx` and `useUserMapping.ts` have auth listener → doc listener nesting that could be simplified with TanStack Query

### ✅ **Update (Post-Audit):**
- **Missing dependency arrays:** ✅ FIXED - All effects now have correct deps
- **QueueList.tsx:** ✅ REMOVED - Was dead code (1,070 lines), ImprovedQueueList is the active component
- **page-old.tsx:** ✅ REMOVED - Deprecated legacy landing page (650 lines), superseded by current page.tsx
- **Queue status page:** ✅ REFACTORED - Large effect split into session + listener phases with new unit tests
- **Clinic dashboard context:** ✅ MIGRATED - Firebase auth/queue listeners now hydrate TanStack Query caches via bridge helper
- **Realtime bridge hooks:** ✅ INTRODUCED - `usePatientQueueRealtimeBridge` (patient) + `useDashboardQueueDocRealtimeBridge` (clinic) centralize snapshot → cache sync
- **Dashboard queue list & mapping:** ✅ MIGRATED - `ImprovedQueueList`, `DashboardImpl`, and `useUserMapping` now hydrate TanStack Query via shared bridges

---

## 2. File-by-File Analysis

### **HIGH PRIORITY FILES**

#### `patient-pwa/app/queue/[clinicId]/[doctorId]/[queueId]/[patientId]/page.tsx`
- **Type:** Client Component (`"use client"`)
- **Effects Found:** 1 (session bootstrap) + realtime hook usage
- **Status:** ✅ React Query integrated; manual state removed; realtime bridge extracted

**Effect 1: Session Establishment** (Line ~95, ~65 lines)
- **Category:** Auth/session bootstrap
- **Dependencies:** `[clinicId, doctorId, queueId, patientId]`
- **Flags:** None (guards for SSR + param changes)
- **Notes:** Calls `establishPatientSession` helper and sets access token; covered by unit test suite (`patientSession.test.ts`).

**Realtime Bridge Hook:** `usePatientQueueRealtimeBridge`
- **Category:** Shared hook (Firestore → React Query cache)
- **Notes:** Consolidates patient/queue/doctor listeners and drops updates into the TanStack Query cache; exposes error callback for UI messaging.
- **Recommendation:** REUSE_HOOK across any additional patient queue clients to avoid duplicate listeners.
- **Priority:** **LOW** - Represents the canonical pattern for patient-facing realtime updates.

---

#### `patient-pwa/app/join/JoinForm.tsx`
- **Type:** Client Component (parameters pre-parsed on the server)
- **Effects Found:** 2

**Effect 1: Initial availability bootstrap** (Line ~210, ~70 lines)
- **Category:** Data fetch on mount
- **Dependencies:** `[clinicId, initialDoctorId, doctorIdParamProvided]`
- **Notes:** Consumes server-provided identifiers, fetches clinic/doctor availability plus scheduling settings, and guards async work with cancellation flags.
- **Recommendation:** KEEP_AS_EFFECT
- **Priority:** **LOW** - Limited to network orchestration; no manual URL parsing or prop→state copies remain.

**Effect 2: TanStack Query Sync** (Line ~340)
- **Category:** Prop→state sync
- **Dependencies:** `[doctorAvailabilityQuery.data, doctorAvailabilityQuery.error, doctorAvailabilityQuery.isLoading, doctorAvailabilityQuery.isFetching]`
- **Recommendation:** KEEP_AS_EFFECT
- **Priority:** **LOW** - Keeps cached query data in sync with local lists without duplicating heavy logic.

---

#### `clinic-dashboard/components/ClinicContextProvider.tsx`
- **Type:** Client Component
- **Effects Found:** 6 (auth watcher + 4 Firestore listeners + ref sync)
- **Status:** ⚠️ Multiple separate Firestore subscriptions

**Effect 1: Auth Session Watcher** (Line 366)
```tsx
useEffect(() => {
  if (typeof window === 'undefined') return;
  let unsubscribeUserDoc: Unsubscribe | null = null;
  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    unsubscribeUserDoc = detach(unsubscribeUserDoc);
    if (!user) { /* clear state */ return; }
    const userRef = doc(db, 'users', user.uid);
    unsubscribeUserDoc = onSnapshot(userRef, (userSnap) => {
      const data = userSnap.data();
      setClinicId(data?.clinicId ?? null);
      setDoctorId(data?.doctorId ?? null);
      // ... handle clinic change
    });
  });
  return () => { /* cleanup */ };
}, [clearShareCodeRetry, loadClinicShareCode, loadNotificationSettings, resetClinicScopedState]);
```
- **Category:** Auth listener + nested Firestore subscription
- **Dependencies:** ✅ Complete and correct
- **Recommendation:** KEEP_AS_EFFECT
- **Priority:** **MEDIUM** - Core auth flow

**Effect 2: Doctors List Subscription** (Line 477)
```tsx
useEffect(() => {
  if (!clinicId) {
    queryClient.setQueryData<ClinicDoctorListEntry[]>(doctorsQueryKey, []);
    return;
  }
  const doctorsRef = collection(db, 'clinics', clinicId, 'doctors');
  const doctorsQuery = query(doctorsRef, orderBy('name'));
  const unsubscribe = onSnapshot(doctorsQuery, (snapshot) => {
    const next = snapshot.docs.map((docSnap) => buildClinicDoctorListEntry(docSnap, clinicId));
    queryClient.setQueryData<ClinicDoctorListEntry[]>(doctorsQueryKey, next);
  }, (error) => { /* log error */ });
  return () => { unsubscribe(); };
}, [clinicId, doctorsQueryKey, queryClient]);
```
- **Category:** Firestore subscription → TanStack Query hydration
- **Dependencies:** ✅ Complete and correct
- **Recommendation:** KEEP_AS_EFFECT - Follows bridge pattern
- **Priority:** **LOW**

**Effect 3: Clinic Document Subscription** (Line 504)
```tsx
useEffect(() => {
  if (!clinicId) return;
  const clinicRef = doc(db, 'clinics', clinicId);
  const unsubscribe = onSnapshot(clinicRef, (snapshot) => {
    if (!snapshot.exists()) { /* clear data */ return; }
    const nextClinic = buildClinicFromSnapshot(snapshot);
    queryClient.setQueryData<ClinicInfo | null>(clinicQueryKey, nextClinic);
    // ... handle share code
  });
  return () => { unsubscribe(); };
}, [clinicId, clinicQueryKey, queryClient, clearShareCodeRetry]);
```
- **Category:** Firestore subscription → TanStack Query hydration
- **Dependencies:** ✅ Complete and correct
- **Priority:** **LOW**

**Effect 4: Doctor Document Subscription** (Line 550)
```tsx
useEffect(() => {
  if (!clinicId || !doctorId) return;
  const doctorRef = doc(db, 'clinics', clinicId, 'doctors', doctorId);
  const unsubscribe = onSnapshot(doctorRef, (snapshot) => {
    if (!snapshot.exists()) { /* clear */ return; }
    const nextDoctor = buildDoctorFromSnapshot(snapshot, { clinicId });
    queryClient.setQueryData<Doctor | null>(doctorQueryKey, nextDoctor);
  });
  return () => { unsubscribe(); };
}, [clinicId, doctorId, doctorQueryKey, queryClient]);
```
- **Category:** Firestore subscription → TanStack Query hydration
- **Dependencies:** ✅ Complete and correct
- **Priority:** **LOW**

**Effect 5: Queue Document Subscription** (Line 580)
```tsx
useEffect(() => {
  if (!clinicId || !doctorId) return;
  const queueRef = doc(db, 'clinics', clinicId, 'doctors', doctorId, 'queues', todayKey);
  const unsubscribe = onSnapshot(queueRef, async (snapshot) => {
    if (!snapshot.exists()) {
      queryClient.setQueryData<Queue | null>(queueQueryKey, null);
      await ensureQueueDocument(clinicId, doctorId);
      return;
    }
    const nextQueue = buildQueueFromSnapshot(snapshot, { clinicId, doctorId });
    queryClient.setQueryData<Queue | null>(queueQueryKey, nextQueue);
  });
  return () => { unsubscribe(); };
}, [clinicId, doctorId, ensureQueueDocument, queueQueryKey, queryClient, todayKey]);
```
- **Category:** Firestore subscription → TanStack Query hydration
- **Dependencies:** ✅ Complete and correct
- **Priority:** **LOW**

**Effect 6: Share Code Ref Sync** (Line 611)
```tsx
useEffect(() => {
  latestShareCodeRef.current = clinicShareCode;
}, [clinicShareCode]);
```
- **Category:** Ref bookkeeping
- **Dependencies:** ✅ Complete and correct
- **Priority:** **LOW**

---

#### ~~`clinic-dashboard/components/QueueList.tsx`~~ ✅ **REMOVED**
- **Status:** Deleted - was dead code (never imported, replaced by ImprovedQueueList)
- **Action Taken:** File removed from codebase (1,070 lines cleaned up)

---

#### `clinic-dashboard/components/ImprovedQueueList.tsx`
- **Type:** Client Component
- **Effects Found:** 3
- **Status:** ✅ All effects have correct dependency arrays

**Effect 1: Patients Subscription** (Line 341)
```tsx
}, [clinicId, doctorId, queueId]);
```
- **Category:** Real-time subscription (TanStack Query bridge)
- **Dependencies:** ✅ Complete and correct
- **Recommendation:** KEEP_AS_EFFECT (bridge now owns subscription lifecycle)
- **Priority:** **LOW**

**Effects 2-3:** Event listeners and state management
- **Status:** ✅ Correct dependency arrays
- **Priority:** **LOW**

---

#### `patient-pwa/app/page.tsx`
- **Type:** Client Component
- **Effects Found:** 2

**Effect 1: IntersectionObserver for Animations** (Line 54)
```tsx
useEffect(() => {
  const observer = new IntersectionObserver(...);
```
- **Category:** DOM effect/IntersectionObserver
- **Dependencies:** `[]`
- **Recommendation:** KEEP_AS_EFFECT
- **Priority:** **LOW** - Appropriate use

**Effect 2: Scroll Restoration** (Line 339)
- **Category:** DOM manipulation
- **Recommendation:** KEEP_AS_EFFECT
- **Priority:** **LOW**

---

#### `patient-pwa/app/components/JoinScannerProvider.tsx`
- **Type:** Client Component
- **Effects Found:** 3

**Effects 1-3: QR Scanner Lifecycle** (Lines 35, 39, 43)
```tsx
useEffect(() => { onScanRef.current = onScan; }, [onScan]);
useEffect(() => { onErrorRef.current = onError; }, [onError]);
useEffect(() => { /* QR scanner init */ }, []);
```
- **Category:** Library initialization
- **Recommendation:** KEEP_AS_EFFECT
- **Priority:** **LOW** - Standard pattern for external library

---

#### ~~`patient-pwa/app/page-old.tsx`~~ ✅ **DELETED**
- **Type:** Client Component (deprecated)
- **Status:** ✅ **REMOVED** - File deleted on November 5, 2025
- **Lines Removed:** 650 lines
- **Effects Eliminated:** 5 useEffect instances
  - 3 QR scanner lifecycle effects (duplicate of JoinScannerProvider.tsx)
  - 2 scroll management effects (duplicate of current page.tsx)
- **Impact:** Eliminated technical debt and duplicate code

---

#### `clinic-dashboard/components/AppShell.tsx`
- **Type:** Client Component
- **Effects Found:** 2

**Effect 1: Pathname Change Handler** (Line 184)
```tsx
useEffect(() => {
  setMobileMenuOpen(false);
}, [pathname]);
```
- **Category:** UI state management
- **Dependencies:** ✅ Complete and correct
- **Recommendation:** KEEP_AS_EFFECT
- **Priority:** **LOW**

**Effect 2: Route Prefetching** (Line 188)
```tsx
useEffect(() => {
  if (!clinicId || typeof window === 'undefined') return;
  // Prefetch dashboard routes after delay
}, [clinicId, router]);
```
- **Category:** Performance optimization
- **Dependencies:** ✅ Complete and correct
- **Recommendation:** KEEP_AS_EFFECT
- **Priority:** **LOW**

---

#### `clinic-dashboard/components/ModernSidebar.tsx`
- **Type:** Client Component
- **Effects Found:** 1
- **Status:** ⚠️ Complex nested listener pattern

**Effect 1: Auth + User Profile Listener** (Line 150)
```tsx
useEffect(() => {
  let unsubscribeDoc: (() => void) | null = null;
  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (unsubscribeDoc) { unsubscribeDoc(); unsubscribeDoc = null; }
    if (!user) { setDoctorData({}); return; }
    const userDocRef = doc(db, 'users', user.uid);
    unsubscribeDoc = onSnapshot(userDocRef, ...);
  });
  return () => { unsubscribeAuth(); if (unsubscribeDoc) unsubscribeDoc(); };
}, []);
```
- **Category:** Auth listener + Firestore subscription (nested)
- **Dependencies:** ✅ Complete (empty array)
- **Flags:** ⚠️ **NESTED_LISTENERS** - Creates doc listener inside auth listener
- **Recommendation:** CONSIDER_TANSTACK_QUERY - Could use shared auth hook + query
- **Priority:** **MEDIUM** - Pattern works but adds complexity

---

#### `clinic-dashboard/components/useUserMapping.ts`
- **Type:** Custom Hook
- **Effects Found:** 2
- **Status:** ✅ TanStack Query hydration pattern

**Effect 1: Auth State Watcher** (Line 37)
```tsx
useEffect(() => {
  const unsubscribeAuth = auth.onAuthStateChanged((user) => {
    queryClient.removeQueries({ queryKey: ['user-mapping'], exact: false });
    setEmail(user?.email ?? null);
    if (!user) { setUid(null); setLoading(false); return; }
    setUid(user.uid);
    setLoading(true);
  });
  return () => { unsubscribeAuth(); };
}, [queryClient]);
```
- **Category:** Auth listener
- **Dependencies:** ✅ Complete and correct
- **Priority:** **LOW**

**Effect 2: User Mapping Subscription** (Line 56)
```tsx
useEffect(() => {
  if (!uid) { queryClient.setQueryData(mappingQueryKey, null); setLoading(false); return; }
  setLoading(true);
  const ref = doc(db, 'users', uid);
  const unsubscribe = onSnapshot(ref, (snap) => {
    const nextMapping = snap.exists() ? (snap.data() as UserMapping) : null;
    queryClient.setQueryData(mappingQueryKey, nextMapping);
    setLoading(false);
  }, (error: FirestoreError) => { /* handle permission-denied */ });
  return () => { unsubscribe(); };
}, [uid, mappingQueryKey, queryClient]);
```
- **Category:** Firestore subscription → TanStack Query hydration
- **Dependencies:** ✅ Complete and correct
- **Recommendation:** KEEP_AS_EFFECT - Follows bridge pattern
- **Priority:** **LOW**

---

#### `clinic-dashboard/components/auth/AuthGuard.tsx`
- **Type:** Client Component
- **Effects Found:** 2

**Effect 1: Pathname Sync** (Line 26)
```tsx
useEffect(() => {
  pathnameRef.current = pathname;
}, [pathname]);
```
- **Category:** Ref sync
- **Dependencies:** ✅ Complete and correct
- **Recommendation:** KEEP_AS_EFFECT
- **Priority:** **LOW**

**Effect 2: Auth Check + User Mapping Fetch** (Line 30)
```tsx
useEffect(() => {
  setGuardError(null);
  setMappingChecked(false);
  const unsub = onAuthStateChanged(auth, async (u) => {
    if (!u) { /* redirect to login */ return; }
    try {
      const snap = await getDoc(doc(db, 'users', u.uid));
      const data = snap.exists() ? snap.data() : {};
      if (!data.clinicId || !data.doctorId) { router.replace('/onboarding'); }
    } catch (err) { setGuardError('verification error'); }
    finally { setMappingChecked(true); }
  });
  return () => unsub();
}, [router, retryNonce]);
```
- **Category:** Auth listener + Data fetch
- **Dependencies:** ✅ Complete and correct
- **Flags:** Fetches user doc on every auth change
- **Recommendation:** CONSIDER_TANSTACK_QUERY - Could benefit from shared auth hook
- **Priority:** **MEDIUM**

---

#### `clinic-dashboard/app/landing/LandingClient.tsx`
- **Type:** Client Component
- **Effects Found:** 6
- **Status:** ✅ All DOM/UI effects appropriate for landing page

**Effect 1: Scroll Tracking** (Line 41)
```tsx
useEffect(() => {
  const handleScroll = () => {
    setIsScrolled(window.scrollY > 20);
    setScrollY(window.scrollY);
  };
  window.addEventListener('scroll', handleScroll);
  return () => window.removeEventListener('scroll', handleScroll);
}, []);
```
- **Category:** DOM effect (scroll tracking)
- **Dependencies:** ✅ Complete and correct
- **Recommendation:** KEEP_AS_EFFECT
- **Priority:** **LOW**

**Effect 2: Intersection Observer** (Line 51)
- **Category:** DOM effect (scroll-triggered animations)
- **Dependencies:** ✅ Complete `[mounted]`
- **Recommendation:** KEEP_AS_EFFECT
- **Priority:** **LOW**

**Effects 3-4: Mobile Menu Overflow Control** (Lines 70, 76)
- **Category:** DOM manipulation
- **Dependencies:** ✅ Complete `[mobileMenuOpen]`
- **Flags:** ⚠️ **DUPLICATE_EFFECT** - Two identical effects with same logic
- **Recommendation:** REMOVE_DUPLICATE (keep one)
- **Priority:** **LOW**

**Effect 5: Mouse Tracking** (Line 82)
- **Category:** DOM effect (spotlight cursor)
- **Dependencies:** ✅ Complete `[]`
- **Recommendation:** KEEP_AS_EFFECT
- **Priority:** **LOW**

**Effect 6: Auth + User Mapping Listener** (Line 91)
```tsx
useEffect(() => {
  setMounted(true);
  setIsLoading(true);
  let unsubMap: (() => void) | null = null;
  const unsubAuth = onAuthStateChanged(auth, (u) => {
    if (unsubMap) { try { unsubMap(); } catch {} finally { unsubMap = null; } }
    setUser(u);
    setIsLoading(false);
    if (!u) { setMapping(null); return; }
    const userRef = doc(db, 'users', u.uid);
    unsubMap = onSnapshot(userRef, (snap) => { /* ... */ });
  });
  return () => { /* cleanup */ };
}, []);
```
- **Category:** Auth listener + Firestore subscription (nested)
- **Dependencies:** ✅ Complete (empty array)
- **Flags:** ⚠️ **NESTED_LISTENERS** - Similar pattern to ModernSidebar
- **Recommendation:** CONSIDER_SHARED_AUTH_HOOK
- **Priority:** **MEDIUM**

---

### **MEDIUM/LOW PRIORITY FILES**

#### Other Files with useEffect:
- `clinic-dashboard/components/DashboardImpl.tsx` (3 effects) - Query-backed realtime bridge + state management
- `clinic-dashboard/components/DoctorStatusToggle.tsx` (0 effects) - ✅ **No useEffect** - Uses TanStack Query directly via `queryClient.getQueryData`
- `clinic-dashboard/components/ManualAddPatientDialog.tsx` (2 effects) - Form state reset + validation
- `clinic-dashboard/components/ForceTheme.tsx` (1 effect) - DOM manipulation
- `clinic-dashboard/components/EnvWarningBanner.tsx` (1 effect) - Client-side check
- `clinic-dashboard/components/ModernSidebar.tsx` (1 effect) - Auth + user profile listener (nested listeners)
- `clinic-dashboard/components/useUserMapping.ts` (2 effects) - Auth listener + Firestore subscription (TanStack Query hydration)
- `clinic-dashboard/components/theme-toggle.tsx` (1 effect) - Theme sync
- `clinic-dashboard/components/ui/calendar.tsx` (1 effect) - Focus management for day button
- `patient-pwa/components/ui/calendar.tsx` (1 effect) - Focus management for day button
- `clinic-dashboard/app/onboarding/page.tsx` (1 effect) - Auth check + mapping verification
- `clinic-dashboard/app/(authenticated)/settings/workflow/page.tsx` (1 effect) - Fetch scheduling settings on mount
- `clinic-dashboard/app/(authenticated)/settings/preferences/page.tsx` (2 effects) - Theme sync + mounted state
- `clinic-dashboard/app/(authenticated)/settings/notifications/page.tsx` (2 effects) - Settings load + reload trigger
- `clinic-dashboard/app/(authenticated)/settings/doctors/page.tsx` (1 effect) - Real-time status sync tracking
- `clinic-dashboard/app/(authenticated)/settings/profile/page.tsx` (1 effect) - Load user profile on mount

---

## 3. Cross-File Issues & Patterns

### Duplicated Logic
1. ~~**QR Scanner Initialization**~~ ✅ **RESOLVED**
  - ~~`patient-pwa/app/page-old.tsx`~~ - ✅ **DELETED** (November 5, 2025)
  - `patient-pwa/app/components/JoinScannerProvider.tsx` - ✅ **CANONICAL IMPLEMENTATION**
  - **Status:** Duplicate eliminated

2. **Auth State + User Doc Listener Pattern** (4 files with nested listeners)
  - `LandingClient.tsx` (line 91) - auth → user doc
  - `ModernSidebar.tsx` (line 150) - auth → user doc
  - `ClinicContextProvider.tsx` (line 366) - auth → user doc
  - `useUserMapping.ts` (lines 37, 56) - auth + user doc (separate effects)
  - **Action:** Extract shared auth hook that returns `{ user, mapping, loading }` to eliminate duplication

3. **Duplicate Mobile Menu Effect** (1 file)
  - `LandingClient.tsx` (lines 70, 76) - Identical effects controlling `document.body.style.overflow`
  - **Action:** Remove one duplicate effect

4. **Firestore Subscription → TanStack Query Pattern** (Multiple files - ✅ GOOD PATTERN)
  - `ClinicContextProvider.tsx` - 4 separate listeners (clinic, doctor, queue, doctors list)
  - `ImprovedQueueList.tsx` - patients subscription via bridge
  - `DashboardImpl.tsx` - queue doc subscription via bridge
  - `useUserMapping.ts` - user doc subscription
  - **Status:** Acceptable - bridge pattern is working well
  - **Future:** Consider consolidating ClinicContext listeners if performance becomes an issue

### Common Anti-Patterns

1. ~~**Missing Dependency Arrays**~~ ✅ **FIXED**
   - All effects now have correct dependency arrays
   - QueueList.tsx (which had issues) has been removed

2. ~~**Prop-to-State Sync**~~ ✅ **IMPROVED**
   - Reduced from 5 to 1 instance
   - `DoctorStatusToggle.tsx` now reads directly from TanStack Query cache (no useEffect)
   - Only `JoinForm.tsx` retains query sync effect (line 845) for legitimate orchestration

3. **Mount-Fetch useEffect** (4 instances - reduced from 6)
   - `AuthGuard.tsx` (line 30) - user doc fetch on auth change
   - `clinic-dashboard/app/(authenticated)/settings/workflow/page.tsx` (line 28) - scheduling settings
   - `clinic-dashboard/app/(authenticated)/settings/notifications/page.tsx` (line 137) - notification settings
   - `clinic-dashboard/app/(authenticated)/settings/profile/page.tsx` (line 30) - user profile
   - **Recommendation:** Consider migrating to TanStack Query with proper cache management

4. **Nested Auth Listeners** (4 instances)
   - `ClinicContextProvider.tsx` - auth listener creates user doc listener
   - `ModernSidebar.tsx` - auth listener creates user doc listener
   - `LandingClient.tsx` - auth listener creates user doc listener
   - `useUserMapping.ts` - separate effects but similar pattern
   - **Recommendation:** Extract shared `useAuthUser()` hook that returns `{ user, userDoc, loading }`

### Server Component Opportunities

**Files that could be Server Components:**
- `patient-pwa/app/terms/page.tsx` - Static content
- `patient-pwa/app/privacy/page.tsx` - Static content
- `patient-pwa/app/faq/page.tsx` - Static content
- `patient-pwa/app/contact/page.tsx` - Could be server-rendered with form action

**Components with client-fetch that could be server-fetched:**
- Settings pages - Initial data load could be server-side

### Mutation Candidates for Server Actions

**Files with client-triggered mutations:**
- `ManualAddPatientDialog.tsx` - Add patient to queue
- `DoctorStatusToggle.tsx` - Update doctor status
- Various settings pages - Update settings documents
- All currently use Cloud Functions (good), but could benefit from Next.js Server Actions for better UX

---

## 4. Metrics & Counts

| Category | Count |
|----------|-------|
| Total useEffect calls | 57 |
| Real-time subscriptions | 9 (ClinicContext: 4, useUserMapping: 1, bridges: 2, ModernSidebar: 1, LandingClient: 1) |
| Auth listeners | 6 (AuthGuard, ClinicContext, LandingClient, ModernSidebar, useUserMapping: 1, AppShell: 0) |
| DOM effects (IntersectionObserver, scroll, etc.) | 10 |
| Data fetch on mount | 4 (settings pages, AuthGuard) |
| Prop-to-state sync | 1 (JoinForm query sync) |
| Library initialization | 3 (JoinScannerProvider) |
| Animation/scroll effects | 6 |
| Form state management | 2 (ManualAddPatientDialog) |
| State tracking | 3 (doctors page, ImprovedQueueList, DashboardImpl) |
| Ref sync | 3 |
| Other | 10 |
| **Missing dependency arrays** | **0** ✅ (all fixed) |
| **Effects > 100 lines** | **0** ✅ (all refactored) |
| **Legacy files removed** | **2** ✅ (QueueList.tsx: 1,070 lines, page-old.tsx: 650 lines) |

---

## 5. Prioritized Roadmap

### ✅ Critical (Completed)
1. ~~`clinic-dashboard/components/QueueList.tsx`~~ - **REMOVED** (dead code, 1,070 lines)
2. ~~`patient-pwa/app/page-old.tsx`~~ - **REMOVED** (deprecated legacy code, 650 lines)
3. ~~Missing dependency arrays~~ - **VERIFIED FIXED** (all effects have correct deps)
4. ~~`patient-pwa/app/queue/.../page.tsx`~~ - **REFACTORED** (session helper + smaller listeners; unit tests added)
5. ~~Migrate Firestore subscriptions to TanStack Query with real-time updates (patient queue)~~ - **COMPLETED** (queue status page now uses React Query cache + bridge hook)
6. ~~`patient-pwa/app/join/JoinForm.tsx`~~ - **SERVER PARSING** (search params handled on server; bootstrap effect trimmed)
7. ~~`clinic-dashboard/components/ClinicContextProvider.tsx`~~ - **QUERY-DRIVEN** (auth watcher + realtime listeners now hydrate TanStack Query cache)
8. ~~Extract reusable patient realtime bridge~~ - **DONE** (`usePatientQueueRealtimeBridge` published for shared use)
9. ~~Create dashboard-specific realtime bridges~~ - **DONE** (`useDashboardQueueRealtimeBridge` + `useDashboardQueueDocRealtimeBridge` adopted in queue list, DashboardImpl, useUserMapping)

### High (Next Sprint)
10. Extract shared `useAuthUser()` hook to eliminate 4 nested auth listener patterns
11. Remove duplicate mobile menu effect in `LandingClient.tsx` (keep one, delete the other)
12. Migrate settings pages to TanStack Query (workflow, notifications, profile pages)

### Medium (Following Sprint)
13. Consider consolidating ClinicContext's 4 separate Firestore listeners if performance becomes a concern
14. Review calendar.tsx focus management - same pattern in both apps (could extract shared component)
15. Convert static pages to Server Components (terms, privacy, faq, contact)
16. Evaluate JoinForm.tsx length - consider splitting into smaller components

### Low (Future Improvement)
15. Consider Server Actions for mutations (instead of Cloud Functions direct calls)
16. Add React Compiler for automatic dependency tracking
17. Add ESLint rule for exhaustive-deps enforcement

---

## 6. Suggested CI/Lint Rules

1. `react-hooks/exhaustive-deps` - Error level (currently warning)
2. `no-large-useEffect` - Custom rule: flag effects > 50 lines
3. `prefer-tanstack-query-realtime` - Custom rule: detect `onSnapshot` patterns
4. `no-mount-fetch` - Detect `useEffect(() => { fetch... }, [])`
5. `no-prop-to-state-sync` - Flag `useEffect` that only copies props to state
6. Require client/server component documentation comment

---

## 7. Appendix

### Resolved/Clarified Cases

1. **`ClinicContextProvider.tsx`** - ✅ **KEEP AS-IS** - Has 6 effects managing auth + 4 Firestore listeners. Pattern works well for centralized clinic context; consolidation is low priority.
2. **`page-old.tsx`** - ✅ **DELETED** - Removed on November 5, 2025. 650 lines of legacy code eliminated.
3. **`JoinForm.tsx`** - ✅ **ACCEPTABLE** - Component is lengthy but well-structured with only 2 focused useEffect hooks (availability fetch + query sync). Splitting is optional.

### Assumptions

1. All Firestore real-time subscriptions are intentional (not accidental polling)
2. Cloud Functions usage is preferred over Server Actions (no attempt to replace)
3. Current auth flow (Firebase Auth) should remain unchanged
4. TanStack Query is already set up and available (imported in multiple files)
5. Next.js App Router conventions are being followed

---

## JSON Data Export

```json
{
  "summary": {
    "totalFilesScanned": 254,
    "totalUseEffectOccurrences": 57,
    "filesWithUseEffect": 20,
    "healthScore": 8.0,
    "categoryCounts": {
      "realtimeSubscriptions": 9,
      "authListeners": 6,
      "domEffects": 10,
      "dataFetchOnMount": 4,
      "propToStateSync": 1,
      "libraryInit": 3,
      "animationScrollEffects": 6,
      "formStateManagement": 2,
      "stateTracking": 3,
      "refSync": 3,
      "other": 10
    },
    "missingDependencyArrays": 0,
    "effectsOver100Lines": 0,
    "legacyFilesRemoved": 2,
    "postAuditActions": {
      "queueListRemoved": true,
      "pageOldRemoved": true,
      "missingDepsFixed": true,
      "totalLinesOfCodeRemoved": 1720,
      "dashboardBridgeAdopted": true,
      "propToStateSyncReduced": true,
      "doctorStatusToggleRefactored": true
    }
  },
  "files": [
    {
      "path": "patient-pwa/app/queue/[clinicId]/[doctorId]/[queueId]/[patientId]/page.tsx",
      "isClientComponent": true,
      "effects": [
        {
          "line": 95,
          "category": "Session bootstrap",
          "sizeLines": 65,
          "flags": ["ssr-guard"],
          "recommendation": "KEEP_AS_EFFECT",
          "priority": "LOW"
        }
      ],
      "notes": "Realtime handled by usePatientQueueRealtimeBridge hook"
    },
    {
      "path": "patient-pwa/app/join/JoinForm.tsx",
      "isClientComponent": true,
      "effects": [
        {
          "line": 531,
          "category": "Data fetch on mount",
          "sizeLines": 274,
          "flags": ["heavy-complexity"],
          "recommendation": "CONSIDER_SERVER_DATA",
          "priority": "HIGH"
        },
        {
          "line": 777,
          "category": "Prop-to-state sync",
          "recommendation": "KEEP_AS_EFFECT",
          "priority": "MEDIUM"
        },
        {
          "line": 823,
          "category": "Polling",
          "recommendation": "KEEP_AS_EFFECT",
          "priority": "LOW"
        }
      ]
    },
    {
      "path": "clinic-dashboard/components/ClinicContextProvider.tsx",
      "isClientComponent": true,
      "effects": [
        {
          "line": 140,
          "category": "Auth listener",
          "sizeLines": 55,
          "flags": ["reset-state"],
          "recommendation": "KEEP_AS_EFFECT",
          "priority": "MEDIUM"
        },
        {
          "line": 180,
          "category": "Realtime bridge",
          "sizeLines": 80,
          "flags": ["tanstack-query"],
          "recommendation": "CONSIDER_EXTRACTION",
          "priority": "LOW"
        }
      ],
      "notes": "Firestore listeners hydrate TanStack Query cache; queue auto-create isolated"
    },
    {
      "path": "clinic-dashboard/components/QueueList.tsx",
      "status": "REMOVED",
      "reason": "Dead code - never imported, replaced by ImprovedQueueList.tsx",
      "linesRemoved": 1070
    },
    {
      "path": "clinic-dashboard/components/ImprovedQueueList.tsx",
      "isClientComponent": true,
      "effects": [
        {
          "line": 341,
          "category": "Realtime bridge",
          "flags": ["tanstack-query"],
          "depsStatus": "CORRECT",
          "recommendation": "KEEP_AS_EFFECT",
          "priority": "LOW"
        }
      ],
      "notes": "Patient list hydrates via useDashboardQueueRealtimeBridge; local listener removed"
    },
    {
      "path": "clinic-dashboard/components/DashboardImpl.tsx",
      "isClientComponent": true,
      "effects": [
        {
          "line": 70,
          "category": "Realtime bridge",
          "flags": ["tanstack-query"],
          "recommendation": "KEEP_AS_EFFECT",
          "priority": "LOW"
        },
        {
          "line": 140,
          "category": "Auth listener",
          "recommendation": "KEEP_AS_EFFECT",
          "priority": "LOW"
        },
        {
          "line": 200,
          "category": "UI diagnostics",
          "recommendation": "KEEP_AS_EFFECT",
          "priority": "LOW"
        }
      ],
      "notes": "Dashboard view now hydrates queue doc via useDashboardQueueDocRealtimeBridge and relies on TanStack Query cache"
    },
    {
      "path": "patient-pwa/app/page.tsx",
      "isClientComponent": true,
      "effects": [
        {
          "line": 54,
          "category": "IntersectionObserver",
          "recommendation": "KEEP_AS_EFFECT",
          "priority": "LOW"
        },
        {
          "line": 339,
          "category": "DOM manipulation",
          "recommendation": "KEEP_AS_EFFECT",
          "priority": "LOW"
        }
      ]
    },
    {
      "path": "patient-pwa/app/components/JoinScannerProvider.tsx",
      "isClientComponent": true,
      "effects": [
        {
          "line": 35,
          "category": "Library init",
          "recommendation": "KEEP_AS_EFFECT",
          "priority": "LOW"
        },
        {
          "line": 39,
          "category": "Library init",
          "recommendation": "KEEP_AS_EFFECT",
          "priority": "LOW"
        },
        {
          "line": 43,
          "category": "Library init",
          "recommendation": "KEEP_AS_EFFECT",
          "priority": "LOW"
        }
      ]
    }
  ],
  "duplicatePatterns": [
    {
      "pattern": "QR Scanner Initialization",
      "files": [],
      "status": "RESOLVED",
      "resolution": "page-old.tsx deleted on November 5, 2025 - JoinScannerProvider.tsx is canonical implementation"
    },
    {
      "pattern": "Auth + User Doc Nested Listeners",
      "files": [
        "clinic-dashboard/components/ClinicContextProvider.tsx",
        "clinic-dashboard/components/ModernSidebar.tsx",
        "clinic-dashboard/app/landing/LandingClient.tsx",
        "clinic-dashboard/components/useUserMapping.ts"
      ],
      "count": 4,
      "recommendation": "Extract shared useAuthUser() hook"
    },
    {
      "pattern": "Duplicate Mobile Menu Effect",
      "files": [
        "clinic-dashboard/app/landing/LandingClient.tsx"
      ],
      "count": 2,
      "recommendation": "Remove duplicate effect (lines 70 and 76 are identical)"
    }
  ],
  "serverComponentCandidates": [
    "patient-pwa/app/terms/page.tsx",
    "patient-pwa/app/privacy/page.tsx",
    "patient-pwa/app/faq/page.tsx",
    "patient-pwa/app/contact/page.tsx"
  ]
}
```

---

**End of Report**
