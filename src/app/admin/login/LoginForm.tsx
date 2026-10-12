'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

export function AdminLoginForm() {
  const reduce = useReducedMotion();
  const { push } = useToast();

  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0); // seconds remaining
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || cooldown > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        const ms = typeof data.retryAfterMs === 'number' ? data.retryAfterMs : 60_000;
        const secs = Math.ceil(ms / 1000);
        setCooldown(secs);
        push('error', `Too many attempts. The door is held shut for ${secs}s.`);
        setShake(true);
        setTimeout(() => setShake(false), 350);
        return;
      }

      if (res.status === 401) {
        const data = await res.json().catch(() => ({}));
        push('error', data.error || 'Incorrect password.');
        setShake(true);
        setTimeout(() => setShake(false), 350);
        setPassword('');
        inputRef.current?.focus();
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
      window.location.assign('/admin');
      // Keep `submitting` true so the button stays in "Opening..." state
      // during navigation.
      return;
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Network error.');
    } finally {
      setSubmitting(false);
    }
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
      className="w-full max-w-md"
    >
      <p className="catalogue text-vermilion dark:text-vermilionBright mb-3 flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-vermilion dark:bg-vermilionBright rounded-full" aria-hidden />
        Admin sign in
      </p>
      <h1 className="font-display text-[40px] sm:text-[48px] leading-[0.98] tracking-tightest text-ink mb-3">
        Speak the{' '}
        <span className="italic text-ink/85">pass-word</span>.
      </h1>
      <p className="font-sans text-[15px] leading-[1.6] text-inkMuted mb-8">
        Only the administrator of this archive may pass. Five wrong
        attempts and the door is held shut for a minute.
      </p>

      <form onSubmit={onSubmit} className="space-y-5">
        <Input
          ref={inputRef}
          type="password"
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={submitting}
        />

        <div className="flex items-center justify-between gap-4">
          <p className="catalogue text-inkMuted">
            {cooldown > 0
              ? `Locked for ${cooldown}s`
              : 'Five attempts per minute.'}
          </p>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={submitting || cooldown > 0 || !password}
          >
            {submitting ? 'Opening…' : 'Enter'}
          </Button>
        </div>
      </form>

      <p className="mt-10 font-display italic text-[14px] text-inkMuted">
        &ldquo;A library is a community of texts in conversation. The curator
        keeps the room.&rdquo;
      </p>
    </motion.div>
  );
}