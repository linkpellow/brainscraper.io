/**
 * Internal cron-refresh API route.
 * POST /api/auth-worker/cron-refresh
 * Runs scheduled token refresh check. Secured by CRON_SECRET when set (same as daily-dnc-check).
 */

import { NextRequest, NextResponse } from 'next/server';
import { runTokenRefreshCheck } from '@/app/auth-workers/utils/tokenRefreshScheduler';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runTokenRefreshCheck();
    return NextResponse.json({
      ok: true,
      urgent: result.urgent,
      checked: result.checked,
      refreshed: result.refreshed,
      errors: result.errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
