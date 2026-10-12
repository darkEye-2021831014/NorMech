'use client';

import { forwardRef, ButtonHTMLAttributes } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-ink text-paper hover:bg-vermilion border border-ink',
  secondary:
    'bg-paper text-ink border border-ink/40 hover:border-ink hover:bg-ink/5',
  ghost:
    'bg-transparent text-ink border border-transparent hover:border-ink/30',
  danger:
    'bg-vermilion text-paper border border-vermilion hover:bg-vermilion/90',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-[13px]',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-[15px]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = 'primary', size = 'md', children, ...props },
    ref
  ) {
    const reduce = useReducedMotion();
    return (
      <motion.button
        ref={ref}
        whileTap={reduce ? undefined : { scale: 0.97, y: 1 }}
        transition={{ type: 'spring', stiffness: 600, damping: 30 }}
        className={cn(
          'btn-touch inline-flex items-center justify-center gap-2 font-mono uppercase tracking-widerish',
          'transition-colors duration-150 ease-notebook select-none',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          'rounded-sm',
          variants[variant],
          sizes[size],
          className
        )}
        {...(props as any)}
      >
        {children}
      </motion.button>
    );
  }
);
