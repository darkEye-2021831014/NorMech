// Liveness + database keepalive endpoint.
//
// Supabase pauses free-tier projects after ~7 days of database
// inactivity — Vercel traffic alone doesn't count, only Postgres
// queries. The plan is to ping this endpoint from UptimeRobot (free
// tier, 5-minute minimum interval); the trivial Supabase query below
// keeps the project warm.
//
// The route is intentionally public: the middleware matcher
// (src/middleware.ts) does not include /api/health, so no session
// cookie is required. UptimeRobot does not send one.
//
// Response shape:
//   200 { ok: true,  db: 'ok',          latencyMs: N, version: '0.1.0' }
//   503 { ok: false, db: 'error',       latencyMs: N, version: ..., message: ... }
//   503 { ok: false, db: 'unreachable', latencyMs: N, version: ..., message: ... }
//
// 503 (rather than 500) is the right code for "service degraded but
// process alive" — UptimeRobot's free monitor can alert on non-2xx.

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();
  try {
    const supabase = getSupabaseAdmin();
    // `head: true` returns only the row count, not the row data —
    // cheapest possible read. We select from `datasets` because
    // every project has at least one and it's RLS-permissive via
    // the service-role key.
    const { error } = await supabase
      .from('datasets')
      .select('id', { count: 'exact', head: true })
      .limit(1);
    const latencyMs = Date.now() - started;
    const version = process.env.npm_package_version ?? '0.0.0';
    if (error) {
      return NextResponse.json(
        {
          ok: false,
          db: 'error',
          latencyMs,
          message: error.message,
          version,
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        ok: true,
        db: 'ok',
        latencyMs,
        version,
      },
      {
        status: 200,
        // A CDN-cached 200 would mask a Supabase outage for the
        // cache window. Force the route to re-run every time.
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (e) {
    // getSupabaseAdmin() throws synchronously if SUPABASE_URL or
    // SUPABASE_SERVICE_ROLE_KEY are missing — the build would
    // succeed, but the deployed process would 500 here.
    return NextResponse.json(
      {
        ok: false,
        db: 'unreachable',
        latencyMs: Date.now() - started,
        message: e instanceof Error ? e.message : 'unknown error',
        version: process.env.npm_package_version ?? '0.0.0',
      },
      { status: 503 }
    );
  }
}
