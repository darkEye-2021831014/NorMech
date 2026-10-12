import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, UnauthorizedError } from '@/lib/admin-auth';
import { getUserAnnotations } from '@/lib/admin-actions';
import { annotationFilter, parseQuery, uuid } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  datasetId: uuid,
  filter: annotationFilter.default('all'),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(200),
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

  try {
    const result = await getUserAnnotations({
      userId,
      datasetId: q.data.datasetId,
      filter: q.data.filter,
      search: q.data.q ?? '',
      page: q.data.page,
      pageSize: q.data.pageSize,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load annotations.' },
      { status: 500 }
    );
  }
}
