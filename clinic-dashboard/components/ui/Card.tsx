import * as React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
  variant?: 'solid' | 'soft' | 'outline';
}

const padMap: Record<string, string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-8'
};

const variantMap: Record<string, string> = {
  solid: 'bg-sem-surface shadow-subtle',
  soft: 'bg-white/60 backdrop-blur-sm shadow-subtle',
  outline: 'bg-sem-surface border border-sem-border shadow-subtle'
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = 'md', interactive = false, variant = 'outline', className = '', children, ...rest }, ref
) {
  return (
    <div
      ref={ref}
      className={`rounded-lg transition-shadow ${variantMap[variant]} ${padMap[padding]} ${interactive ? 'hover:shadow-float focus-within:shadow-float' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
});

export default Card;
