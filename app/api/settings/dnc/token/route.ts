import { NextRequest, NextResponse } from 'next/server';
import { DncAuthError, getDncTokenMeta, setDncToken } from '@/server/settings/dncToken';
import { incrementMetric } from '@/utils/dncMetrics';

function buildStatusResponse(tokenMeta: Awaited<ReturnType<typeof getDncTokenMeta>>) {
  return {
    uiMode: tokenMeta ? 'hidden' as const : 'recovery' as const,
    configured: Boolean(tokenMeta),
    ...(tokenMeta
      ? {
          masked: tokenMeta.masked,
          expiresAt: tokenMeta.expiresAt,
        }
      : {}),
  };
}

export async function GET() {
  const tokenMeta = await getDncTokenMeta();
  return NextResponse.json(buildStatusResponse(tokenMeta));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const token = typeof body?.token === 'string' ? body.token : '';
    const trimmed = token.trim();
    const tokenMeta = await setDncToken(trimmed);
    if (!trimmed) {
      incrementMetric('dnc.token.missing');
    }
    return NextResponse.json({
      ok: true,
      ...buildStatusResponse(tokenMeta),
    });
  } catch (error) {
    const status = error instanceof DncAuthError ? error.status : 500;
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to save DNC access token',
      },
      { status },
    );
  }
}
