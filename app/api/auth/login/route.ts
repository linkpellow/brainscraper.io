import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const SITE_PASSWORD = process.env.SITE_PASSWORD || 'scrapegoat2026';
const AUTH_COOKIE_NAME = 'site-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    // Verify password
    if (password === SITE_PASSWORD) {
      // Set authentication cookie (expires in 30 days)
      const cookieStore = await cookies();
      cookieStore.set(AUTH_COOKIE_NAME, 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      });

      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Check if user is authenticated
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(AUTH_COOKIE_NAME);
  const isAuthenticated = authCookie?.value === 'authenticated';

  return NextResponse.json({ authenticated: isAuthenticated });
}

