import { NextRequest, NextResponse } from 'next/server';
import { clearTokenCache, saveManualUshaToken } from '@/utils/getUshaToken';
import { loadSettings, saveSettings } from '@/utils/settingsConfig';

const MIN_JWT_LENGTH = 50;

function hasValidJwtShape(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }
  if (token.length < MIN_JWT_LENGTH) {
    return false;
  }
  return parts.every((part) => part.trim().length > 0);
}

function resolveTokenExpiration(token: string): number {
  const defaultExpiry = Date.now() + 60 * 60 * 1000;
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      if (payload.exp) {
        return payload.exp * 1000;
      }
    }
  } catch (error) {
    console.warn('[USHA_TOKEN_API] Failed to decode token expiration:', error);
  }
  return defaultExpiry;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const overrideEnabled = typeof body?.overrideEnabled === 'boolean' ? body.overrideEnabled : true;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      );
    }

    if (!hasValidJwtShape(token)) {
      return NextResponse.json(
        { success: false, error: 'Token does not look like a valid JWT' },
        { status: 400 }
      );
    }

    const expiresAt = resolveTokenExpiration(token);
    await saveManualUshaToken(token, expiresAt);
    clearTokenCache();

    const currentSettings = loadSettings();
    await saveSettings({
      ...currentSettings,
      ushaTokenOverrideEnabled: overrideEnabled,
    });

    return NextResponse.json({
      success: true,
      overrideEnabled,
      expiresAt,
    });
  } catch (error) {
    console.error('[USHA_TOKEN_API] Failed to save token:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to save token',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
