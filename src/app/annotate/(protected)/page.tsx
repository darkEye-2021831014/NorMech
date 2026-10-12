import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { loadAnnotatorState } from '@/lib/annotator-actions';
import { AnnotatorClient } from './AnnotatorClient';

export const dynamic = 'force-dynamic';

export default async function AnnotatorDashboardPage() {
  const session = await getSession();
  if (!session || session.role !== 'user' || !session.datasetId) {
    redirect('/annotate/login');
  }

  const state = await loadAnnotatorState(session.sub, session.datasetId);

  // Resume at the first unannotated image. If everything is done, the
  // client renders the completion screen.
  const startIndex =
    state.firstUnannotatedIndex >= 0 ? state.firstUnannotatedIndex : 0;

  return (
    <AnnotatorClient
      datasetName={state.dataset.name}
      userName={session.name ?? 'Reader'}
      images={state.images}
      initialAnnotations={state.annotations}
      startIndex={startIndex}
    />
  );
}
