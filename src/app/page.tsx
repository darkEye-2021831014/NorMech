'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, PenLine, Settings2 } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';

export default function LandingPage() {
  const reduce = useReducedMotion();

  // The composition is one viewport tall. The top bar is the only
  // fixed-height row; the body is flex-1 with items-center so the
  // headline + paragraph + entrance cards are vertically centered
  // in the remaining space at 1280x720 desktop and 390x844 phone.
  return (
    <main className="min-h-dvh flex flex-col">
      {/* Slim top bar — only the catalogue mark and theme toggle. */}
      <header className="border-b border-ink/15 shrink-0">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="catalogue">No. 001</span>
            <span className="hidden sm:inline-block w-12 h-px bg-ink/30" aria-hidden />
            <span className="catalogue">M.A. — Vol. I</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Body: vertically centered single-viewport composition. */}
      <section className="flex-1 min-h-0 flex items-center justify-center px-6 py-6">
        <div className="w-full max-w-[960px] flex flex-col items-center text-center">
          <motion.p
            className="catalogue text-vermilion dark:text-vermilionBright mb-4 flex items-center gap-2"
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <span className="w-1.5 h-1.5 bg-vermilion dark:bg-vermilionBright rounded-full" aria-hidden />
            The Meme Annotator
          </motion.p>

          <motion.h1
            className="font-display leading-[1.0] tracking-tightest text-ink"
            style={{ fontSize: 'clamp(2rem, 5.5vw, 4.25rem)' }}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: [0.2, 0.7, 0.2, 1] }}
          >
            A reading room
            <br />
            <span className="italic text-ink/85">for the</span>{' '}
            <span className="text-vermilion dark:text-vermilionBright">picture</span>
            <br />
            <span className="text-ink">that travels with care.</span>
          </motion.h1>

          <motion.p
            className="mt-5 max-w-[42ch] text-ink"
            style={{ fontSize: 'clamp(0.95rem, 1.4vw, 1.05rem)' }}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
          >
            Open a dataset, read each picture one at a time, and mark what
            the work asks of you.
          </motion.p>

          <motion.div
            className="mt-7 w-full grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.24, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <EntryPoint
              href="/annotate"
              caption="For participants"
              label="Annotator"
              description="Label images from your assigned dataset."
              icon={<PenLine size={18} strokeWidth={1.5} />}
              tone="primary"
            />
            <EntryPoint
              href="/admin"
              caption="For researchers"
              label="Admin"
              description="Manage datasets, access keys and annotations."
              icon={<Settings2 size={18} strokeWidth={1.5} />}
              tone="secondary"
            />
          </motion.div>
        </div>
      </section>
    </main>
  );
}

function EntryPoint({
  href,
  caption,
  label,
  description,
  icon,
  tone,
}: {
  href: string;
  caption: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  tone: 'primary' | 'secondary';
}) {
  const reduce = useReducedMotion();
  const isPrimary = tone === 'primary';
  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={label}
      className={cn(
        'group block rounded-sm transition-colors duration-200 ease-notebook',
        isPrimary
          ? 'bg-vermilion text-paperStrong border border-vermilion hover:bg-vermilion/90'
          : 'bg-paper text-ink border-[1.5px] border-ink hover:bg-ink hover:text-paper hover:border-ink'
      )}
    >
      <motion.div
        whileHover={reduce ? undefined : { y: -2 }}
        whileTap={reduce ? undefined : { y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        className="px-5 sm:px-6 py-4 sm:py-5 h-full flex items-center justify-between gap-4 text-left"
      >
        <div className="min-w-0">
          <div
            className={cn(
              'flex items-center gap-2 catalogue',
              isPrimary ? 'text-paperStrong/85' : 'text-ink'
            )}
          >
            {icon}
            <span>{caption}</span>
          </div>
          <h2
            className={cn(
              'mt-1.5 font-display leading-none',
              isPrimary ? 'text-paperStrong' : 'text-ink'
            )}
            style={{ fontSize: 'clamp(1.5rem, 2.4vw, 2rem)' }}
          >
            {label}
          </h2>
          <p
            className={cn(
              'mt-1.5 text-[13px] leading-snug',
              isPrimary ? 'text-paperStrong/90' : 'text-ink/80'
            )}
          >
            {description}
          </p>
        </div>
        <ArrowUpRight
          size={20}
          strokeWidth={1.5}
          className={cn(
            'shrink-0 transition-transform duration-200 ease-notebook',
            isPrimary
              ? 'text-paperStrong group-hover:translate-x-0.5 group-hover:-translate-y-0.5'
              : 'text-ink group-hover:translate-x-0.5 group-hover:-translate-y-0.5'
          )}
        />
      </motion.div>
    </Link>
  );
}
