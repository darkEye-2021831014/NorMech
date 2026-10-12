'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

export function AnnotateLoginForm() {
  const reduce = useReducedMotion();
  const { push } = useToast();

  const [accessKey, setAccessKey] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [shake, setShake] = useState(false);

  const keyRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    keyRef.current?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || cooldown > 0) return;
    if (!accessKey.trim() || !name.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/annotate/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessKey, name }),
      });

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        const ms = typeof data.retryAfterMs === 'number' ? data.retryAfterMs : 60_000;
        const secs = Math.ceil(ms / 1000);
        setCooldown(secs);
        push('error', `Too many attempts. The door is held shut for ${secs}s.`);
        triggerShake();
        return;
      }

      if (res.status === 401) {
        const data = await res.json().catch(() => ({}));
        push('error', data.error || 'We could not find that name and key together.');
        triggerShake();
        setAccessKey('');
        setName('');
        keyRef.current?.focus();
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        push('error', data.error || 'Sign-in failed.');
        return;
      }

      // Hard navigation so the new session cookie is sent with the
      // next request and the middleware-protected page is loaded fresh
      // from the server (not from the client cache).
      push('success', 'Welcome back.');
      window.location.assign('/annotate');
      // Intentionally keep `submitting` true so the button stays in its
      // "Opening..." state during the navigation.
      return;
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Network error.');
    } finally {
      setSubmitting(false);
    }
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 350);
  };

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{
        opacity: 1,
        y: 0,
        x: shake ? [0, -6, 6, -4, 4, 0] : 0,
      }}
      transition={{
        opacity: { duration: 0.4, ease: [0.2, 0.7, 0.2, 1] },
        y: { duration: 0.4, ease: [0.2, 0.7, 0.2, 1] },
        x: { duration: 0.32, ease: 'easeInOut' },
      }}
      className="w-full max-w-lg"
    >
      <p className="catalogue text-vermilion mb-3 flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-vermilion rounded-full" aria-hidden />
        The reader&apos;s seat
      </p>
      <h1 className="font-display text-[40px] sm:text-[48px] leading-[0.98] tracking-tightest text-ink mb-3">
        Sign{' '}
        <span className="italic text-ink/80">the</span>{' '}
        ledger.
      </h1>
      <p className="font-sans text-[15px] leading-[1.6] text-inkMuted mb-8">
        New here? Entering a new name registers you. Returning? Same
        name and key resumes where you left off.
      </p>

      <form onSubmit={onSubmit} className="space-y-5">
        <Input
          ref={keyRef}
          label="Access key"
          value={accessKey}
          onChange={(e) => setAccessKey(e.target.value)}
          required
          disabled={submitting}
          autoComplete="off"
          placeholder="NFZK-C86E"
          hint="The four-letter, four-letter code from your invitation."
        />
        <Input
          ref={nameRef}
          label="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={submitting}
          maxLength={120}
          autoComplete="off"
          hint="Use the same name on return to resume your work."
        />

        <div className="flex items-center justify-between gap-4">
          <p className="catalogue text-inkMuted">
            {cooldown > 0 ? `Locked for ${cooldown}s` : 'Ten attempts per minute.'}
          </p>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={submitting || cooldown > 0 || !accessKey.trim() || !name.trim()}
          >
            {submitting ? 'Opening…' : 'Enter'}
          </Button>
        </div>
      </form>

      <p className="mt-10 font-display italic text-[14px] text-inkMuted">
        &ldquo;A book is a mirror: if an ape looks in, an apostle cannot help
        looking out.&rdquo;
      </p>
    </motion.div>
  );
}