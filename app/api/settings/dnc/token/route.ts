import { NextRequest, NextResponse } from 'next/server';
import { getDncToken, maskToken, setDncToken } from '@/server/settings/dncToken';
import { incrementMetric } from '@/utils/dncMetrics';

export async function GET() {
  const token = await getDncToken();
  return NextResponse.json({
    configured: Boolean(token),
    ...(token ? { masked: maskToken(token) } : {}),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : '';
  const trimmed = token.trim();
  await setDncToken(trimmed);
  if (!trimmed) {
    incrementMetric('dnc.token.missing');
  }
  return NextResponse.json({
    ok: true,
    ...(trimmed ? { masked: maskToken(trimmed) } : {}),
  });
}
