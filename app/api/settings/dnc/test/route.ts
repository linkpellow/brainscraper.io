import { NextResponse } from 'next/server';
import { DncAuthError, callDncScrub } from '@/server/settings/dncToken';
import { incrementMetric } from '@/utils/dncMetrics';

const TEST_PHONE = '2025550100';

export async function POST() {
  try {
    const response = await callDncScrub(TEST_PHONE);
    if (!response.ok) {
      incrementMetric('dnc.token.test.failure');
      return NextResponse.json(
        {
          ok: false,
          reason: `DNC scrub test failed: ${response.status} ${response.statusText}`,
        },
        { status: response.status },
      );
    }

    incrementMetric('dnc.token.test.success');
    return NextResponse.json({ ok: true });
  } catch (error) {
    incrementMetric('dnc.token.test.failure');
    const status = error instanceof DncAuthError ? error.status : 500;
    return NextResponse.json(
      {
        ok: false,
        reason: error instanceof Error ? error.message : 'DNC token test failed',
      },
      { status },
    );
  }
}
