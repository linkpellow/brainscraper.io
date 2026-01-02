import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Public routes that don't require authentication
const publicRoutes = [
  '/login', 
  '/api/auth/login', 
  '/api/auth/check',
  '/api/inngest', // Inngest webhooks must be public (authenticated via signing key)
  '/api/linkedin-sales-navigator', // Used by Inngest background jobs (server-to-server)
  '/api/skip-tracing', // Used by enrichment pipeline (server-to-server)
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Check for auth token in cookie
  const authToken = request.cookies.get('auth_token');

  // If no auth token, redirect to login
  if (!authToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Allow access
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|logo.png|icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm)).*)',
  ],
};

