import { NextRequest, NextResponse } from 'next/server';
import { getDncTokenMeta, setDncToken } from '@/utils/dncToken';
import { incrementMetric } from '@/utils/dncMetrics';

export async function GET() {
  const meta = getDncTokenMeta();
  return NextResponse.json({ success: true, ...meta });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : '';
  const meta = await setDncToken(token);
  if (!meta.configured) {
    incrementMetric('dnc.token.missing');
  }
  return NextResponse.json({ success: true, ...meta });
}
