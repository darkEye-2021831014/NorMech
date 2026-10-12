/**
 * In-memory IP rate limiter.
 *
 * Per-process. State is lost on restart. Fine for the admin login form,
 * which is single-operator and tolerates a dev-restart. For multi-instance
 * production, swap for a Redis-backed limiter.
 */

type Bucket = number[]; // timestamps (ms) of recent hits

const store: Map<string, Bucket> = new Map();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const bucket = store.get(key) ?? [];

  // Drop expired entries.
  const fresh = bucket.filter((t) => t > cutoff);

  if (fresh.length >= limit) {
    const earliest = fresh[0];
    const retryAfterMs = Math.max(0, earliest + windowMs - now);
    store.set(key, fresh);
    return { ok: false, remaining: 0, retryAfterMs };
  }

  fresh.push(now);
  store.set(key, fresh);

  // Opportunistic GC: if a key is now empty, drop it.
  if (fresh.length === 0) store.delete(key);

  return { ok: true, remaining: limit - fresh.length, retryAfterMs: 0 };
}

/** Best-effort client IP extraction. Returns "unknown" in dev if headers are missing. */
export function getClientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    // First entry is the original client.
    return xff.split(',')[0]!.trim();
  }
  const xri = headers.get('x-real-ip');
  if (xri) return xri.trim();
  return 'unknown';
}
