import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/dataDirectory', () => ({
  ensureDataDirectory: vi.fn(),
  getDataFilePath: vi.fn((filename: string) => `/tmp/${filename}`),
  safeWriteFile: vi.fn(),
}));

import { POST } from '@/app/api/warn/scrape/route';

const DEBUG_INGEST_PREFIX = 'http://127.0.0.1:7820/ingest/';

describe('POST /api/warn/scrape', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns normalized rows when WARN-like table exists', async () => {
    const html = `
      <html><body>
        <table>
          <tr>
            <th>Employer</th><th>City</th><th>State</th><th>Layoffs</th><th>Layoff Date</th><th>Notice Date</th>
          </tr>
          <tr>
            <td>Acme Corp</td><td>Austin</td><td>TX</td><td>120</td><td>2026-03-01</td><td>2026-02-15</td>
          </tr>
          <tr>
            <td>Globex</td><td>Dallas</td><td>TX</td><td>45</td><td>2026-04-10</td><td>2026-03-25</td>
          </tr>
        </table>
      </body></html>
    `;

    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.startsWith(DEBUG_INGEST_PREFIX)) {
          return new Response('{}', { status: 200 });
        }
        if (url === 'https://example.com/warn-table') {
          return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
        }
        return new Response('not found', { status: 404 });
      });

    const req = new Request('http://localhost/api/warn/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/warn-table' }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.totalRows).toBe(2);
    expect(data.rows[0].companyName).toBe('Acme Corp');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('returns success with warnings when no extractable rows exist', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith(DEBUG_INGEST_PREFIX)) {
        return new Response('{}', { status: 200 });
      }
      if (url === 'https://example.com/no-table') {
        return new Response('<html><body><div>No structured WARN data</div></body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return new Response('not found', { status: 404 });
    });

    const req = new Request('http://localhost/api/warn/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/no-table' }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.totalRows).toBe(0);
    expect(Array.isArray(data.warnings)).toBe(true);
    expect(data.warnings.join(' ')).toContain('No');
  });

  it('returns 400 for invalid URL', async () => {
    const req = new Request('http://localhost/api/warn/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'example.com/no-scheme' }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Valid url');
  });

  it('returns 500 when upstream fetch fails', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith(DEBUG_INGEST_PREFIX)) {
        return new Response('{}', { status: 200 });
      }
      if (url === 'https://example.com/network-failure') {
        throw new Error('network failure');
      }
      return new Response('not found', { status: 404 });
    });

    const req = new Request('http://localhost/api/warn/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/network-failure' }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toContain('WARN page fetch failed');
  });
});
