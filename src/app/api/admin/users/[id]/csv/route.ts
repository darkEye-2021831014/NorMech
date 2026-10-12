import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, UnauthorizedError } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  buildUserCsv,
  readUserAnnotationsForCsv,
  userCsvFilename,
} from '@/lib/admin-actions';
import { contentDisposition } from '@/lib/csv';
import { parseQuery, uuid } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  datasetId: uuid,
});

export async function GET(
  req: NextRequest,
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

  const userIdParse = uuid.safeParse(params.id);
  if (!userIdParse.success) {
    return NextResponse.json({ error: 'Invalid user id.' }, { status: 400 });
  }
  const userId = userIdParse.data;

  const q = parseQuery(querySchema, req.nextUrl.searchParams);
  if (!q.ok) return NextResponse.json(q.response.body, { status: q.response.status });
  const datasetId = q.data.datasetId;

  try {
    const supabase = getSupabaseAdmin();
    const { data: user, error: uErr } = await supabase
      .from('users')
      .select('id, name, dataset_id')
      .eq('id', userId)
      .maybeSingle();
    if (uErr) throw new Error(`User lookup failed: ${uErr.message}`);
    if (!user || user.dataset_id !== datasetId) {
      return NextResponse.json({ error: 'User not in this dataset.' }, { status: 404 });
    }
    const { data: ds, error: dErr } = await supabase
      .from('datasets')
      .select('access_key')
      .eq('id', datasetId)
      .maybeSingle();
    if (dErr) throw new Error(`Dataset lookup failed: ${dErr.message}`);
    if (!ds) {
      return NextResponse.json({ error: 'Dataset not found.' }, { status: 404 });
    }

    const rows = await readUserAnnotationsForCsv(userId, datasetId);
    const body = buildUserCsv(rows);
    const fname = userCsvFilename(user.name, ds.access_key);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': contentDisposition(fname, fname),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to build CSV.' },
      { status: 500 }
    );
  }
}
