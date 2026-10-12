import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminLoginForm } from './LoginForm';

// Server component. If the visitor is already signed in, skip the
// form and go straight to the dashboard. `force-dynamic` ensures the
// session is read on every request.
export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  const session = await getSession();
  if (session?.role === 'admin') {
    redirect('/admin');
  }

  return (
    <main className="min-h-screen relative flex flex-col">
      <header className="border-b border-ink/15">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="catalogue">M.A.</span>
            <span className="hidden sm:inline-block w-12 h-px bg-ink/30" aria-hidden />
            <span className="catalogue text-vermilion dark:text-vermilionBright">— Administrator</span>
          </div>
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
        <AdminLoginForm />
      </section>

      <footer className="border-t border-ink/15">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-4 flex items-center justify-between">
          <p className="catalogue text-inkMuted">Admin sign in</p>
          <p className="catalogue text-inkMuted">MMXXVI</p>
        </div>
      </footer>
    </main>
  );
}