import { NextResponse } from 'next/server';
import { getDncToken } from '@/server/settings/dncToken';
import { incrementMetric } from '@/utils/dncMetrics';

const TEST_PHONE = '2025550100';

export async function POST() {
  const token = await getDncToken();
  if (!token) {
    incrementMetric('dnc.token.missing');
    return NextResponse.json(
      { ok: false, reason: 'DNC token not configured. Add token in Lead Generation > Settings.' },
      { status: 400 },
    );
  }

  const url = `https://api-business-agent.ushadvisors.com/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=00044447&phone=${encodeURIComponent(TEST_PHONE)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      accept: 'application/json, text/plain, */*',
      Referer: 'https://agent.ushadvisors.com/',
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 401 || response.status === 403) {
    incrementMetric('dnc.token.test.failure');
    incrementMetric('dnc.api.unauthorized');
    return NextResponse.json(
      {
        ok: false,
        reason: 'DNC request unauthorized (invalid manual token). Update token in Lead Generation settings.',
      },
      { status: 401 },
    );
  }

  incrementMetric('dnc.token.test.success');
  return NextResponse.json({ ok: true });
}
