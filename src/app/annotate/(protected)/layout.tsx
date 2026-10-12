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
    <div className="min-h-dvh flex flex-col">
      <AnnotatorChrome
        name={session.name}
        accessKey={dataset.access_key}
        annotated={annotated}
        total={total}
        // Always-available download button once at least one
        // annotation exists. (The dedicated completion banner in
        // the right panel also offers it; this is the always-on
        // chrome affordance for early-arriving users.)
        showDownloadButton={annotated > 0}
      />
      <div className="relative z-10 flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}
