import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, UnauthorizedError } from '@/lib/require-user';
import { upsertAnnotation } from '@/lib/annotator-actions';
import { harmSource, parseJson, uuid } from '@/lib/validation';

export const runtime = 'nodejs';

const upsertSchema = z.object({
  imageId: uuid,
  harmSource,
});

export async function PUT(req: NextRequest) {
  let session;
  try {
    session = await requireUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw e;
  }

  if (!session.datasetId) {
    return NextResponse.json({ error: 'Session is missing dataset.' }, { status: 400 });
  }

  const parsed = await parseJson(req, upsertSchema);
  if (!parsed.ok) return NextResponse.json(parsed.response.body, { status: parsed.response.status });
  const { imageId, harmSource: hs } = parsed.data;

  try {
    const result = await upsertAnnotation({
      userId: session.sub,
      imageId,
      datasetId: session.datasetId,
      harmSource: hs,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Save failed.' },
      { status: 400 }
    );
  }
}
