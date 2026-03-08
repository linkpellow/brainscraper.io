/* @vitest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { GET } from '@/app/api/jobs/results/route';
import { saveJobResults } from '@/utils/jobResults';
import { saveJobStatus } from '@/utils/jobStatus';

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainscraper-job-results-'));
  process.env.DATA_DIR = dataDir;
});

afterEach(() => {
  delete process.env.DATA_DIR;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('GET /api/jobs/results', () => {
  it('returns the exact snapshot for a completed enrichment job', async () => {
    const jobId = 'enrichment-123';

    saveJobStatus({
      jobId,
      type: 'enrichment',
      status: 'completed',
      progress: { current: 1, total: 1, percentage: 100 },
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      metadata: { leadCount: 1 },
    });

    await saveJobResults(jobId, 'enrichment', [
      { name: 'Alice Example', phone: '(555) 111-2222', dncStatus: 'UNKNOWN' },
    ]);

    const response = await GET(
      new NextRequest(`http://localhost/api/jobs/results?jobId=${jobId}`)
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.results.count).toBe(1);
    expect(data.results.leads).toEqual([
      { name: 'Alice Example', phone: '(555) 111-2222', dncStatus: 'UNKNOWN' },
    ]);
  });

  it('returns 404 instead of unrelated results when a completed job has no snapshot', async () => {
    const jobId = 'enrichment-missing';

    saveJobStatus({
      jobId,
      type: 'enrichment',
      status: 'completed',
      progress: { current: 1, total: 1, percentage: 100 },
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      metadata: { leadCount: 1 },
    });

    const response = await GET(
      new NextRequest(`http://localhost/api/jobs/results?jobId=${jobId}`)
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Results are not available for this job.');
  });
});
