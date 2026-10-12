'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ReactNode } from 'react';

/**
 * Root template. Next.js App Router re-mounts a template on every
 * navigation, which makes it the right place for an entry animation
 * without losing state inside the page itself.
 *
 * The animation is intentionally short and crossfades only — long
 * enough to soften the route change, short enough not to feel
 * sluggish. `useReducedMotion` collapses it to a single frame.
 */
export default function Template({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 1 } : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.18, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
