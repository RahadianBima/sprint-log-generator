import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const getJwtSecret = () => new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret-do-not-use-in-prod');

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow auth routes and static files
  if (
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // For API routes (jira, confluence, anthropic), require valid session
  if (pathname.startsWith('/api/')) {
    const sessionCookie = request.cookies.get('session')?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      await jwtVerify(sessionCookie, getJwtSecret());
      return NextResponse.next();
    } catch {
      return NextResponse.json({ error: 'Session invalid' }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
