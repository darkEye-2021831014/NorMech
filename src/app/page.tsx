'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, PenLine, Settings2 } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Logo } from '@/components/Logo';
import { siteName, tagline } from '@/config/brand';
import { cn } from '@/lib/utils';

export default function LandingPage() {
  const reduce = useReducedMotion();
  // The 3-step strip drops out on viewports shorter than 700px so
  // the page stays single-viewport at 1280x720 AND 390x844. We watch
  // `innerHeight` and toggle a state flag on resize.
  const [showSteps, setShowSteps] = useState(true);
  useEffect(() => {
    const update = () => setShowSteps(window.innerHeight >= 700);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Single-viewport composition: the top bar is the only
  // fixed-height row; the body is flex-1 with items-center so the
  // headline + paragraph + entrance cards + steps strip + footer
  // are vertically centered in the remaining space.
  return (
    <main className="min-h-dvh flex flex-col">
      {/* Top bar: logo + wordmark on the left; tagline + theme
          toggle on the right. The tagline hides below 640px. */}
      <header className="border-b border-ink/15 shrink-0">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-3 flex items-center justify-between gap-4">
          <Link
            href="/"
            prefetch={false}
            className="inline-flex items-center gap-2.5 min-w-0"
            aria-label={`${siteName} home`}
          >
            <Logo size={22} className="text-ink shrink-0" />
            <span className="font-display text-[16px] leading-none tracking-tightish text-ink truncate">
              {siteName}
            </span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-5 min-w-0">
            <span className="hidden sm:inline font-mono text-[11px] tracking-widerish text-inkMuted truncate">
              {tagline}
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Body: vertically centered single-viewport composition. */}
      <section className="flex-1 min-h-0 flex items-center justify-center px-6 py-6">
        <div className="w-full max-w-[960px] flex flex-col items-center text-center">
          <motion.p
            className="catalogue text-vermilion dark:text-vermilionBright mb-3 flex items-center gap-2"
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <span className="w-1.5 h-1.5 bg-vermilion dark:bg-vermilionBright rounded-full" aria-hidden />
            {tagline}
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
            for the{' '}
            <span className="text-vermilion dark:text-vermilionBright">picture</span>{' '}
            that travels with care.
          </motion.h1>

          <motion.p
            className="mt-5 max-w-[42ch] text-ink"
            style={{ fontSize: 'clamp(0.95rem, 1.4vw, 1.05rem)' }}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
          >
            Read each picture one at a time and mark what the work asks of you.
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

          {/* 3-step strip. Hidden on mobile, and also hidden when
              viewport height < 700px. Mono small caps. */}
          {showSteps && (
            <motion.p
              className="mt-6 hidden md:flex items-center justify-center gap-2 sm:gap-3 font-mono text-[10.5px] uppercase tracking-widerish text-inkMuted"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.32, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <span>1 Enter your name and key</span>
              <span aria-hidden>→</span>
              <span>2 Label each image</span>
              <span aria-hidden>→</span>
              <span>3 Download your CSV</span>
            </motion.p>
          )}
        </div>
      </section>

      {/* Footer: a single small line. Always visible; never pushes
          the body content. */}
      <footer className="shrink-0 border-t border-ink/10">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-2.5 flex items-center justify-center">
          <p className="font-mono text-[10.5px] tracking-widerish text-inkMuted">
            {siteName} · for research use
          </p>
        </div>
      </footer>
    </main>
  );
}

/**
 * The two entrance cards. The hover/focus treatment keeps the
 * background color FIXED (no inversion) and instead:
 *
 *   - brightens the border to the accent color,
 *   - draws a 2px ring (a box-shadow on a dedicated ring div so
 *     the existing 1px hairline border is preserved),
 *   - sweeps a 1px accent line along the bottom edge from left
 *     to right (scaleX 0→1),
 *   - slides the arrow icon up-right 4px,
 *   - lifts the card translateY(-2px).
 *
 * On the filled Annotator card the ring color is `paperStrong`
 * instead of the accent so the ring stays visible on the
 * vermilion fill. Pressed: translateY(0) + a tighter 1.5px ring.
 * All transitions are disabled under `prefers-reduced-motion` —
 * only the ring stays (instant, no transition).
 */
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
  // Tailwind arbitrary classes — we can't use string interpolation
  // for unknown values without safelist, so the dynamic ring color
  // is applied via inline `style` and the rest via class strings.
  const ringColor = isPrimary ? 'rgb(var(--paper-strong))' : 'rgb(var(--vermilion))';
  const borderHover = isPrimary
    ? 'border-paperStrong/70 group-hover:border-paperStrong'
    : 'border-vermilion dark:border-vermilionBright';
  const lineColor = isPrimary
    ? 'bg-paperStrong/80'
    : 'bg-vermilion dark:bg-vermilionBright';

  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={label}
      className={cn(
        'group relative block rounded-sm',
        // Base background + text — UNCHANGED on hover/focus.
        isPrimary
          ? 'bg-vermilion text-paperStrong border border-vermilion'
          : 'bg-paper text-ink border-[1.5px] border-ink',
        // Border brightens on hover/focus. Transitions are killed
        // under reduced motion.
        !reduce && 'transition-[border-color,box-shadow,transform] duration-200 ease-notebook',
        borderHover,
        // The ring is implemented as a box-shadow on the card
        // itself so it draws OUTSIDE the 1px hairline border. The
        // `ring` class would conflict with focus rings elsewhere,
        // so we use an inline `box-shadow` driven by `--ring-c`.
        'focus-visible:outline-none focus-visible:[box-shadow:0_0_0_2px_var(--ring-c)]',
        // CSS var so the focus ring inherits the per-tone color.
        // Falls back to ink if unset.
      )}
      style={{
        // CSS variables; safe to set per-instance.
        ['--ring-c' as string]: ringColor,
      }}
    >
      <motion.div
        whileHover={reduce ? undefined : { y: -2 }}
        whileTap={reduce ? undefined : { y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        // The "ring" overlay: a 0px-thick box-shadow that grows to
        // 2px on hover/focus. We use a separate absolutely-positioned
        // div so it can animate independently of the 1px border
        // (animating box-shadow on the card itself would change the
        // layout). It uses `pointer-events-none` so clicks pass
        // through to the link.
        className="relative h-full"
      >
        {/* Hover ring overlay. Animates opacity so it doesn't
            affect layout. Under reduced motion it's always visible
            while focused (no fade). */}
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 rounded-sm',
            // Under reduced motion: ring is instant (no opacity
            // transition), and only visible on focus.
            reduce
              ? 'opacity-0 group-focus-visible:opacity-100'
              : cn(
                  'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
                  'transition-opacity duration-200 ease-notebook'
                )
          )}
          style={{ boxShadow: `0 0 0 2px ${ringColor}` }}
        />
        <div className="px-5 sm:px-6 py-4 sm:py-5 h-full flex items-center justify-between gap-4 text-left">
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
                isPrimary ? 'text-paperStrong/95' : 'text-ink/85'
              )}
            >
              {description}
            </p>
          </div>
          <ArrowUpRight
            size={20}
            strokeWidth={1.5}
            className={cn(
              'shrink-0',
              isPrimary ? 'text-paperStrong' : 'text-ink',
              // Slide up-right 4px on hover/focus. Kill under
              // reduced motion.
              !reduce && 'transition-transform duration-200 ease-notebook',
              'group-hover:translate-x-0.5 group-hover:-translate-y-0.5',
              'group-focus-visible:translate-x-0.5 group-focus-visible:-translate-y-0.5'
            )}
          />
        </div>
        {/* Accent bottom-line sweep. scaleX 0→1 from left, ~300ms.
            Under reduced motion the line is always 100% (no
            animation), so it doesn't suddenly pop in. */}
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute left-0 right-0 bottom-0 h-[2px]',
            lineColor,
            'origin-left',
            reduce
              ? 'scale-x-100'
              : cn(
                  'scale-x-0 group-hover:scale-x-100 group-focus-visible:scale-x-100',
                  'transition-transform duration-300 ease-notebook'
                )
          )}
        />
      </motion.div>
    </Link>
  );
}
