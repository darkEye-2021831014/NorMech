import { listDatasetsWithCounts } from '@/lib/admin-actions';
import { DashboardClient } from './DashboardClient';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  let initialDatasets: Awaited<ReturnType<typeof listDatasetsWithCounts>> = [];
  let loadError: string | null = null;

  try {
    initialDatasets = await listDatasetsWithCounts();
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Failed to load datasets.';
  }

  return <DashboardClient initialDatasets={initialDatasets} initialError={loadError} />;
}
