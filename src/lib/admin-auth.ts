import 'server-only';
import { getSession, SessionPayload } from './session';

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Server-side guard for admin API routes.
 * Throws UnauthorizedError if the request has no admin session.
 */
export async function requireAdmin(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s || s.role !== 'admin') {
    throw new UnauthorizedError();
  }
  return s;
}
