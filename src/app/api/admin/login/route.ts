import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { signSession, setSessionCookie } from '@/lib/session';
import { parseJson } from '@/lib/validation';

export const runtime = 'nodejs';

const LIMIT = 5;
const WINDOW_MS = 60_000;

const loginSchema = z.object({
  password: z.string().min(1).max(1024),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const rl = checkRateLimit(`admin-login:${ip}`, { limit: LIMIT, windowMs: WINDOW_MS });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again shortly.', retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } }
    );
  }

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: 'Server is missing ADMIN_PASSWORD. Set it in .env.local.' },
      { status: 500 }
    );
  }

  const parsed = await parseJson(req, loginSchema);
  if (!parsed.ok) return NextResponse.json(parsed.response.body, { status: parsed.response.status });
  const submitted = parsed.data.password;

  // Constant-time compare, with a length-mismatch short-circuit.
  // (timingSafeEqual throws if lengths differ; we want to avoid leaking
  // that detail by handling it ourselves.)
  const expectedBuf = Buffer.from(expected, 'utf8');
  const submittedBuf = Buffer.from(submitted, 'utf8');

  let ok = false;
  if (expectedBuf.length === submittedBuf.length) {
    ok = timingSafeEqual(submittedBuf, expectedBuf);
  } else {
    // Run a dummy compare of equal-length buffers to keep timing roughly
    // independent of submitted length.
    const padded = Buffer.alloc(expectedBuf.length, 0);
    timingSafeEqual(padded, expectedBuf);
    ok = false;
  }

  if (!ok) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  const token = await signSession({ sub: 'admin', role: 'admin' });
  await setSessionCookie(token);

  return NextResponse.json({ ok: true });
}
