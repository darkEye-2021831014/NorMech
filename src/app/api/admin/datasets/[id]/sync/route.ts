import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, UnauthorizedError } from '@/lib/admin-auth';
import { getDataset, resyncDataset } from '@/lib/admin-actions';
import {
  fetchDriveImages,
  PrivateFolderError,
  FolderNotFoundError,
} from '@/lib/drive';
import { uuid } from '@/lib/validation';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw e;
  }

  const idParse = uuid.safeParse(params.id);
  if (!idParse.success) {
    return NextResponse.json({ error: 'Invalid dataset id.' }, { status: 400 });
  }
  const id = idParse.data;

  const ds = await getDataset(id).catch(() => null);
  if (!ds) {
    return NextResponse.json({ error: 'Dataset not found.' }, { status: 404 });
  }
  if (!ds.folder_id) {
    return NextResponse.json(
      { error: 'This dataset was created from a manual list and cannot be re-synced from Drive.' },
      { status: 422 }
    );
  }

  try {
    const result = await resyncDataset(id, ds.folder_id, () =>
      fetchDriveImages(ds.folder_id)
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof PrivateFolderError || err instanceof FolderNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Re-sync failed.' },
      { status: 500 }
    );
  }
}
