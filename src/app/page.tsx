'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, PenLine, Settings2, BookOpen } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function LandingPage() {
  const reduce = useReducedMotion();

  return (
    <main className="min-h-screen relative">
      {/* Top frame: catalogue strip */}
      <header className="border-b border-ink/15">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="catalogue">No. 001</span>
            <span className="hidden sm:inline-block w-12 h-px bg-ink/30" aria-hidden />
            <span className="catalogue">M.A. — Vol. I</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline catalogue text-inkMuted">
              an instrument for the close annotation of meme imagery
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Asymmetric editorial layout */}
      <section className="max-w-[1280px] mx-auto px-6 md:px-10 pt-16 md:pt-24 pb-24">
        <div className="grid grid-cols-12 gap-y-16 md:gap-x-10">
          {/* Left margin — folio */}
          <aside className="hidden lg:block col-span-2 pt-2">
            <div className="sticky top-12 space-y-6">
              <div>
                <p className="catalogue text-inkMuted mb-1">Folio</p>
                <p className="font-mono text-[11px] text-inkMuted leading-relaxed">
                  f. 1r
                  <br />
                  <span className="italic text-ink/60">— entry —</span>
                </p>
              </div>
              <div className="h-px bg-ink/20" />
              <div>
                <p className="catalogue text-inkMuted mb-1">Press</p>
                <p className="font-display text-[15px] leading-snug italic text-ink/80">
                  Edition of <br />one observer <br />at a time.
                </p>
              </div>
              <div className="h-px bg-ink/20" />
              <div>
                <p className="catalogue text-inkMuted mb-1">Tooling</p>
                <p className="font-mono text-[11px] text-inkMuted">v. 0.1.0</p>
              </div>
            </div>
          </aside>

          {/* Main column — title block */}
          <div className="col-span-12 lg:col-span-7">
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <p className="catalogue text-vermilion mb-6 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-vermilion rounded-full" aria-hidden />
                The Meme Annotator
              </p>

              <h1 className="font-display text-[44px] sm:text-[58px] md:text-[72px] leading-[0.95] tracking-tightest text-ink">
                A reading room
                <br />
                <span className="italic text-ink/80">for the</span>{' '}
                <span className="text-vermilion">picture</span>
                <br />
                <span className="text-ink/70">that travels.</span>
              </h1>

              <div className="mt-8 max-w-[58ch] space-y-4">
                <p className="font-sans text-[17px] leading-[1.55] text-ink/85">
                  The Meme Annotator is a small instrument built for the slow,
                  attentive study of images that move. A reader enters with a key,
                  receives a single page at a time, and records what the work
                  asks of them.
                </p>
                <p className="font-sans text-[15px] leading-[1.6] text-inkMuted">
                  No leaderboards. No streaks. No metrics of speed. The work is
                  the marking, the marking is the record, the record is the
                  archive.
                </p>
              </div>
            </motion.div>

            {/* Entry points — editorial, not cards */}
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15, ease: [0.2, 0.7, 0.2, 1] }}
              className="mt-14"
            >
              <p className="catalogue text-inkMuted mb-5">— Two entrances —</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <EntryPoint
                  href="/annotate"
                  label="I.  Annotator"
                  kicker="The reader's seat"
                  description="Enter a dataset with the access key printed on your invitation. You will be given a single image and a single question."
                  icon={<PenLine size={18} strokeWidth={1.5} />}
                  accent="vermilion"
                />
                <EntryPoint
                  href="/admin"
                  label="II.  Administrator"
                  kicker="The curator's desk"
                  description="Maintain the catalogue: build datasets, generate keys, review the marks left by your readers."
                  icon={<Settings2 size={18} strokeWidth={1.5} />}
                  accent="olive"
                />
              </div>
            </motion.div>
          </div>

          {/* Right margin — colophon */}
          <aside className="hidden lg:block col-span-3 pt-2">
            <motion.div
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="sticky top-12 space-y-5"
            >
              <div className="border-l border-ink/30 pl-4 space-y-3">
                <p className="catalogue text-inkMuted">Colophon</p>
                <p className="font-display italic text-[14px] leading-[1.55] text-ink/80">
                  Set in Fraunces, after a 19th-century French canon, and in
                  IBM Plex, the modern bookkeeper&apos;s face. Pressed on warm
                  paper that remembers the hand.
                </p>
              </div>

              <div className="border-l border-ink/30 pl-4 space-y-2">
                <p className="catalogue text-inkMuted">Mode</p>
                <p className="font-mono text-[11px] text-ink leading-relaxed">
                  single-observer,
                  <br />
                  non-persistent,
                  <br />
                  recorded only with consent.
                </p>
              </div>

              <div className="pt-2">
                <BookOpen size={20} strokeWidth={1.2} className="text-inkMuted" />
              </div>
            </motion.div>
          </aside>
        </div>
      </section>

      {/* Foot rule */}
      <footer className="border-t border-ink/15 mt-6">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="catalogue text-inkMuted">
            Prepared in the archivist&apos;s office. All marks reserved.
          </p>
          <p className="catalogue text-inkMuted">MMXXVI</p>
        </div>
      </footer>
    </main>
  );
}

function EntryPoint({
  href,
  label,
  kicker,
  description,
  icon,
  accent,
}: {
  href: string;
  label: string;
  kicker: string;
  description: string;
  icon: React.ReactNode;
  accent: 'vermilion' | 'olive';
}) {
  const reduce = useReducedMotion();
  return (
    <Link
      href={href}
      prefetch={false}
      className="group block border border-ink/25 hover:border-ink bg-cardBg transition-colors duration-200 ease-notebook rounded-sm"
    >
      <motion.div
        whileHover={reduce ? undefined : { y: -2 }}
        whileTap={reduce ? undefined : { y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        className="p-5 sm:p-6 h-full flex flex-col"
      >
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-2 text-ink">
            {icon}
            <span className="catalogue text-inkMuted">{kicker}</span>
          </div>
          <ArrowUpRight
            size={18}
            strokeWidth={1.5}
            className="text-inkMuted group-hover:text-ink group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform"
          />
        </div>

        <h2 className="font-display text-[28px] sm:text-[32px] leading-[1.05] tracking-tightish text-ink mb-3">
          {label}
        </h2>

        <p className="font-sans text-[14px] leading-[1.55] text-ink/75 flex-1">
          {description}
        </p>

        <div className="mt-5 pt-4 border-t border-ink/15 flex items-center justify-between">
          <span
            className={
              'catalogue ' +
              (accent === 'vermilion' ? 'text-vermilion' : 'text-olive')
            }
          >
            Enter →
          </span>
          <span className="catalogue text-inkMuted">{href}</span>
        </div>
      </motion.div>
    </Link>
  );
}
