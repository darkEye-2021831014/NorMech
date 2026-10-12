'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X, BookOpen } from 'lucide-react';
import { guidelines, guidelinesMeta } from '@/config/guidelines';

const STORAGE_KEY = 'ma-guidelines-dismissed-v1';
const ACCENT: Record<string, string> = {
  text: 'border-vermilion/40',
  image: 'border-vermilion/40',
  both: 'border-olive/40',
  none: 'border-ink/30',
};

interface Props {
  /** Initial-open state, decided by the parent. */
  initiallyOpen?: boolean;
  /** Re-open externally (e.g. help button). Each new value triggers open. */
  openTrigger?: number;
  /** Called when the modal is dismissed (Esc, click backdrop, button). */
  onClose?: () => void;
}

/**
 * "How to annotate" guidance modal. Explains the four choices in plain
 * language, drawing copy from `src/config/guidelines.ts`.
 *
 * The parent decides whether to show it on mount (via `initiallyOpen`),
 * based on its own localStorage check. Dismissal is persisted to
 * localStorage so the modal won't auto-show again. Re-open at any
 * time by bumping `openTrigger`.
 *
 * a11y: role="dialog", aria-modal, focus trap, Escape closes, focus
 * returns to the trigger.
 */
export function GuidelinesModal({ initiallyOpen, openTrigger, onClose }: Props) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(!!initiallyOpen);
  const [hadInitialOpen, setHadInitialOpen] = useState(!!initiallyOpen);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const handleClose = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {}
    onClose?.();
    // Restore focus.
    lastFocused.current?.focus();
  }, [onClose]);

  // Re-open when the parent bumps the trigger.
  useEffect(() => {
    if (openTrigger && openTrigger > 0) setOpen(true);
  }, [openTrigger]);

  // Focus management + body scroll lock + Escape.
  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => closeBtnRef.current?.focus(), 30);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if (e.key === 'Tab') {
        const root = dialogRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, handleClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="guidelines-backdrop"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          initial={reduce ? { opacity: 0 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0 }}
          transition={{ duration: 0.18 }}
          aria-hidden={false}
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-ink/40 backdrop-blur-[1px]"
            onClick={handleClose}
          />

          {/* Dialog */}
          <motion.div
            key="guidelines-dialog"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="guidelines-title"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
            className="relative w-full sm:max-w-[720px] max-h-[90vh] overflow-y-auto bg-cardBg border border-ink/30 shadow-ink-3 rounded-sm mx-3 sm:mx-0 mb-3 sm:mb-0"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-cardBg border-b border-ink/20 px-5 sm:px-7 py-4 flex items-start justify-between gap-3">
              <div>
                <p className="catalogue text-vermilion flex items-center gap-2">
                  <BookOpen size={12} strokeWidth={1.5} />
                  How to annotate
                </p>
                <h2
                  id="guidelines-title"
                  className="font-display text-[26px] sm:text-[30px] leading-tight tracking-tightish text-ink mt-1.5"
                >
                  Four marks,{' '}
                  <span className="italic text-ink/80">one question.</span>
                </h2>
                <p className="mt-1.5 font-sans text-[13px] text-inkMuted max-w-[60ch]">
                  {guidelinesMeta.intro}
                </p>
              </div>
              <button
                ref={closeBtnRef}
                type="button"
                onClick={handleClose}
                className="btn-touch shrink-0 -mt-1 -mr-1 p-2 text-inkMuted hover:text-ink rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-vermilion"
                aria-label="Close guidelines"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            {/* Body — four guidance cards */}
            <div className="px-5 sm:px-7 py-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {guidelines.map((g) => (
                <article
                  key={g.key}
                  className={`border ${ACCENT[g.key]} bg-paper/40 p-4 rounded-sm`}
                >
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <h3 className="font-display text-[20px] tracking-tightish text-ink">
                      {g.title}
                    </h3>
                    <span className="catalogue text-inkMuted text-[10px]">
                      {g.when}
                    </span>
                  </div>
                  <p className="font-display italic text-[14px] text-ink/80 mb-2.5">
                    {g.caption}
                  </p>
                  <div className="space-y-2 font-sans text-[13px] leading-relaxed text-ink/80">
                    {g.guidance.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-cardBg border-t border-ink/20 px-5 sm:px-7 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="font-display italic text-[13px] text-ink/70 max-w-[52ch]">
                {guidelinesMeta.footnote}
              </p>
              <button
                type="button"
                onClick={handleClose}
                className="btn-touch inline-flex items-center justify-center h-11 px-5 font-mono uppercase tracking-widerish text-[13px] bg-ink text-paper border border-ink hover:bg-vermilion transition-colors duration-150 ease-notebook rounded-sm"
              >
                {hadInitialOpen ? 'Begin annotating' : 'Close'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Helper used by the parent to know whether the modal has been seen. */
export function hasSeenGuidelines(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Reset the modal (e.g. from a "Show how to annotate" button). */
export function resetGuidelines(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
