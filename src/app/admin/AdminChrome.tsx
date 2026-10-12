'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { siteName, tagline } from '@/config/brand';
import { useToast } from '@/components/ui/Toast';

export function AdminChrome() {
  const router = useRouter();
  const { push } = useToast();
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      const res = await fetch('/api/admin/logout', { method: 'POST' });
      if (!res.ok) throw new Error('Sign-out failed.');
      push('info', 'Signed out.');
      router.push('/admin/login');
      router.refresh();
    } catch (e) {
      push('error', e instanceof Error ? e.message : 'Sign-out failed.');
      setSigningOut(false);
    }
  };

  return (
    <header className="border-b border-ink/15 relative z-10">
      <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <Logo size={20} className="text-ink shrink-0" />
          <span className="font-display text-[15px] leading-none tracking-tightish text-ink truncate">
            {siteName}
          </span>
          <span
            className="hidden min-[900px]:inline-block font-mono text-[10.5px] tracking-widerish text-inkMuted whitespace-nowrap"
            title={tagline}
          >
            — {tagline}
          </span>
          <span className="hidden sm:inline-block w-3 h-px bg-ink/20" aria-hidden />
          <span className="catalogue text-vermilion dark:text-vermilionBright">— Administrator</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            onClick={onSignOut}
            disabled={signingOut}
            aria-label="Sign out"
            className="btn-touch inline-flex items-center gap-2 h-11 px-3 border border-ink/30 hover:border-ink text-ink font-mono uppercase tracking-widerish text-[11px] rounded-sm transition-colors"
          >
            <LogOut size={14} strokeWidth={1.5} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
