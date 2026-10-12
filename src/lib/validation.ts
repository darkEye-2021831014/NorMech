// Shared zod schemas for API input validation. Centralized so the
// rules (uuid shapes, harm-source enums, max string lengths) live in
// one place and the routes stay small.

import { z } from 'zod';

export const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'must be a UUID',
  });

export const harmSource = z.enum(['text', 'image', 'both', 'none']);

export const annotationFilter = z.union([
  z.literal('all'),
  z.literal('unannotated'),
  harmSource,
]);

/**
 * Small helper for route handlers. Parses with zod and returns either
 * `{ ok: true, data }` or `{ ok: false, response }` — the caller can
 * short-circuit with a 400 if validation fails.
 */
export function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown
):
  | { ok: true; data: z.infer<T> }
  | { ok: false; response: { status: number; body: { error: string } } } {
  const r = schema.safeParse(body);
  if (!r.success) {
    const first = r.error.issues[0];
    return {
      ok: false,
      response: {
        status: 400,
        body: {
          error: first
            ? `${first.path.join('.') || 'body'}: ${first.message}`
            : 'Invalid request body.',
        },
      },
    };
  }
  return { ok: true, data: r.data };
}

export function parseQuery<T extends z.ZodTypeAny>(
  schema: T,
  search: string | URLSearchParams
):
  | { ok: true; data: z.infer<T> }
  | { ok: false; response: { status: number; body: { error: string } } } {
  const sp = typeof search === 'string' ? new URLSearchParams(search) : search;
  const obj: Record<string, string> = {};
  for (const [k, v] of sp.entries()) obj[k] = v;
  const r = schema.safeParse(obj);
  if (!r.success) {
    const first = r.error.issues[0];
    return {
      ok: false,
      response: {
        status: 400,
        body: {
          error: first
            ? `${first.path.join('.') || 'query'}: ${first.message}`
            : 'Invalid query string.',
        },
      },
    };
  }
  return { ok: true, data: r.data };
}

export async function parseJson<T extends z.ZodTypeAny>(
  req: Request,
  schema: T
): Promise<
  | { ok: true; data: z.infer<T> }
  | { ok: false; response: { status: number; body: { error: string } } }
> {
  let body: unknown;
  try {
    body = await req.clone().json();
  } catch {
    return {
      ok: false,
      response: { status: 400, body: { error: 'Invalid JSON body.' } },
    };
  }
  return parseBody(schema, body);
}