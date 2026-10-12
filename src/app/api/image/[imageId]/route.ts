// Server-side proxy for Drive-hosted images. The annotator UI fetches
// /api/image/{imageId}; we look up the file_id, fetch the bytes from
// Drive (with source fallback), validate content-type and size, and
// stream them back with caching headers.
//
// Auth: any valid session cookie (admin or user role) is accepted.
// The middleware enforces this for /api/image/*.

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { uuid } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const FETCH_TIMEOUT_MS = 8_000;

const SOURCES = [
  (id: string) => `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w1600`,
  (id: string) => `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w1200`,
  (id: string) =>
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=view`,
];

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

function bytesToReadable(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

async function fetchWithCap(url: string): Promise<{
  buffer: ArrayBuffer;
  contentType: string;
  source: string;
} | null> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.has(ct)) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null;
    return { buffer: buf, contentType: ct, source: url };
  } catch {
    return null;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { imageId: string } }
) {
  const imageIdParse = uuid.safeParse(params.imageId);
  if (!imageIdParse.success) {
    return NextResponse.json({ error: 'bad imageId' }, { status: 400 });
  }
  const imageId = imageIdParse.data;

  const supabase = getSupabaseAdmin();
  const { data: row, error } = await supabase
    .from('images')
    .select('file_id')
    .eq('id', imageId)
    .maybeSingle();

  if (error || !row?.file_id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  let fetchedBytes: ArrayBuffer | null = null;
  let fetchedType = '';
  for (const build of SOURCES) {
    const result = await fetchWithCap(build(row.file_id));
    if (result) {
      fetchedBytes = result.buffer;
      fetchedType = result.contentType;
      break;
    }
  }

  if (!fetchedBytes) {
    // Return a tiny placeholder so the UI's onError path stays in
    // charge of the error UI (no leak of fetch internals).
    return NextResponse.json(
      { error: 'upstream unavailable' },
      { status: 502 }
    );
  }

  const etag =
    '"' +
    createHash('sha1').update(new Uint8Array(fetchedBytes)).digest('hex') +
    '"';

  // ETag revalidation
  const ifNoneMatch = _req.headers.get('if-none-match');
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new NextResponse(null, { status: 304 });
  }

  const sizeBytes = fetchedBytes.byteLength;
  return new NextResponse(fetchedBytes, {
    status: 200,
    headers: {
      'Content-Type': fetchedType || 'image/jpeg',
      'Content-Length': String(sizeBytes),
      'Cache-Control': 'private, max-age=86400, must-revalidate',
      ETag: etag,
      'X-Image-Size': bytesToReadable(sizeBytes),
    },
  });
}