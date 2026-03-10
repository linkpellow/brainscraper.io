/**
 * Verify LinkedIn enrichment pipeline with a SMALL batch (1 lead).
 * Run with: npx tsx scripts/verify-enrichment-batch.ts
 * Requires: dev server running (npm run dev) and Inngest dev server if using background jobs.
 */

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

const HEADERS = [
  'Name',
  'Title',
  'Company',
  'Location',
  'LinkedIn URL',
  'Email',
  'Phone',
  'First Name',
  'Last Name',
  'City',
  'State',
  'Zip',
  'Search Filter',
];

function buildParsedData(rows: Record<string, string | number>[]) {
  return {
    headers: HEADERS,
    rows,
    rowCount: rows.length,
    columnCount: HEADERS.length,
  };
}

async function main() {
  // One lead in the exact shape the UI sends (convertResultsToParsedData)
  const oneLead = [
    {
      Name: 'Ryan Canavan',
      Title: 'Vice President of Sales',
      Company: 'FairCode',
      Location: 'Inlet Beach, Florida, United States',
      'LinkedIn URL':
        'https://www.linkedin.com/in/ACwAAAIcihYBQMXHQAaHQekZN2PJjt6Uf7Pl80g',
      Email: '',
      Phone: '',
      'First Name': 'Ryan',
      'Last Name': 'Canavan',
      City: 'Inlet Beach',
      State: 'FL',
      Zip: '',
      'Search Filter': 'test-batch',
    },
  ];

  const parsedData = buildParsedData(oneLead);

  console.log('[VERIFY] POST /api/jobs/enrich with 1 lead...');
  const res = await fetch(`${BASE}/api/jobs/enrich`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parsedData,
      metadata: { source: 'verify-enrichment-batch', leadCount: 1 },
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('[VERIFY] Enrich API error:', res.status, data);
    process.exit(1);
  }

  if (!data.success || !data.jobId) {
    console.error('[VERIFY] Unexpected response:', data);
    process.exit(1);
  }

  console.log('[VERIFY] Job started:', data.jobId);
  console.log('[VERIFY] Polling /api/jobs/status until completed or failed...');

  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const statusRes = await fetch(`${BASE}/api/jobs/status?jobId=${encodeURIComponent(data.jobId)}`);
    const statusData = await statusRes.json();
    const job = statusData.job ?? statusData;

    if (!job) {
      console.log('[VERIFY] No job in response, waiting...');
      continue;
    }

    const { status, progress, error } = job;
    console.log(`[VERIFY] ${new Date().toISOString()} status=${status} progress=${progress?.current ?? 0}/${progress?.total ?? 0}`);

    if (status === 'completed') {
      console.log('[VERIFY] Enrichment pipeline OK. Job completed successfully.');
      process.exit(0);
    }
    if (status === 'failed') {
      console.error('[VERIFY] Job failed:', error ?? job);
      process.exit(1);
    }
  }

  console.error('[VERIFY] Timeout waiting for job completion.');
  process.exit(1);
}

main().catch((err) => {
  console.error('[VERIFY]', err);
  process.exit(1);
});
