import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/session';
import { Logo } from '@/components/Logo';
import { siteName, tagline } from '@/config/brand';
import { AnnotateLoginForm } from './LoginForm';

// Server component. If the visitor is already signed in, skip the
// form and go straight to the dashboard. `force-dynamic` ensures the
// session is read on every request.
export const dynamic = 'force-dynamic';

export default async function AnnotateLoginPage() {
  const session = await getSession();
  if (session?.role === 'user' && session.datasetId) {
    redirect('/annotate');
  }

  return (
    <main className="min-h-screen relative flex flex-col">
      <header className="border-b border-ink/15">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-3 flex items-center justify-between">
          <Link
            href="/"
            prefetch={false}
            className="inline-flex items-center gap-2.5 min-w-0"
            aria-label={`${siteName} home`}
          >
            <Logo size={18} className="text-ink shrink-0" />
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
            <span className="catalogue text-vermilion dark:text-vermilionBright">— Annotator</span>
          </Link>
          <Link
            href="/"
            prefetch={false}
            className="btn-touch inline-flex items-center gap-1.5 catalogue text-inkMuted hover:text-ink"
          >
            <ArrowLeft size={12} strokeWidth={1.5} />
            <span>Back to the title page</span>
          </Link>
        </div>
      </header>

      <section className="flex-1 flex items-center justify-center px-6 py-16">
        <AnnotateLoginForm />
      </section>

      <footer className="border-t border-ink/15">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-4 flex items-center justify-between">
          <p className="font-mono text-[10.5px] tracking-widerish text-inkMuted">
            {siteName} · for research use
          </p>
          <p className="catalogue text-inkMuted">Annotator sign in</p>
        </div>
      </footer>
    </main>
  );
}
