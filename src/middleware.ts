import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'ma_session';
const ALG = 'HS256';

type Role = 'admin' | 'user';

function getSecret(): Uint8Array | null {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) return null;
  return new TextEncoder().encode(s);
}

function getRole(payload: unknown): Role | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as { role?: unknown };
  return p.role === 'admin' || p.role === 'user' ? p.role : null;
}

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

function isLoginBypass(pathname: string, prefix: string): boolean {
  return pathname === prefix + '/login' || pathname === '/api' + prefix + '/login';
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminArea =
    isUnder(pathname, '/admin') || isUnder(pathname, '/api/admin');
  const isAnnotatorArea =
    isUnder(pathname, '/annotate') || isUnder(pathname, '/api/annotate');
  const isImageProxy = isUnder(pathname, '/api/image');

  if (!isAdminArea && !isAnnotatorArea && !isImageProxy) {
    return NextResponse.next();
  }

  // Login endpoints always pass through.
  if (isAdminArea && isLoginBypass(pathname, '/admin')) {
    return NextResponse.next();
  }
  if (isAnnotatorArea && isLoginBypass(pathname, '/annotate')) {
    return NextResponse.next();
  }

  // Both admin and annotator roles can fetch the image proxy.
  const requiredRole: Role | null = isImageProxy ? null : isAdminArea ? 'admin' : 'user';
  const loginPath = isAdminArea ? '/admin/login' : '/annotate/login';

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = getSecret();

  if (!token || !secret) {
    return deny(req, loginPath);
  }

  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALG] });
    const role = getRole(payload);
    if (requiredRole === null) {
      // Image proxy: any authenticated role is fine.
      if (role !== 'admin' && role !== 'user') return deny(req, loginPath);
    } else {
      if (role !== requiredRole) return deny(req, loginPath);
    }
  } catch {
    return deny(req, loginPath);
  }

  return NextResponse.next();
}

function deny(req: NextRequest, loginPath: string): NextResponse {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = loginPath;
  return NextResponse.redirect(url);
}

export const config = {
  // Protect /admin, /annotate, and all their API counterparts. Login
  // pages are bypassed explicitly inside the handler.
  matcher: [
    '/admin',
    '/admin/:path*',
    '/api/admin',
    '/api/admin/:path*',
    '/annotate',
    '/annotate/:path*',
    '/api/annotate',
    '/api/annotate/:path*',
    '/api/image',
    '/api/image/:path*',
  ],
};
