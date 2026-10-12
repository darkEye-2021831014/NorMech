import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, UnauthorizedError } from '@/lib/admin-auth';
import { getDatasetDetail, deleteDataset } from '@/lib/admin-actions';
import { uuid } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
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

  try {
    const detail = await getDatasetDetail(id);
    if (!detail) {
      return NextResponse.json({ error: 'Dataset not found.' }, { status: 404 });
    }
    return NextResponse.json({ detail });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load dataset.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

  try {
    const removed = await deleteDataset(id);
    if (!removed) {
      return NextResponse.json({ error: 'Dataset not found.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete dataset.' },
      { status: 500 }
    );
  }
}
