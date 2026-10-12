import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import JSZip from 'jszip';
import { requireAdmin, UnauthorizedError } from '@/lib/admin-auth';
import {
  buildDatasetCombinedCsv,
  readAllAnnotationsForDataset,
  readUserAnnotationsForCsv,
  userCsvFilename,
  CombinedRow,
} from '@/lib/admin-actions';
import { getDataset } from '@/lib/admin-actions';
import { getSupabaseAdmin } from '@/lib/supabase';
import { buildCsv, contentDisposition, sanitizeForFilename } from '@/lib/csv';
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

    const supabase = getSupabaseAdmin();
    const [usersRes, allRows] = await Promise.all([
      supabase
        .from('users')
        .select('id, name')
        .eq('dataset_id', id)
        .order('created_at', { ascending: true }),
      readAllAnnotationsForDataset(id),
    ]);
    if (usersRes.error) throw new Error(`User list failed: ${usersRes.error.message}`);
    const users = (usersRes.data ?? []) as { id: string; name: string }[];

    // Build per-user CSV bodies in parallel.
    const perUser = await Promise.all(
      users.map(async (u) => ({
        name: u.name,
        csv: buildCsv(
          ['imageName', 'harmSource'],
          (await readUserAnnotationsForCsv(u.id, id)).map((r) => [
            r.fileName,
            r.harmSource,
          ])
        ),
      }))
    );

    // Stamp access key on every combined row, then build the combined CSV.
    const stamped: CombinedRow[] = allRows.map((r) => ({
      ...r,
      accessKey: dataset.access_key,
    }));
    const combined = buildDatasetCombinedCsv(stamped, includeEmpty);

    const zip = new JSZip();
    for (const u of perUser) {
      zip.file(userCsvFilename(u.name, dataset.access_key), u.csv);
    }
    const combinedName = `${sanitizeForFilename(dataset.name)}_${sanitizeForFilename(
      dataset.access_key
    )}_all-users${includeEmpty ? '_including-empty' : ''}.csv`;
    zip.file(combinedName, combined);

    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    // NextResponse wants a BodyInit; pass a fresh Uint8Array view so
    // the lib.dom Buffer<ArrayBufferLike> doesn't trip the type check.
    const body = new Uint8Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength
    );

    const zipName = `${sanitizeForFilename(dataset.name)}_${sanitizeForFilename(
      dataset.access_key
    )}_users.zip`;
    return new NextResponse(body as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(body.byteLength),
        'Content-Disposition': contentDisposition(zipName, zipName),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to build ZIP.' },
      { status: 500 }
    );
  }
}
