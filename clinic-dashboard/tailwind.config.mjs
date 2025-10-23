/** Tailwind v4 inline config extension adding semantic tokens.
 * Non-destructive: relies on CSS variables defined in app/design-tokens.css.
 */
const config = {
  content: [
    './app/**/*.{ts,tsx,js,jsx}',
    './components/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
      boxShadow: {
        subtle: 'var(--shadow-xs)',
        lift: 'var(--shadow-sm)',
        float: 'var(--shadow-md)',
        overlay: 'var(--shadow-lg)'
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        pill: 'var(--radius-pill)'
      },
      colors: {
        brand: {
          50: 'var(--color-brand-50)',
          100: 'var(--color-brand-100)',
          200: 'var(--color-brand-200)',
          300: 'var(--color-brand-300)',
          400: 'var(--color-brand-400)',
          500: 'var(--color-brand-500)',
          600: 'var(--color-brand-600)',
          700: 'var(--color-brand-700)',
          800: 'var(--color-brand-800)',
          900: 'var(--color-brand-900)'
        },
        neutral: {
          50: 'var(--color-neutral-50)',
          100: 'var(--color-neutral-100)',
          200: 'var(--color-neutral-200)',
          300: 'var(--color-neutral-300)',
          400: 'var(--color-neutral-400)',
          500: 'var(--color-neutral-500)',
          600: 'var(--color-neutral-600)',
          700: 'var(--color-neutral-700)',
          800: 'var(--color-neutral-800)',
          900: 'var(--color-neutral-900)'
        },
        surface: {
          base: 'var(--surface-base)',
          raised: 'var(--surface-raised)',
          overlay: 'var(--surface-overlay)',
          sunken: 'var(--surface-sunken)'
        },
        sem: {
          primary: 'var(--color-sem-primary)',
          'primary-hover': 'var(--color-sem-primary-hover)',
          'primary-active': 'var(--color-sem-primary-active)',
          accent: 'var(--color-sem-accent)',
          danger: 'var(--color-sem-danger)',
          'danger-hover': 'var(--color-sem-danger-hover)',
          warning: 'var(--color-sem-warning)',
          'warning-hover': 'var(--color-sem-warning-hover)',
          success: 'var(--color-sem-success)',
          'success-hover': 'var(--color-sem-success-hover)',
          muted: 'var(--color-sem-muted)',
          border: 'var(--color-sem-border)',
          surface: 'var(--color-sem-surface)',
          surfaceAlt: 'var(--color-sem-surface-alt)',
          overlay: 'var(--color-sem-overlay)'
        }
      },
      transitionTimingFunction: {
        brand: 'var(--ease-brand)'
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        slow: 'var(--dur-slow)'
      }
    }
  }
};

export default config;
