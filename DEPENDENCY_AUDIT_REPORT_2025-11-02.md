# Dependency Audit Report
**Date:** November 2, 2025  
**Project:** WaitFree Queue Management System  
**Branch:** feature/react-query

---

## Executive Summary

This audit examined all dependencies, SDK versions, Node.js version, and security vulnerabilities across the monorepo workspace. The project is generally well-maintained with mostly recent versions, but there are several update opportunities and one security vulnerability to address.

### Overall Status
- ✅ **Node.js Version:** Up to date (v22.18.0)
- ✅ **npm Version:** Up to date (v11.5.2)
- ✅ **Firebase CLI:** Up to date (v14.17.0)
- ⚠️ **Dependencies:** Multiple minor/patch updates available
- ⚠️ **Security:** 1 moderate vulnerability detected
- ⚠️ **Major Version Updates:** Next.js 16, React 19.2, Firebase SDKs have major updates available

---

## 1. Runtime Environment

### Node.js
- **Current Version:** v22.18.0 ✅
- **Latest LTS:** v22.x (Current)
- **Status:** Up to date, using latest stable major version
- **Firebase Functions Runtime:** nodejs22 ✅ (matches local environment)
- **Functions Engine Requirement:** `>=20 <23` ✅ (compatible)

### npm
- **Current Version:** 11.5.2 ✅
- **Status:** Up to date

### Firebase CLI
- **Current Version:** 14.17.0 ✅
- **Status:** Up to date

---

## 2. Core Framework Dependencies

### Next.js (clinic-dashboard & patient-pwa)
- **Current:** 15.5.3
- **Latest:** 16.0.1 ⚠️
- **Impact:** Major version update available
- **Breaking Changes:** Yes (v16 is a major release)
- **Recommendation:** Review Next.js 16 migration guide before upgrading. This is a major version with potential breaking changes.

### React & React-DOM (both apps)
- **Current:** 19.1.0
- **Wanted:** 19.1.0
- **Latest:** 19.2.0 ⚠️
- **Impact:** Minor version update
- **Recommendation:** Update to 19.2.0 - likely non-breaking patch/minor release

### TypeScript (all packages)
- **Current:** 5.9.2
- **Wanted:** 5.9.3
- **Latest:** 5.9.3 ⚠️
- **Impact:** Patch update
- **Recommendation:** Safe to update

---

## 3. Firebase SDK Versions

### Firebase Client SDK
- **Current (clinic-dashboard & patient-pwa):** 12.3.0
- **Current (functions devDep):** 11.10.0 ⚠️
- **Root package:** 12.3.0
- **Wanted:** 12.5.0
- **Latest:** 12.5.0 ⚠️
- **Impact:** Minor version updates available
- **Recommendation:** Update to 12.5.0 across all packages. Functions package has older v11, consider aligning to v12.

### firebase-admin (functions)
- **Current:** 12.7.0
- **Root specifies:** ^13.5.0 ⚠️
- **Latest:** 13.5.0 ⚠️
- **Impact:** Major version discrepancy
- **Issue:** Functions package uses v12, but root package.json specifies v13
- **Recommendation:** Update functions to firebase-admin v13 - this is a significant update

### firebase-functions (functions)
- **Current:** 6.5.0
- **Wanted:** 6.6.0
- **Latest:** 6.6.0 ⚠️
- **Impact:** Patch update
- **Recommendation:** Update to 6.6.0

---

## 4. State Management & Data Fetching

### TanStack Query (React Query)
- **Current (@tanstack/react-query):** 5.90.6 ✅
- **Latest:** 5.90.6 ✅
- **Current (@tanstack/react-query-devtools):** 5.90.2 ⚠️
- **Status:** Query is up to date, devtools could be newer
- **Recommendation:** Consider updating devtools to match query version

---

## 5. UI Component Libraries (Radix UI)

All Radix UI components are on recent versions:
- ✅ @radix-ui/react-alert-dialog: 1.1.15
- ✅ @radix-ui/react-avatar: 1.1.10
- ✅ @radix-ui/react-dialog: 1.1.15
- ✅ @radix-ui/react-dropdown-menu: 2.1.16
- ✅ @radix-ui/react-icons: 1.3.2
- ✅ @radix-ui/react-label: 2.1.7
- ✅ @radix-ui/react-popover: 1.1.15
- ✅ @radix-ui/react-scroll-area: 1.2.10
- ✅ @radix-ui/react-select: 2.2.6
- ✅ @radix-ui/react-separator: 1.1.7
- ✅ @radix-ui/react-slot: 1.2.3
- ✅ @radix-ui/react-switch: 1.2.6
- ✅ @radix-ui/react-tabs: 1.1.13
- ✅ @radix-ui/react-tooltip: 1.2.8
- ✅ @radix-ui/react-visually-hidden: 1.2.3

**Status:** All up to date ✅

---

## 6. Styling & CSS

### Tailwind CSS
- **Current:** 4.1.13
- **Wanted:** 4.1.16
- **Latest:** 4.1.16 ⚠️
- **Impact:** Patch update
- **Recommendation:** Update to 4.1.16

### @tailwindcss/postcss
- **Current:** 4.1.13
- **Wanted:** 4.1.16
- **Latest:** 4.1.16 ⚠️
- **Impact:** Patch update
- **Recommendation:** Update to 4.1.16

### lightningcss-win32-x64-msvc (optional)
- **Current:** 1.30.1
- **Wanted:** 1.30.2
- **Latest:** 1.30.2 ⚠️
- **Impact:** Patch update
- **Recommendation:** Update to 1.30.2

### lucide-react
- **Current:** 0.546.0
- **Latest:** 0.552.0 ⚠️
- **Impact:** Patch updates (6 minor versions behind)
- **Recommendation:** Update to 0.552.0

---

## 7. Google Cloud SDKs (Functions)

### @google-cloud/firestore
- **Current:** 7.11.5
- **Wanted:** 7.11.6
- **Latest:** 8.0.0 ⚠️
- **Impact:** Major version available
- **Recommendation:** Update to 7.11.6 first, evaluate v8 migration separately

### @google-cloud/secret-manager
- **Current:** 5.6.0
- **Latest:** 6.1.1 ⚠️
- **Impact:** Major version update available
- **Recommendation:** Evaluate v6 breaking changes before upgrading

---

## 8. Development Tools

### ESLint
- **Current:** 9.36.0
- **Wanted:** 9.39.0
- **Latest:** 9.39.0 ⚠️
- **Impact:** Patch updates
- **Recommendation:** Update to 9.39.0

### @eslint/js
- **Current:** 9.36.0
- **Wanted:** 9.39.0
- **Latest:** 9.39.0 ⚠️
- **Recommendation:** Update to 9.39.0 (keep in sync with eslint)

### eslint-config-next
- **Current:** 15.5.3
- **Latest:** 16.0.1 ⚠️
- **Impact:** Tied to Next.js version
- **Recommendation:** Update when upgrading to Next.js 16

### @typescript-eslint packages
- **Current:** 8.46.1
- **Wanted:** 8.46.2
- **Latest:** 8.46.2 ⚠️
- **Impact:** Patch update
- **Recommendation:** Update to 8.46.2

### Prettier
- **Current:** 3.6.2 ✅
- **Status:** Up to date

### prettier-plugin-tailwindcss
- **Current:** 0.6.14
- **Latest:** 0.7.1 ⚠️
- **Impact:** Minor version update
- **Recommendation:** Update to 0.7.1

---

## 9. Type Definitions

### @types/node
- **Current:** 20.19.17
- **Wanted:** 20.19.24
- **Latest:** 24.9.2 ⚠️
- **Impact:** Major version available (Node 24 types)
- **Status:** Current types match Node.js 20, which is correct for your runtime
- **Recommendation:** Update to 20.19.24. Don't upgrade to v24 types until Node.js 24 is needed

### @types/react
- **Current:** 19.1.13
- **Wanted:** 19.2.2
- **Latest:** 19.2.2 ⚠️
- **Impact:** Minor update
- **Recommendation:** Update to 19.2.2

### @types/react-dom
- **Current:** 19.1.9
- **Wanted:** 19.2.2
- **Latest:** 19.2.2 ⚠️
- **Impact:** Minor update
- **Recommendation:** Update to 19.2.2

---

## 10. Third-Party Service SDKs

### Twilio
- **Current:** 5.10.2
- **Wanted:** 5.10.4
- **Latest:** 5.10.4 ⚠️
- **Impact:** Patch update
- **Recommendation:** Update to 5.10.4

### google-libphonenumber
- **Current:** 3.2.43 ✅
- **Status:** Up to date

---

## 11. Utility Libraries

### date-fns
- **Current:** 4.1.0 ✅
- **Status:** Up to date

### luxon
- **Current:** 3.7.2 ✅
- **Status:** Up to date

### ulid
- **Current:** 2.4.0
- **Latest:** 3.0.1 ⚠️
- **Impact:** Major version update
- **Recommendation:** Evaluate v3 breaking changes

### dotenv
- **Current:** 16.6.1
- **Latest:** 17.2.3 ⚠️
- **Impact:** Major version update
- **Recommendation:** Evaluate v17 breaking changes

### node-fetch
- **Current:** 2.7.0
- **Latest:** 3.3.2 ⚠️
- **Impact:** Major version update (ESM only in v3)
- **Warning:** v3 is ESM-only, may require code changes
- **Recommendation:** Stay on v2 unless ESM migration is planned

### rimraf
- **Current:** 5.0.10
- **Latest:** 6.1.0 ⚠️
- **Impact:** Major version update
- **Recommendation:** Evaluate v6 breaking changes

### globals
- **Current:** 14.0.0
- **Latest:** 16.5.0 ⚠️
- **Impact:** Major version updates available
- **Recommendation:** Evaluate v15/v16 breaking changes

---

## 12. Testing

### Vitest
- **Current:** 4.0.4
- **Wanted:** 4.0.6
- **Latest:** 4.0.6 ⚠️
- **Impact:** Patch update
- **Recommendation:** Update to 4.0.6

---

## 13. Security Vulnerabilities

### npm audit Results
```
Severity: MODERATE (1 vulnerability)
Package: tar
Version: 7.5.1
Issue: Race condition leading to uninitialized memory exposure
GHSA: GHSA-29xp-372q-xqph
CWE: CWE-362
```

**Status:** ⚠️ Fix available  
**Impact:** Moderate severity - indirect dependency  
**Recommendation:** Run `npm audit fix` to update the vulnerable package

### Additional Security Notes
- No critical or high severity vulnerabilities detected ✅
- Total dependencies: 964 (397 prod, 521 dev, 132 optional)
- Regular security audits recommended

---

## 14. Configuration & Tooling

### TypeScript Configuration
- **clinic-dashboard:** Target ES2017, module esnext, bundler resolution ✅
- **patient-pwa:** Same as clinic-dashboard ✅
- **functions:** Target ES2020, module commonjs, node resolution ✅
- **Status:** Appropriate for each package type

### Package Manager
- Using npm workspaces ✅
- Proper workspace structure with 3 packages ✅

### Overrides in Root package.json
```json
"overrides": {
  "esbuild": "^0.25.1",
  "vite": { "esbuild": "^0.25.1" },
  "vitest": { "esbuild": "^0.25.1" },
  "@vitest/mocker": { "esbuild": "^0.25.1" },
  "vite-node": { "esbuild": "^0.25.1" }
}
```
**Status:** Forcing consistent esbuild version ✅

---

## 15. Missing Configuration Files

### Node Version Management
- ❌ No `.nvmrc` file
- ❌ No `.node-version` file
- **Recommendation:** Create `.nvmrc` with content `22.18.0` to ensure team consistency

---

## 16. Recommendations Summary

### Priority 1 - Security & Critical (Immediate)
1. ✅ **Run `npm audit fix`** to patch tar vulnerability
2. ⚠️ **Update firebase-admin** in functions from v12 to v13 (align with root package)
3. ⚠️ **Create `.nvmrc` file** with Node.js version specification

### Priority 2 - Important Updates (This Sprint)
1. Update Firebase SDKs to latest minor versions (12.5.0)
2. Update TypeScript to 5.9.3
3. Update ESLint packages to 9.39.0
4. Update Tailwind CSS to 4.1.16
5. Update @types/node to 20.19.24
6. Update @types/react and @types/react-dom to 19.2.2
7. Update Twilio to 5.10.4
8. Update Vitest to 4.0.6
9. Update firebase-functions to 6.6.0

### Priority 3 - Major Version Updates (Evaluate Separately)
1. **Next.js 15 → 16** - Major update, review migration guide
2. **React 19.1 → 19.2** - Minor update, should be safe
3. **@google-cloud/firestore 7 → 8** - Major update, review breaking changes
4. **@google-cloud/secret-manager 5 → 6** - Major update, review breaking changes
5. **eslint-config-next 15 → 16** - Tied to Next.js upgrade
6. **lucide-react** - Update to 0.552.0 (6 minor versions behind)
7. **prettier-plugin-tailwindcss 0.6 → 0.7** - Minor version update

### Priority 4 - Consider Later (Breaking Changes)
1. **ulid 2 → 3** - Major update, evaluate impact
2. **dotenv 16 → 17** - Major update, evaluate impact
3. **rimraf 5 → 6** - Major update, evaluate impact
4. **globals 14 → 16** - Major updates, evaluate impact
5. **node-fetch 2 → 3** - Requires ESM migration
6. **@types/node 20 → 24** - Only when upgrading Node.js runtime

---

## 17. Update Commands

### Safe Updates (Minor/Patch)
```bash
# Update TypeScript
npm install typescript@5.9.3 --workspace=clinic-dashboard --workspace=patient-pwa --workspace=functions

# Update Firebase SDKs
npm install firebase@12.5.0 --workspace=clinic-dashboard --workspace=patient-pwa
npm install firebase-functions@6.6.0 --workspace=functions

# Update ESLint
npm install eslint@9.39.0 @eslint/js@9.39.0 --workspace=clinic-dashboard --workspace=patient-pwa --workspace=functions

# Update TypeScript ESLint
npm install @typescript-eslint/eslint-plugin@8.46.2 @typescript-eslint/parser@8.46.2 --workspace=functions

# Update Tailwind
npm install tailwindcss@4.1.16 @tailwindcss/postcss@4.1.16 --workspace=clinic-dashboard --workspace=patient-pwa

# Update types
npm install @types/node@20.19.24 --workspace=clinic-dashboard --workspace=patient-pwa --workspace=functions
npm install @types/react@19.2.2 @types/react-dom@19.2.2 --workspace=clinic-dashboard --workspace=patient-pwa

# Update Twilio
npm install twilio@5.10.4 --workspace=functions

# Update Vitest
npm install vitest@4.0.6 --workspace=functions

# Update lucide-react
npm install lucide-react@0.552.0 --workspace=clinic-dashboard --workspace=patient-pwa

# Update lightningcss
npm install lightningcss-win32-x64-msvc@1.30.2 --save-optional --workspace=clinic-dashboard --workspace=patient-pwa

# Update React
npm install react@19.2.0 react-dom@19.2.0 --workspace=clinic-dashboard --workspace=patient-pwa

# Security fix
npm audit fix
```

### Critical Update (firebase-admin)
```bash
# Update firebase-admin to v13 (breaking changes possible)
npm install firebase-admin@13.5.0 --workspace=functions
# Then test all cloud functions thoroughly
```

### Create .nvmrc
```bash
echo "22.18.0" > .nvmrc
```

---

## 18. Testing Checklist After Updates

- [ ] Run `npm install` to ensure clean installation
- [ ] Run `npm run build` for all workspaces
- [ ] Test Firebase Functions locally with emulators
- [ ] Run test suites (`npm test`)
- [ ] Test clinic-dashboard in development mode
- [ ] Test patient-pwa in development mode
- [ ] Verify Firebase deployments work
- [ ] Check for TypeScript compilation errors
- [ ] Review ESLint output for new warnings
- [ ] Test in production-like environment before deploying

---

## 19. Maintenance Recommendations

1. **Establish Regular Update Cadence**
   - Monthly: Patch/minor updates
   - Quarterly: Evaluate major updates
   - Continuous: Security patches

2. **Automated Dependency Checking**
   - Consider using Dependabot or Renovate Bot
   - Set up automated security alerts

3. **Version Pinning Strategy**
   - Current: Using `^` (caret) for most packages ✅
   - Consider exact versions for critical packages

4. **Documentation**
   - Document breaking changes in CHANGELOG
   - Maintain upgrade notes for major versions

---

## Conclusion

The WaitFree project maintains a modern tech stack with generally up-to-date dependencies. The main areas requiring attention are:

1. **Security:** One moderate vulnerability needs patching
2. **Firebase Admin SDK:** Version discrepancy between packages needs resolution
3. **Node Version Management:** Missing .nvmrc file
4. **Regular Updates:** Several minor/patch updates available

The project is in good health overall, with most critical dependencies on recent stable versions. The suggested updates are primarily maintenance-focused with the exception of the firebase-admin major version update which requires careful testing.

**Next Steps:** Address Priority 1 and 2 items, then plan for major version updates in a dedicated sprint with proper testing.
