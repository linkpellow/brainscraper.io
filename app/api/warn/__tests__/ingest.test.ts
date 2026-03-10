import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/warn/ingest/route';

describe('POST /api/warn/ingest', () => {
  it('returns 400 when no file provided', async () => {
    const form = new FormData();
    const req = new Request('http://localhost/api/warn/ingest', { method: 'POST', body: form });
    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });
});

describe('GET /api/warn/lists', () => {
  it('returns success and data array', async () => {
    const { GET } = await import('@/app/api/warn/lists/route');
    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });
});
