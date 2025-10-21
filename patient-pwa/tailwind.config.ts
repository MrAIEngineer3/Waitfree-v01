/** Tailwind v4 config for patient PWA */
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx,js,jsx,mdx}",
    "./components/**/*.{ts,tsx,js,jsx,mdx}",
    "./lib/**/*.{ts,tsx,js,jsx,mdx}",
  ],
  theme: {
    extend: {
      boxShadow: {
        subtle: "var(--shadow-xs)",
        lift: "var(--shadow-sm)",
        float: "var(--shadow-md)",
        overlay: "var(--shadow-lg)",
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        pill: "var(--radius-pill)",
      },
      colors: {
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        brand: {
          50: "var(--color-brand-50)",
          100: "var(--color-brand-100)",
          200: "var(--color-brand-200)",
          300: "var(--color-brand-300)",
          400: "var(--color-brand-400)",
          500: "var(--color-brand-500)",
          600: "var(--color-brand-600)",
          700: "var(--color-brand-700)",
          800: "var(--color-brand-800)",
          900: "var(--color-brand-900)",
        },
        sem: {
          primary: "var(--color-sem-primary)",
          "primary-hover": "var(--color-sem-primary-hover)",
          "primary-active": "var(--color-sem-primary-active)",
          accent: "var(--color-sem-accent)",
          danger: "var(--color-sem-danger)",
          "danger-hover": "var(--color-sem-danger-hover)",
          warning: "var(--color-sem-warning)",
          "warning-hover": "var(--color-sem-warning-hover)",
          success: "var(--color-sem-success)",
          "success-hover": "var(--color-sem-success-hover)",
          muted: "var(--color-sem-muted)",
          border: "var(--color-sem-border)",
          surface: "var(--color-sem-surface)",
          surfaceAlt: "var(--color-sem-surface-alt)",
          overlay: "var(--color-sem-overlay)",
        },
      },
      transitionTimingFunction: {
        brand: "var(--ease-brand)",
      },
      transitionDuration: {
        fast: "var(--dur-fast)",
        base: "var(--dur-base)",
        slow: "var(--dur-slow)",
      },
    },
  },
};

export default config;
