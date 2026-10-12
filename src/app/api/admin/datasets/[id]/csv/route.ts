import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, UnauthorizedError } from '@/lib/admin-auth';
import {
  buildDatasetCombinedCsv,
  readAllAnnotationsForDataset,
} from '@/lib/admin-actions';
import { getDataset } from '@/lib/admin-actions';
import { contentDisposition, sanitizeForFilename } from '@/lib/csv';
import { parseQuery, uuid } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  includeEmpty: z.enum(['0', '1']).optional(),
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

  const idParse = uuid.safeParse(params.id);
  if (!idParse.success) {
    return NextResponse.json({ error: 'Invalid dataset id.' }, { status: 400 });
  }
  const id = idParse.data;

  const q = parseQuery(querySchema, req.nextUrl.searchParams);
  if (!q.ok) return NextResponse.json(q.response.body, { status: q.response.status });
  const includeEmpty = q.data.includeEmpty === '1';

  try {
    const dataset = await getDataset(id);
    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found.' }, { status: 404 });
    }
    const rows = await readAllAnnotationsForDataset(id);
    // Stamp access key on every row.
    for (const r of rows) r.accessKey = dataset.access_key;
    const body = buildDatasetCombinedCsv(rows, includeEmpty);
    const dsName = sanitizeForFilename(dataset.name);
    const key = sanitizeForFilename(dataset.access_key);
    const fname = `${dsName}_${key}_all-users${includeEmpty ? '_including-empty' : ''}.csv`;
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
