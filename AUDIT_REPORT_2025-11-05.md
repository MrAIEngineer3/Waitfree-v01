# Next.js App Router Audit Report

## Executive Summary

This audit of the Waitfree project's `clinic-dashboard` and `patient-pwa` applications reveals a modern tech stack with Next.js 15, React 19, and TanStack Query 5. However, there are significant opportunities to improve performance and align with Next.js App Router best practices. The most critical issues are the underutilization of Server Components for data fetching and rendering static content, leading to larger client bundles and slower initial page loads. Additionally, the project is not using TanStack Query's SSR/hydration features, resulting in unnecessary client-side data fetching and loading states.

## Project Facts

*   **Frameworks:**
    *   Next.js: `15.5.3`
    *   React: `19.2.0`
    *   TypeScript: `5.9.3`
*   **Key Libraries:**
    *   TanStack Query: `5.90.6`
    *   Firebase: `12.5.0`
    *   Tailwind CSS: `4.1.16`
    *   shadcn/ui (various components)
*   **Code Size:**
    *   The project is split into two main applications, `clinic-dashboard` and `patient-pwa`, with a shared `functions` directory. The total size of the codebase is not excessively large, but there are opportunities for optimization.
*   **Build Size:**
    *   Build artifacts were not available for analysis. It is recommended to run `npm run build` and `npx next-bundle-analyzer` in both `clinic-dashboard` and `patient-pwa` to analyze bundle sizes.

## Top Findings

### 1. (High Severity) Data Fetching in Client Components

*   **Short description:** The `clinic-dashboard`'s `DashboardImpl.tsx` component is a large Client Component that fetches data using TanStack Query. While this is a valid approach, the initial data could be fetched in a Server Component and passed down as props, reducing client-side work and improving initial page load performance.
*   **Exact file path(s) and line ranges or symbols:**
    *   `clinic-dashboard/components/DashboardImpl.tsx`
*   **Likely root cause:** The application was likely developed with a client-centric approach, without fully leveraging the benefits of the App Router's Server Component model.
*   **Official best practice(s) and senior-dev recommendations (with citations and dates):**
    *   **Next.js Docs: "Server Components"** ([https://nextjs.org/docs/app/building-your-application/rendering/server-components](https://nextjs.org/docs/app/building-your-application/rendering/server-components)): "Server Components allow you to write UI that's rendered and optionally cached on the server. ... This allows you to keep large dependencies that previously would impact the client-side JavaScript bundle size on the server, leading to improved performance."
*   **One-line fix or small patch sketch:**
    *   Refactor `DashboardImpl.tsx` to receive its initial data as props from a parent Server Component. The Server Component would fetch the initial queue state and pass it to the client component.
*   **Tests or verification steps:**
    *   After refactoring, verify that the dashboard still functions correctly.
    *   Use the browser's developer tools to confirm that the initial data is present in the HTML response and that there are fewer client-side data fetching requests on initial load.
*   **Estimated effort:** Medium

### 2. (High Severity) Large Client Components with Static Content

*   **Short description:** The `patient-pwa`'s landing page (`patient-pwa/app/page.tsx`) is a large Client Component that includes a significant amount of static content. This unnecessarily increases the client-side JavaScript bundle size.
*   **Exact file path(s) and line ranges or symbols:**
    *   `patient-pwa/app/page.tsx`
*   **Likely root cause:** The page was likely created as a single component for simplicity, without considering the performance implications of including static content in a Client Component.
*   **Official best practice(s) and senior-dev recommendations (with citations and dates):**
    *   **Next.js Docs: "Client Components"** ([https://nextjs.org/docs/app/building-your-application/rendering/client-components](https://nextjs.org/docs/app/building-your-application/rendering/client-components)): "To keep your client-side JavaScript bundle size small, we recommend moving Client Components to the leaves of your component tree where possible."
*   **One-line fix or small patch sketch:**
    *   Break down the `LandingPage` component into smaller components. Convert the static sections (`HeroSection`, `PhoneMockupSection`, `FeaturesSection`, `HowItWorksSection`, `CtaSection`) into Server Components and import them into the main `page.tsx` file.
*   **Tests or verification steps:**
    *   Verify that the landing page still renders correctly.
    *   Analyze the bundle size before and after the change to confirm a reduction in the client-side JavaScript bundle.
*   **Estimated effort:** Medium

### 3. (Medium Severity) Lack of TanStack Query SSR/Hydration

*   **Short description:** The project is not using TanStack Query's SSR or hydration features. This means that for any data fetched with TanStack Query, the user will see a loading state on the initial page load.
*   **Exact file path(s) and line ranges or symbols:**
    *   `clinic-dashboard/lib/react-query.tsx`
    *   `patient-pwa/lib/react-query.tsx`
*   **Likely root cause:** The TanStack Query setup is basic and does not include the necessary configuration for SSR.
*   **Official best practice(s) and senior-dev recommendations (with citations and dates):**
    *   **TanStack Query Docs: "SSR and Next.js"** ([https://tanstack.com/query/v5/docs/react/guides/ssr](https://tanstack.com/query/v5/docs/react/guides/ssr)): "Prefetching data on the server and passing it down to the client is a common pattern for server-side rendering. This allows the client to have the data available immediately on page load, without having to fetch it again."
*   **One-line fix or small patch sketch:**
    *   Implement the `Hydrate` component and `dehydrate` function from TanStack Query to pass server-fetched data to the client. This involves fetching data in Server Components, dehydrating the query client, and rehydrating it on the client.
*   **Tests or verification steps:**
    *   Verify that data is being pre-fetched on the server and that there are no loading states on initial page load for data fetched with TanStack Query.
*   **Estimated effort:** Large

### 4. (Low Severity) Redundant Network Calls in Effects

*   **Short description:** In `DashboardImpl.tsx`, the `onAuthStateChanged` listener is set up in a `useEffect` hook with a dependency array that causes it to be re-created unnecessarily.
*   **Exact file path(s) and line ranges or symbols:**
    *   `clinic-dashboard/components/DashboardImpl.tsx` (the `useEffect` with `onAuthStateChanged`)
*   **Likely root cause:** A misunderstanding of the `useEffect` dependency array.
*   **Official best practice(s) and senior-dev recommendations (with citations and dates):**
    *   **React Docs: "useEffect"** ([https://react.dev/reference/react/useEffect](https://react.dev/reference/react/useEffect)): "If you want to run an effect only once, when the component mounts, pass an empty array (`[]`) as the second argument."
*   **One-line fix or small patch sketch:**
    *   Change the dependency array of the `useEffect` that sets up the `onAuthStateChanged` listener to an empty array (`[]`).
*   **Tests or verification steps:**
    *   Verify that authentication still works as expected.
*   **Estimated effort:** Small

## Prioritized Improvement Plan

1.  **Immediate:**
    *   Fix the redundant network calls in `DashboardImpl.tsx` by changing the `useEffect` dependency array to `[]`. (Effort: Small)
2.  **Short-term:**
    *   Refactor the `patient-pwa` landing page to use Server Components for static content. (Effort: Medium)
    *   Refactor `DashboardImpl.tsx` to receive its initial data as props from a Server Component. (Effort: Medium)
3.  **Long-term:**
    *   Implement TanStack Query SSR/hydration to improve the initial loading experience for all data-driven pages. (Effort: Large)

## Suggested Telemetry and Reproduction

*   **Bundle Size:**
    *   Run `npm run build` and `npx next-bundle-analyzer` in both `clinic-dashboard` and `patient-pwa` to get a baseline of the bundle sizes.
*   **Performance Metrics:**
    *   Use the browser's developer tools (Lighthouse and Performance tabs) to measure metrics like First Contentful Paint (FCP), Largest Contentful Paint (LCP), and Time to Interactive (TTI) before and after implementing the suggested changes.

## PR Checklist and Rollback/Feature-Flag Suggestions

*   **PR Checklist:**
    *   [ ] Have the changes been tested locally?
    *   [ ] Have the bundle sizes been analyzed and compared?
    *   [ ] Have the performance metrics been measured and compared?
    *   [ ] Have the official docs been consulted for the implemented changes?
*   **Rollback/Feature-Flag:**
    *   The suggested changes are generally safe and unlikely to require feature flags. However, for the TanStack Query SSR implementation, it might be beneficial to roll it out to a single page first to verify its correctness before applying it to the entire application.

## Next Action

The highest priority action is to **refactor the `patient-pwa` landing page to use Server Components for static content**. This is a relatively low-effort, high-impact change that will immediately improve the performance of the `patient-pwa`.
