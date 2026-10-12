import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { AdminChrome } from '../AdminChrome';

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  // Middleware guards this, but we also check here so a stale or non-admin
  // cookie can never leak past a code change.
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    redirect('/admin/login');
  }

  return (
    <>
      <AdminChrome />
      <div className="relative z-10">{children}</div>
    </>
  );
}
