/* @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GET as getToken, POST as postToken } from '@/app/api/settings/dnc/token/route';
import { POST as testToken } from '@/app/api/settings/dnc/test/route';
import { invalidateSettingsCache } from '@/utils/settingsConfig';
import { DNC_TOKEN_UNAUTHORIZED_MESSAGE } from '@/server/settings/dncToken';

let dataDir: string;

const createJsonRequest = (url: string, body: Record<string, unknown>) =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const createJwt = (exp: number) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return `${header}.${payload}.signature`;
};

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
  it('returns recovery ui mode when session is missing', async () => {
    const getResponse = await getToken();
    const getData = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getData.uiMode).toBe('recovery');
    expect(getData.configured).toBe(false);
  });

  it('saves token and returns masked status with expiry metadata', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const saveRequest = createJsonRequest('http://localhost/api/settings/dnc/token', {
      token: createJwt(exp),
    });
    const saveResponse = await postToken(saveRequest as never);
    const saveData = await saveResponse.json();

    expect(saveResponse.status).toBe(200);
    expect(saveData.ok).toBe(true);
    expect(saveData.uiMode).toBe('hidden');
    expect(saveData.masked).toMatch(/ture$/);
    expect(saveData.expiresAt).toBe(exp);

    const getResponse = await getToken();
    const getData = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getData.uiMode).toBe('hidden');
    expect(getData.configured).toBe(true);
    expect(getData.masked).toMatch(/ture$/);
    expect(getData.expiresAt).toBe(exp);
  });

  it('refreshes before changecontext and scrub when token is near expiry', async () => {
    const nearExpiry = Math.floor(Date.now() / 1000) + 120;
    const refreshedExp = Math.floor(Date.now() / 1000) + 7200;
    const saveRequest = createJsonRequest('http://localhost/api/settings/dnc/token', {
      token: createJwt(nearExpiry),
    });
    await postToken(saveRequest as never);

    const refreshToken = createJwt(refreshedExp);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tokenResult: {
              access_token: refreshToken,
              expires_in: refreshedExp,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tokenResult: {
              access_token: 'context-bearer',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const okResponse = await testToken();
    const okData = await okResponse.json();

    expect(okResponse.status).toBe(200);
    expect(okData.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api-identity-agent.ushadvisors.com/account/refresh');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api-identity-agent.ushadvisors.com/account/changecontext');
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain('/Leads/api/leads/scrubphonenumber');

    const getResponse = await getToken();
    const getData = await getResponse.json();
    expect(getData.expiresAt).toBe(refreshedExp);
  });

  it('surfaces refresh unauthorized and clears stored token', async () => {
    const nearExpiry = Math.floor(Date.now() / 1000) + 120;
    const saveRequest = createJsonRequest('http://localhost/api/settings/dnc/token', {
      token: createJwt(nearExpiry),
    });
    await postToken(saveRequest as never);

    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const failResponse = await testToken();
    const failData = await failResponse.json();

    expect(failResponse.status).toBe(401);
    expect(failData.ok).toBe(false);
    expect(failData.reason).toBe(DNC_TOKEN_UNAUTHORIZED_MESSAGE);

    const getResponse = await getToken();
    const getData = await getResponse.json();
    expect(getData.configured).toBe(false);
    expect(getData.uiMode).toBe('recovery');
  });
});
