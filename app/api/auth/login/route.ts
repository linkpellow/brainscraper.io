import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const CORRECT_PASSWORD = 'scrapegoat2026';

// Generate a simple token (in production, use a more secure method)
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { success: false, error: 'Password is required' },
        { status: 400 }
      );
    }

    if (password === CORRECT_PASSWORD) {
      const token = generateToken();
      
      // Set HTTP-only cookie for security
      const response = NextResponse.json({
        success: true,
        token,
      });

      // Set cookie that expires in 30 days
      response.cookies.set('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      });

      return response;
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid password' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred' },
      { status: 500 }
    );
  }
}

