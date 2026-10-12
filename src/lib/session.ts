import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export type Role = 'admin' | 'user';

export interface SessionPayload {
  sub: string; // user id (or "admin" for admin role)
  role: Role;
  datasetId?: string; // present for user role
  name?: string; // present for user role
  iat?: number;
  exp?: number;
}

const COOKIE_NAME = 'ma_session';
const ALG = 'HS256';

function getSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      'SESSION_SECRET must be set and at least 16 characters long.'
    );
  }
  return new TextEncoder().encode(s);
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  };
}

export async function signSession(payload: Omit<SessionPayload, 'iat' | 'exp'>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt(now)
    .setExpirationTime('7d')
    .setSubject(payload.sub)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
    if (!payload.role || (payload.role !== 'admin' && payload.role !== 'user')) {
      return null;
    }
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function setSessionCookie(token: string) {
  const store = cookies();
  store.set(COOKIE_NAME, token, cookieOptions());
}

export async function clearSessionCookie() {
  const store = cookies();
  store.set(COOKIE_NAME, '', { ...cookieOptions(), maxAge: 0 });
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
