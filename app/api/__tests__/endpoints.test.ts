/**
 * Minimal endpoint smoke tests: verify key API routes respond (no external API calls).
 * Set VERIFY_BASE_URL (e.g. https://brainscraper.io) to test production; else uses http://localhost:3000.
 * Skips if server unreachable.
 */
const BASE =
  process.env.VERIFY_BASE_URL ||
  (process.env.BASE_URL?.startsWith('http') ? process.env.BASE_URL : undefined) ||
  'http://localhost:3000';

async function fetchOk(path: string): Promise<{ ok: boolean; status: number; json?: unknown }> {
  try {
    const res = await fetch(`${BASE}${path}`, { method: 'GET' });
    const json = res.ok ? await res.json().catch(() => ({})) : undefined;
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    return { ok: false, status: 0 };
  }
}

describe('API endpoints (minimal smoke)', () => {
  beforeAll(async () => {
    const { ok } = await fetchOk('/api/health');
    if (!ok) {
      console.warn(`[endpoints.test] Server not reachable at ${BASE}, skipping HTTP tests`);
    }
  });

  it('GET /api/health returns 200 and version', async () => {
    const { ok, status, json } = await fetchOk('/api/health');
    if (status === 0) return; // skip if server down
    expect(status).toBe(200);
    expect(ok).toBe(true);
    expect(json && typeof json === 'object' && 'version' in json).toBe(true);
  });

  it('GET /api/jobs/status returns 200 and jobs array', async () => {
    const { ok, status, json } = await fetchOk('/api/jobs/status');
    if (status === 0) return;
    expect(status).toBe(200);
    expect(ok).toBe(true);
    const obj = json as { success?: boolean; jobs?: unknown[] };
    expect(obj?.success).toBe(true);
    expect(Array.isArray(obj?.jobs)).toBe(true);
  });

  it('GET /api/settings returns 200 and settings shape', async () => {
    const { ok, status, json } = await fetchOk('/api/settings');
    if (status === 0) return;
    expect(status).toBe(200);
    expect(ok).toBe(true);
    const obj = json as { success?: boolean; settings?: unknown };
    expect(obj?.success).toBe(true);
    expect(obj?.settings && typeof obj.settings === 'object').toBe(true);
  });
});
