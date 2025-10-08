import * as React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'accent';
  variant?: 'solid' | 'soft' | 'outline';
  size?: 'sm' | 'md';
}

const toneBase: Record<string, { solid: string; soft: string; outline: string }> = {
  neutral: {
    solid: 'bg-gray-700 text-gray-100',
    soft: 'bg-gray-100 text-gray-700',
    outline: 'ring-1 ring-inset ring-gray-300 text-gray-700'
  },
  success: {
    solid: 'bg-sem-success text-white',
    soft: 'bg-emerald-50 text-sem-success ring-1 ring-inset ring-emerald-200',
    outline: 'ring-1 ring-inset ring-sem-success text-sem-success'
  },
  danger: {
    solid: 'bg-sem-danger text-white',
    soft: 'bg-red-50 text-sem-danger ring-1 ring-inset ring-red-200',
    outline: 'ring-1 ring-inset ring-sem-danger text-sem-danger'
  },
  warning: {
    solid: 'bg-sem-warning text-white',
    soft: 'bg-amber-50 text-sem-warning ring-1 ring-inset ring-amber-200',
    outline: 'ring-1 ring-inset ring-sem-warning text-sem-warning'
  },
  info: {
    solid: 'bg-brand-600 text-white',
    soft: 'bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-200',
    outline: 'ring-1 ring-inset ring-brand-600 text-brand-600'
  },
  accent: {
    solid: 'bg-sem-accent text-white',
    soft: 'bg-cyan-50 text-sem-accent ring-1 ring-inset ring-cyan-200',
    outline: 'ring-1 ring-inset ring-sem-accent text-sem-accent'
  }
};

const sizeMap: Record<string, string> = {
  sm: 'text-[10px] px-1.5 py-0.5 rounded',
  md: 'text-xs px-2 py-0.5 rounded-md'
};

export const Badge = ({ tone = 'neutral', variant = 'soft', size = 'md', className = '', ...rest }: BadgeProps) => {
  const toneSet = toneBase[tone] || toneBase.neutral;
  const classes = `${toneSet[variant]} ${sizeMap[size]} font-medium inline-flex items-center gap-1 whitespace-nowrap`;
  return <span className={`${classes} ${className}`} {...rest} />;
};

export default Badge;
