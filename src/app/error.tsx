'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { RefreshCw, Home } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const reduce = useReducedMotion();

  useEffect(() => {
    // Log to the browser console for debugging; in production the
    // server-side logger will have the matching digest.
    console.error('App error:', error);
  }, [error]);

  return (
    <main className="min-h-screen relative flex flex-col">
      <header className="border-b border-ink/15">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="catalogue">Errata</span>
            <span className="hidden sm:inline-block w-12 h-px bg-ink/30" aria-hidden />
            <span className="catalogue text-inkMuted">500 · ink has spilled</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <section className="flex-1 flex items-center justify-center px-6 md:px-10 py-20">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
          className="max-w-[640px] w-full text-center"
        >
          <p className="catalogue text-vermilion mb-6 flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 bg-vermilion rounded-full" aria-hidden />
            Something has gone wrong
          </p>

          <h1 className="font-display text-[64px] sm:text-[96px] leading-[0.9] tracking-tightest text-ink">
            5
            <span className="italic text-vermilion">0</span>
            0
          </h1>

          <p className="mt-6 font-display italic text-[20px] sm:text-[22px] text-ink/80 leading-snug max-w-[42ch] mx-auto">
            An unexpected error occurred while preparing this page.
          </p>

          <p className="mt-4 font-sans text-[14px] text-inkMuted max-w-[52ch] mx-auto leading-relaxed">
            The archivist has been notified. You may try again, or return to
            the front entrance and begin again.
          </p>

          {error.digest && (
            <p className="mt-5 font-mono text-[11px] text-inkMuted">
              ref: {error.digest}
            </p>
          )}

          <div className="mt-10 flex flex-col sm:flex-row gap-3 items-center justify-center">
            <button
              type="button"
              onClick={() => reset()}
              className="btn-touch inline-flex items-center justify-center gap-2 h-12 px-6 font-mono uppercase tracking-widerish text-[14px] bg-ink text-paper border border-ink hover:bg-vermilion transition-colors duration-150 ease-notebook rounded-sm"
            >
              <RefreshCw size={16} strokeWidth={1.5} />
              Try again
            </button>
            <Link
              href="/"
              className="btn-touch inline-flex items-center justify-center gap-2 h-12 px-6 font-mono uppercase tracking-widerish text-[14px] bg-paper text-ink border border-ink/40 hover:border-ink hover:bg-ink/5 transition-colors duration-150 ease-notebook rounded-sm"
            >
              <Home size={16} strokeWidth={1.5} />
              Return to entrance
            </Link>
          </div>
        </motion.div>
      </section>

      <footer className="border-t border-ink/15">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-5 text-center">
          <p className="catalogue text-inkMuted">
            NorMech · Errata sheet
          </p>
        </div>
      </footer>
    </main>
  );
}
