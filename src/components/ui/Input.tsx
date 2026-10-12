'use client';

import { forwardRef, InputHTMLAttributes, useId, useState } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, id, ...props },
  ref
) {
  const reactId = useId();
  const inputId = id ?? reactId;
  const [focused, setFocused] = useState(false);
  const hasValue =
    props.value !== undefined && props.value !== null && String(props.value).length > 0;

  const floated = focused || hasValue;

  return (
    <div className="w-full">
      <div
        className={cn(
          'relative border bg-cardBg transition-colors duration-150 ease-notebook rounded-sm',
          error
            ? 'border-vermilion'
            : focused
            ? 'border-ink'
            : 'border-ink/30 hover:border-ink/60'
        )}
      >
        <label
          htmlFor={inputId}
          className={cn(
            'pointer-events-none absolute left-3 font-mono uppercase tracking-widerish transition-all duration-150 ease-notebook',
            floated
              ? 'top-1.5 text-[10px] text-inkMuted'
              : 'top-1/2 -translate-y-1/2 text-[12px] text-inkMuted',
            error && floated && 'text-vermilion'
          )}
        >
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          className={cn(
            'w-full bg-transparent px-3 pt-5 pb-2 text-[15px] text-ink outline-none',
            'font-sans placeholder:text-inkMuted/0',
            className
          )}
          {...props}
        />
      </div>
      {hint && !error && (
        <p className="mt-1.5 text-[11px] font-mono uppercase tracking-widerish text-inkMuted">
          {hint}
        </p>
      )}
      {error && (
        <p className="mt-1.5 text-[11px] font-mono uppercase tracking-widerish text-vermilion">
          {error}
        </p>
      )}
    </div>
  );
});
