This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## Production URL for Patient PWA (QR link)

The dashboard renders a QR code that points patients to the PWA join page. By default, the code will:

- Use `NEXT_PUBLIC_PATIENT_BASE_URL` if set (recommended in production)
- Otherwise, if running from waitfreeclinic.com, use https://app.waitfreeclinic.com (patient PWA subdomain)
- Fall back to `http://localhost:3002` in local development

Set an environment variable on your hosting platform for the dashboard:

- `NEXT_PUBLIC_PATIENT_BASE_URL=https://app.waitfreeclinic.com`

This ensures the printed/copyable link under the QR never points to a localhost URL after deployment.

## Design System (Initial Extraction)

This dashboard now includes an initial, non-breaking design token layer and primitive UI components to enable a gradual modernization without refactoring existing business logic.

### Tokens
Defined in `app/design-tokens.css` as CSS variables (colors, spacing, radii, shadows, motion). Tailwind consumes them through `tailwind.config.mjs` extension so you can use utilities like `bg-brand-600` or semantic color references under `sem-*` (e.g. `bg-sem-surface`).

Key categories:
- Brand scale: `--color-brand-50` … `--color-brand-900`
- Semantic: `--color-sem-primary`, `--color-sem-danger`, `--color-sem-border`, `--color-sem-surface`
- Elevation: `--shadow-xs|sm|md|lg`
- Radius: `--radius-xs|sm|md|lg|xl|pill`
- Motion: `--ease-brand`, durations `--dur-fast|base|slow`

Dark mode variables are prepped inside a `prefers-color-scheme: dark` media query for future activation.

### New Primitives (Additive)
Located under `components/ui/`:
- `Button` – variants: primary, subtle, outline, danger, ghost; sizes: sm, md, lg; loading & icon slots.
- `Badge` – tone + variant (solid, soft, outline) for consistent status chips.
- `Card` – structural surface component (solid, soft, outline) + spacing presets.

These are not yet wired into existing production views; you can adopt them incrementally:

```tsx
import Button from '@/components/ui/Button';
<Button variant="primary" size="sm">Save</Button>
```

### Implementation Guidance
1. When refactoring existing elements (e.g., queue action buttons), replace raw Tailwind color classes with a primitive first; do not mix old + new patterns in the same element.
2. For new surfaces (panels, marketing sections), prefer `Card` with `variant="soft"` or `variant="outline"`.
3. Use `Badge` for queue status, patient state, environment labels.
4. Avoid introducing bespoke colors; map to an existing semantic token and, if missing, add a single new semantic alias rather than a raw hex.
5. All motion should use `transition-[property] duration-base ease-brand` unless a performance concern exists.

### Roadmap (Next Steps Suggestion)
- Extract a `useQueueData` hook to unify listeners.
- Introduce an onboarding flow at `app/onboarding/*`.
- Move authentication out of dashboard shell to `/auth` routes.
- Add accessibility: focus ring alignment and ARIA live regions for queue changes.

### Non-Breaking Policy
No existing component logic was modified; all changes are additive. You can remove the new primitives without affecting current runtime behavior.

---
