import { NextRequest, NextResponse } from 'next/server';
import { getUshaToken } from '@/utils/getUshaToken';

/**
 * Test endpoint to verify USHA token is accessible
 * Use this to check if the environment variable is working before trying CSV scrub
 */
export async function GET(request: NextRequest) {
  try {
    console.log('\n🔍 [TOKEN TEST] Testing USHA token access...\n');
    
    const token = await getUshaToken();
    
    if (!token) {
      return NextResponse.json({
        success: false,
        error: 'Token is null/undefined',
        diagnostic: {
          hasEnvVar: !!process.env.USHA_JWT_TOKEN,
          envVarLength: process.env.USHA_JWT_TOKEN?.length || 0,
          availableUshaVars: Object.keys(process.env).filter(k => k.includes('USHA')),
        }
      }, { status: 500 });
    }

    // Decode token to show expiration
    let expiration: string | null = null;
    let expiresIn: string | null = null;
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        if (payload.exp) {
          const expDate = new Date(payload.exp * 1000);
          expiration = expDate.toISOString();
          const minutesUntilExpiry = Math.floor((payload.exp * 1000 - Date.now()) / 1000 / 60);
          expiresIn = `${minutesUntilExpiry} minutes`;
        }
      }
    } catch (e) {
      // Couldn't decode
    }

    return NextResponse.json({
      success: true,
      message: 'Token is accessible and valid',
      tokenInfo: {
        length: token.length,
        first20Chars: token.substring(0, 20) + '...',
        expiration,
        expiresIn,
      },
      diagnostic: {
        hasEnvVar: !!process.env.USHA_JWT_TOKEN,
        envVarLength: process.env.USHA_JWT_TOKEN?.length || 0,
        availableUshaVars: Object.keys(process.env).filter(k => k.includes('USHA')),
      }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      diagnostic: {
        hasEnvVar: !!process.env.USHA_JWT_TOKEN,
        envVarLength: process.env.USHA_JWT_TOKEN?.length || 0,
        availableUshaVars: Object.keys(process.env).filter(k => k.includes('USHA')),
      }
    }, { status: 500 });
  }
}

