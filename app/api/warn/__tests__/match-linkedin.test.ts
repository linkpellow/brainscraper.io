import { afterEach, describe, expect, it, vi } from 'vitest';

const { inngestSendMock, saveJobStatusMock, generateJobIdMock } = vi.hoisted(() => ({
  inngestSendMock: vi.fn(),
  saveJobStatusMock: vi.fn(),
  generateJobIdMock: vi.fn(() => 'scraping-test-job'),
}));

vi.mock('@/utils/inngest', () => ({
  inngest: { send: inngestSendMock },
  warnEvents: { warnMatchLinkedIn: 'warn/match-to-linkedin' },
}));

vi.mock('@/utils/jobStatus', () => ({
  saveJobStatus: saveJobStatusMock,
  generateJobId: generateJobIdMock,
}));

import { POST } from '@/app/api/warn/match-linkedin/route';

function validWarnRow() {
  return {
    companyName: 'Acme Corp',
    city: 'Austin',
    stateOrCounty: 'TX',
    layoffCount: 25,
    layoffDate: '2026-03-01',
    noticeDate: '2026-02-15',
    sourceFile: 'warn-test.json',
  };
}

describe('POST /api/warn/match-linkedin', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when rows are missing', async () => {
    const req = new Request('http://localhost/api/warn/match-linkedin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(String(data.error)).toContain('rows must be a non-empty array');
  });

  it('returns 400 for invalid enabledStations payload', async () => {
    const req = new Request('http://localhost/api/warn/match-linkedin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: [validWarnRow()],
        enabledStations: ['linkedin', 'not-a-station'],
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(String(data.error)).toContain('Invalid enabledStations value');
  });

  it('starts WARN match job with autoEnrich and station controls', async () => {
    inngestSendMock.mockResolvedValueOnce(undefined);

    const req = new Request('http://localhost/api/warn/match-linkedin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: [validWarnRow()],
        maxCompanies: 10,
        autoEnrich: true,
        enabledStations: ['linkedin', 'phone-discovery'],
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.jobId).toBe('scraping-test-job');
    expect(data.autoEnrich).toBe(true);

    expect(saveJobStatusMock).toHaveBeenCalledTimes(1);
    expect(saveJobStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'scraping-test-job',
        type: 'scraping',
        status: 'pending',
        metadata: expect.objectContaining({
          source: 'warn',
          autoEnrich: true,
          enabledStations: ['linkedin', 'phone-discovery'],
        }),
      })
    );

    expect(inngestSendMock).toHaveBeenCalledTimes(1);
    expect(inngestSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'warn/match-to-linkedin',
        data: expect.objectContaining({
          jobId: 'scraping-test-job',
          autoEnrich: true,
          enabledStations: ['linkedin', 'phone-discovery'],
        }),
      })
    );
  });
});
