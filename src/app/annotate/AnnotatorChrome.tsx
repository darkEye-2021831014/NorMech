'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface Props {
  name: string;
  accessKey: string;
  annotated: number;
  total: number;
}

export function AnnotatorChrome({ name, accessKey, annotated, total }: Props) {
  const router = useRouter();
  const { push } = useToast();
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      const res = await fetch('/api/annotate/logout', { method: 'POST' });
      if (!res.ok) throw new Error('Sign-out failed.');
      push('info', 'Signed out.');
      router.push('/annotate/login');
      router.refresh();
    } catch (e) {
      push('error', e instanceof Error ? e.message : 'Sign-out failed.');
      setSigningOut(false);
    }
  };

  return (
    <header className="border-b border-ink/15 relative z-10">
      <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <span className="catalogue">M.A.</span>
          <span className="hidden sm:inline-block w-12 h-px bg-ink/30" aria-hidden />
          <span className="catalogue text-vermilion">— Annotator</span>
        </div>
        <div className="flex items-center gap-3 sm:gap-5 min-w-0">
          <div className="hidden md:flex items-center gap-3 min-w-0">
            <span className="font-display italic text-[14px] text-ink/85 truncate max-w-[160px]">
              {name}
            </span>
            <span className="font-mono text-[11px] tracking-widerish text-inkMuted">
              {accessKey}
            </span>
          </div>
          <span className="font-mono text-[12px] text-ink tabular-nums">
            {annotated.toLocaleString()} / {total.toLocaleString()}
          </span>
          <button
            onClick={onSignOut}
            disabled={signingOut}
            aria-label="Sign out"
            className="btn-touch inline-flex items-center gap-1.5 h-9 px-3 border border-ink/30 hover:border-ink text-ink font-mono uppercase tracking-widerish text-[10px] rounded-sm transition-colors"
          >
            <LogOut size={12} strokeWidth={1.5} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
