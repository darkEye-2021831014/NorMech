'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

interface CountUpProps {
  to: number;
  durationMs?: number;
  className?: string;
  format?: (n: number) => string;
}

/** Animates from 0 → to on mount, and from current → to when `to`
 *  changes. Uses requestAnimationFrame, with reduced-motion instant. */
export function CountUp({ to, durationMs = 700, className, format }: CountUpProps) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? to : 0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduce) {
      setValue(to);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out-cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (to - from) * eased;
      setValue(v);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [to, durationMs, reduce]);

  const display = format ? format(value) : Math.round(value).toLocaleString();
  return <span className={className}>{display}</span>;
}