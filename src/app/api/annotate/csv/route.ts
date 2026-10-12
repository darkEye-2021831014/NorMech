import { NextResponse } from 'next/server';
import { requireUser, UnauthorizedError } from '@/lib/require-user';
import { getCsvForUser, HarmSource } from '@/lib/annotator-actions';
import { getDataset } from '@/lib/admin-actions';
import { buildCsv, contentDisposition, sanitizeForFilename } from '@/lib/csv';

export const runtime = 'nodejs';

export async function GET() {
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

  const [dataset, rows] = await Promise.all([
    getDataset(session.datasetId),
    getCsvForUser(session.sub, session.datasetId),
  ]);
  if (!dataset) {
    return NextResponse.json({ error: 'Dataset not found.' }, { status: 404 });
  }

  const body = buildCsv(
    ['imageName', 'harmSource'],
    rows.map((r) => [r.fileName, r.harmSource as HarmSource])
  );

  const namePart = sanitizeForFilename(session.name ?? 'annotator');
  const keyPart = sanitizeForFilename(dataset.access_key);
  const fname = `${namePart}_${keyPart}.csv`;
  const disposition = contentDisposition(fname, fname);

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': disposition,
      'Cache-Control': 'no-store',
    },
  });
}