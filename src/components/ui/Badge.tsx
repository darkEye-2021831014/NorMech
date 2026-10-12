import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'vermilion' | 'olive' | 'outline';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

const tones: Record<Tone, string> = {
  neutral: 'bg-ink/8 text-ink border-ink/25',
  vermilion: 'bg-vermilion/10 text-vermilion border-vermilion/40',
  olive: 'bg-olive/10 text-olive border-olive/40',
  outline: 'bg-transparent text-ink border-ink/40',
};

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widerish border rounded-sm',
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
