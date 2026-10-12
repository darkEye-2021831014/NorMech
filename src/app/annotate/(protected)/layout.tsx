import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getDataset } from '@/lib/admin-actions';
import { loadAnnotatorState } from '@/lib/annotator-actions';
import { AnnotatorChrome } from '../AnnotatorChrome';

export default async function ProtectedAnnotateLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Middleware already protects this route, but defense-in-depth: also
  // check the session here. A stale cookie for a different role or
  // dataset won't leak through.
  const session = await getSession();
  if (!session || session.role !== 'user' || !session.datasetId || !session.name) {
    redirect('/annotate/login');
  }

  // Load just enough for the chrome (counts). Done on the server so the
  // header is correct on first paint — no flicker.
  const [dataset, state] = await Promise.all([
    getDataset(session.datasetId),
    loadAnnotatorState(session.sub, session.datasetId).catch(() => null),
  ]);
  if (!dataset) redirect('/annotate/login');

  const annotated = state ? Object.keys(state.annotations).length : 0;
  const total = state ? state.images.length : 0;

  return (
    <>
      <AnnotatorChrome
        name={session.name}
        accessKey={dataset.access_key}
        annotated={annotated}
        total={total}
      />
      <div className="relative z-10">{children}</div>
    </>
  );
}
