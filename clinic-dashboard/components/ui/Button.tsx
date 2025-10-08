import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'outline' | 'subtle' | 'ghost' | 'danger' | 'soft-danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

// Variant philosophy:
// primary: high emphasis brand
// secondary: neutral elevated (good on white backgrounds)
// accent: alternative action (e.g. create, new) with teal accent
// outline: quiet action with border
// subtle: minimal surface tint
// ghost: text-only hover effect
// danger / soft-danger: destructive primary vs. low emphasis destructive
const variantClasses: Record<string, string> = {
  primary: 'bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-500)] active:bg-[var(--color-brand-700)] text-white shadow-md shadow-black/5',
  secondary: 'bg-gray-800 hover:bg-gray-700 active:bg-gray-900 text-white shadow-md shadow-black/5',
  accent: 'bg-[var(--color-sem-accent)] hover:bg-cyan-600 active:bg-cyan-700 text-white shadow-md shadow-black/5',
  outline: 'bg-white text-gray-800 border border-gray-300 hover:bg-gray-50 active:bg-gray-100 shadow-sm',
  subtle: 'bg-[var(--color-sem-surfaceAlt)] text-gray-700 hover:bg-white active:bg-gray-50 border border-sem-border shadow-xs',
  ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 active:bg-gray-200',
  danger: 'bg-[var(--color-sem-danger)] hover:bg-[var(--color-sem-danger-hover)] active:bg-red-800 text-white shadow-md shadow-black/5',
  'soft-danger': 'bg-red-50 text-sem-danger hover:bg-red-100 active:bg-red-200 border border-red-200'
};

const sizeClasses: Record<string, string> = {
  sm: 'h-11 px-4 text-sm rounded-md', // ~44px
  md: 'h-12 px-5 text-sm rounded-md', // ~48px
  lg: 'h-12 px-6 text-base rounded-lg' // keep 48, more padding
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled, className = '', leftIcon, rightIcon, children, ...rest }, ref
) {
  const v = variantClasses[variant] || variantClasses.primary;
  const s = sizeClasses[size] || sizeClasses.md;
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 font-medium rounded-md tracking-wide transition-[background,box-shadow,color,transform] duration-150 ease-[var(--ease-brand)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[.99] ${v} ${s} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {!loading && leftIcon}
      <span className="truncate">{children}</span>
      {!loading && rightIcon}
    </button>
  );
});

export default Button;
