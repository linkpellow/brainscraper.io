import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SITE_PASSWORD = process.env.SITE_PASSWORD || 'scrapegoat2026';
const AUTH_COOKIE_NAME = 'site-auth';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public access to login page, API routes, and temp image serving
  if (pathname === '/login' || pathname.startsWith('/api/') || pathname.startsWith('/temp/')) {
    return NextResponse.next();
  }

  // Check for authentication cookie
  const authCookie = request.cookies.get(AUTH_COOKIE_NAME);
  const isAuthenticated = authCookie?.value === 'authenticated';

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// TODO: Replace middleware with the recommended proxy-based alternative once Next.js deprecations
// are addressed, keeping the same auth gating behavior.
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
