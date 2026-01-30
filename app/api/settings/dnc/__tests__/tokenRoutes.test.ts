/* @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GET as getToken, POST as postToken } from '@/app/api/settings/dnc/token/route';
import { POST as testToken } from '@/app/api/settings/dnc/test/route';
import { POST as scrubDnc } from '@/app/api/dnc/route';
import { invalidateSettingsCache } from '@/utils/settingsConfig';

let dataDir: string;

const createJsonRequest = (url: string, body: Record<string, unknown>) =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainscraper-dnc-'));
  process.env.DATA_DIR = dataDir;
  invalidateSettingsCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  invalidateSettingsCache();
  delete process.env.DATA_DIR;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('DNC token settings routes', () => {
  it('saves token and returns masked status', async () => {
    const saveRequest = createJsonRequest('http://localhost/api/settings/dnc/token', {
      token: 'manual-token-1234',
    });
    const saveResponse = await postToken(saveRequest as never);
    const saveData = await saveResponse.json();

    expect(saveResponse.status).toBe(200);
    expect(saveData.ok).toBe(true);
    expect(saveData.masked).toMatch(/1234$/);

    const getResponse = await getToken();
    const getData = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getData.configured).toBe(true);
    expect(getData.masked).toMatch(/1234$/);
  });

  it('returns 400 when DNC scrub is called without token', async () => {
    const scrubRequest = createJsonRequest('http://localhost/api/dnc', {
      phoneNumbers: ['15551234567'],
    });
    const response = await scrubDnc(scrubRequest as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('DNC token not configured. Add token in Lead Generation > Settings.');
  });

  it('returns 401 when DNC scrub is unauthorized', async () => {
    const saveRequest = createJsonRequest('http://localhost/api/settings/dnc/token', {
      token: 'manual-token-1234',
    });
    await postToken(saveRequest as never);

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response('unauthorized', { status: 401 })),
      ),
    );

    const scrubRequest = createJsonRequest('http://localhost/api/dnc', {
      phoneNumbers: ['15551234567'],
    });
    const response = await scrubDnc(scrubRequest as never);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe(
      'DNC request unauthorized (invalid manual token). Update token in Lead Generation settings.',
    );
  });

  it('reports token test success and failure', async () => {
    const saveRequest = createJsonRequest('http://localhost/api/settings/dnc/token', {
      token: 'manual-token-1234',
    });
    await postToken(saveRequest as never);

    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))));
    const okResponse = await testToken();
    const okData = await okResponse.json();

    expect(okResponse.status).toBe(200);
    expect(okData.ok).toBe(true);

    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 401 }))));
    const failResponse = await testToken();
    const failData = await failResponse.json();

    expect(failResponse.status).toBe(401);
    expect(failData.ok).toBe(false);
    expect(failData.reason).toBe(
      'DNC request unauthorized (invalid manual token). Update token in Lead Generation settings.',
    );
  });
});
