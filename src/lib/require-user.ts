import 'server-only';
import { getSession, SessionPayload } from './session';

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Server-side guard for annotator API routes.
 * Throws UnauthorizedError if the request has no user session.
 */
export async function requireUser(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s || s.role !== 'user') {
    throw new UnauthorizedError();
  }
  return s;
}
