'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Home } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function NotFound() {
  const reduce = useReducedMotion();
  return (
    <main className="min-h-screen relative flex flex-col">
      {/* Top frame: catalogue strip */}
      <header className="border-b border-ink/15">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="catalogue">Errata</span>
            <span className="hidden sm:inline-block w-12 h-px bg-ink/30" aria-hidden />
            <span className="catalogue text-inkMuted">404 · missing folio</span>
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
            A page that is not in the catalogue
          </p>

          <h1 className="font-display text-[64px] sm:text-[96px] leading-[0.9] tracking-tightest text-ink">
            4
            <span className="italic text-vermilion">0</span>
            4
          </h1>

          <p className="mt-6 font-display italic text-[20px] sm:text-[22px] text-ink/80 leading-snug max-w-[42ch] mx-auto">
            We cannot find the page you were looking for. It may have been
            moved, deleted, or simply never inscribed in this volume.
          </p>

          <p className="mt-4 font-sans text-[14px] text-inkMuted max-w-[52ch] mx-auto leading-relaxed">
            The archivist apologises for the gap. Return to the reading room,
            or to the front entrance, and try another path.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3 items-center justify-center">
            <Link
              href="/"
              className="btn-touch inline-flex items-center justify-center gap-2 h-12 px-6 font-mono uppercase tracking-widerish text-[14px] bg-ink text-paper border border-ink hover:bg-vermilion transition-colors duration-150 ease-notebook rounded-sm"
            >
              <Home size={16} strokeWidth={1.5} />
              Return to entrance
            </Link>
            <button
              type="button"
              onClick={() => history.back()}
              className="btn-touch inline-flex items-center justify-center gap-2 h-12 px-6 font-mono uppercase tracking-widerish text-[14px] bg-paper text-ink border border-ink/40 hover:border-ink hover:bg-ink/5 transition-colors duration-150 ease-notebook rounded-sm"
            >
              <ArrowLeft size={16} strokeWidth={1.5} />
              Previous page
            </button>
          </div>
        </motion.div>
      </section>

      <footer className="border-t border-ink/15">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-5 text-center">
          <p className="catalogue text-inkMuted">
            M.A. — Vol. I · Errata sheet
          </p>
        </div>
      </footer>
    </main>
  );
}
