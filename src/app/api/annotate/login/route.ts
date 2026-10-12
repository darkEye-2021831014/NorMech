import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { setSessionCookie, signSession } from '@/lib/session';
import {
  findDatasetByAccessKey,
  getOrCreateUser,
  normalizeAccessKey,
  normalizeName,
} from '@/lib/annotator-actions';
import { parseJson } from '@/lib/validation';

export const runtime = 'nodejs';

// 10/min per (key, ip) — generous since the resume flow may retry.
const LIMIT = 10;
const WINDOW_MS = 60_000;

const loginSchema = z.object({
  name: z.string().min(1).max(200),
  accessKey: z.string().min(1).max(64),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);

  const parsed = await parseJson(req, loginSchema);
  if (!parsed.ok) return NextResponse.json(parsed.response.body, { status: parsed.response.status });
  const accessKey = normalizeAccessKey(parsed.data.accessKey);
  const name = normalizeName(parsed.data.name);

  if (!accessKey) {
    return NextResponse.json({ error: 'Access key is required.' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'Your name is required.' }, { status: 400 });
  }

  const rl = checkRateLimit(`annotate-login:${accessKey}:${ip}`, {
    limit: LIMIT,
    windowMs: WINDOW_MS,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again shortly.', retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } }
    );
  }

  // We always give the same generic error whether the key or the name is
  // wrong — never reveal which one. If the dataset is missing, the user
  // doesn't exist; same response.
  const GENERIC = "We couldn't find that name and key together.";

  try {
    const dataset = await findDatasetByAccessKey(accessKey);
    if (!dataset) {
      return NextResponse.json({ error: GENERIC }, { status: 401 });
    }
    const user = await getOrCreateUser(dataset.id, name);
    const token = await signSession({
      sub: user.id,
      role: 'user',
      datasetId: dataset.id,
      name: user.name,
    });
    await setSessionCookie(token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // If anything inside throws (DB error etc), also use a generic
    // message — the user shouldn't see internals.
    console.error('annotate login error', err);
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  }
}
