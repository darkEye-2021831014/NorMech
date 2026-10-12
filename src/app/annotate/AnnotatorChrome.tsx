'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Download, LogOut } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { siteName, expandedName, tagline } from '@/config/brand';
import { useToast } from '@/components/ui/Toast';

interface Props {
  name: string;
  accessKey: string;
  annotated: number;
  total: number;
  /** Show the always-available Download CSV icon button. */
  showDownloadButton?: boolean;
}

export function AnnotatorChrome({
  name,
  accessKey,
  annotated,
  total,
  showDownloadButton = false,
}: Props) {
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
          <Logo size={20} className="text-ink shrink-0" />
          <span className="font-display text-[15px] leading-none tracking-tightish text-ink truncate">
            {siteName}
          </span>
          {/* The expanded form of the name, shown only when the
              top bar has room. Hidden below 900px so it never
              truncates awkwardly on a narrow window. */}
          <span
            className="hidden min-[900px]:inline-block font-mono text-[10.5px] tracking-widerish text-inkMuted whitespace-nowrap"
            title={expandedName}
          >
            — {tagline}
          </span>
          <span className="hidden sm:inline-block w-3 h-px bg-ink/20" aria-hidden />
          <span className="catalogue text-vermilion dark:text-vermilionBright">— Annotator</span>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
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
          {showDownloadButton && (
            <a
              href="/api/annotate/csv"
              download
              title="Download my CSV so far"
              aria-label="Download my CSV so far"
              className="btn-touch inline-flex items-center justify-center w-9 h-9 border border-ink/30 hover:border-ink text-ink rounded-sm transition-colors"
            >
              <Download size={13} strokeWidth={1.5} />
            </a>
          )}
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
