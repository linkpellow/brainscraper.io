import { NextRequest, NextResponse } from 'next/server';
import { getDncToken } from '@/utils/dncToken';
import { incrementMetric } from '@/utils/dncMetrics';

function getCorsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  return NextResponse.json({}, { headers: getCorsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const token = getDncToken();
  if (!token) {
    incrementMetric('dnc.token.missing');
    return NextResponse.json(
      { error: 'DNC token not configured. Add token in Lead Generation > Settings.' },
      { status: 400, headers: getCorsHeaders(origin) },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: 'Invalid JSON payload.' },
      { status: 400, headers: getCorsHeaders(origin) },
    );
  }

  const url = new URL('/api/usha/scrub-batch', request.url);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const responseBody = await response.text();
  return new NextResponse(responseBody, {
    status: response.status,
    headers: {
      ...getCorsHeaders(origin),
      'Content-Type': response.headers.get('content-type') ?? 'application/json',
    },
  });
}
