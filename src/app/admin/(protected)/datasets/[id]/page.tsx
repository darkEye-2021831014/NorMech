import { redirect } from 'next/navigation';
import { requireAdmin, UnauthorizedError } from '@/lib/admin-auth';
import { getDatasetDetail, DatasetDetail } from '@/lib/admin-actions';
import { DatasetDetailClient } from './DatasetDetailClient';

export const dynamic = 'force-dynamic';

export default async function DatasetDetailPage({
  params,
}: {
  params: { id: string };
}) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect('/admin/login');
    throw e;
  }

  let detail: DatasetDetail | null = null;
  let loadError: string | null = null;

  try {
    detail = await getDatasetDetail(params.id);
    if (!detail) loadError = 'Dataset not found.';
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'Failed to load dataset.';
  }

  if (!detail) {
    return (
      <section className="max-w-[1280px] mx-auto px-6 md:px-10 py-16">
        <p className="font-display text-[28px] tracking-tightest text-ink mb-4">
          {loadError ?? 'Not found.'}
        </p>
      </section>
    );
  }

  return (
    <DatasetDetailClient
      datasetId={detail.dataset.id}
      datasetName={detail.dataset.name}
      accessKey={detail.dataset.access_key}
      createdAt={detail.dataset.created_at}
      imageCount={detail.imageCount}
      users={detail.users}
      overview={detail.overview}
    />
  );
}