import { invalidateSettingsCache, loadSettings, saveSettings } from '@/utils/settingsConfig';
import { incrementMetric } from '@/utils/dncMetrics';

const DNC_IDENTITY_API_BASE = 'https://api-identity-agent.ushadvisors.com';
const DNC_BUSINESS_API_BASE = 'https://api-business-agent.ushadvisors.com';
export const DNC_AGENT_NUMBER = '00044447';
const DNC_REFRESH_BUFFER_SECONDS = 300;

export const DNC_TOKEN_MISSING_MESSAGE =
  'DNC access token not configured. Paste a fresh DNC access token in the Lead Generation token box.';
export const DNC_TOKEN_INVALID_MESSAGE =
  'DNC access token is invalid or missing an expiration. Paste a fresh DNC access token in the Lead Generation token box.';
export const DNC_TOKEN_UNAUTHORIZED_MESSAGE =
  'DNC session is no longer valid. Paste a fresh DNC access token in the Lead Generation token box.';

type TokenResultPayload = {
  access_token?: string;
  expires_in?: number;
};

type DncSession = {
  accessToken: string;
  expiresAt: number;
};

export class DncAuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DncAuthError';
    this.status = status;
  }
}

function decodeJwtExpirationSeconds(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

function normalizeExpiresAt(expiresIn: unknown, token: string): number | null {
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (typeof expiresIn === 'number' && Number.isFinite(expiresIn)) {
    if (expiresIn > 10_000_000_000) {
      return Math.floor(expiresIn / 1000);
    }
    if (expiresIn > nowSeconds - 86400) {
      return Math.floor(expiresIn);
    }
    if (expiresIn > 0) {
      return nowSeconds + Math.floor(expiresIn);
    }
  }

  return decodeJwtExpirationSeconds(token);
}

function extractTokenResult(payload: unknown): TokenResultPayload | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const tokenResult = (payload as { tokenResult?: TokenResultPayload }).tokenResult;
  if (tokenResult && typeof tokenResult === 'object') {
    return tokenResult;
  }

  return payload as TokenResultPayload;
}

function getStoredSession(): DncSession | null {
  const settings = loadSettings();
  const accessToken = settings.dncAccessToken?.trim();
  if (!accessToken) {
    return null;
  }

  const expiresAt =
    typeof settings.dncAccessTokenExpiresAt === 'number'
      ? settings.dncAccessTokenExpiresAt
      : decodeJwtExpirationSeconds(accessToken);

  if (!expiresAt) {
    return null;
  }

  return { accessToken, expiresAt };
}

async function persistSession(session: DncSession | null): Promise<void> {
  const settings = loadSettings();
  await saveSettings({
    ...settings,
    dncAccessToken: session?.accessToken ?? null,
    dncAccessTokenExpiresAt: session?.expiresAt ?? null,
  });
  invalidateSettingsCache();
}

async function clearStoredSession(): Promise<void> {
  await persistSession(null);
}

export const maskToken = (token: string): string => {
  if (!token) return '********';
  const trimmed = token.trim();
  if (trimmed.length <= 4) return '*'.repeat(trimmed.length);
  return `${'*'.repeat(Math.max(8, trimmed.length - 4))}${trimmed.slice(-4)}`;
};

export const getDncTokenMeta = async (): Promise<{ masked: string; expiresAt: number } | null> => {
  const session = getStoredSession();
  if (!session) {
    return null;
  }
  return {
    masked: maskToken(session.accessToken),
    expiresAt: session.expiresAt,
  };
};

export const setDncToken = async (token: string): Promise<{ masked: string; expiresAt: number } | null> => {
  const trimmed = token.trim();

  if (!trimmed) {
    await persistSession(null);
    return null;
  }

  const expiresAt = decodeJwtExpirationSeconds(trimmed);
  if (!expiresAt) {
    throw new DncAuthError(DNC_TOKEN_INVALID_MESSAGE, 400);
  }
  if (expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new DncAuthError(DNC_TOKEN_INVALID_MESSAGE, 400);
  }

  await persistSession({
    accessToken: trimmed,
    expiresAt,
  });

  return {
    masked: maskToken(trimmed),
    expiresAt,
  };
};

export async function ensureValidDncAccessToken(): Promise<DncSession> {
  const session = getStoredSession();
  if (!session) {
    incrementMetric('dnc.token.missing');
    throw new DncAuthError(DNC_TOKEN_MISSING_MESSAGE, 400);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds < session.expiresAt - DNC_REFRESH_BUFFER_SECONDS) {
    return session;
  }

  const refreshResponse = await fetch(`${DNC_IDENTITY_API_BASE}/account/refresh`, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
      Origin: 'https://agent.ushadvisors.com',
      Referer: 'https://agent.ushadvisors.com/',
    },
    body: JSON.stringify({}),
  });

  if (refreshResponse.status === 401 || refreshResponse.status === 403) {
    await clearStoredSession();
    incrementMetric('dnc.api.unauthorized');
    throw new DncAuthError(DNC_TOKEN_UNAUTHORIZED_MESSAGE, 401);
  }

  if (!refreshResponse.ok) {
    const errorText = await refreshResponse.text().catch(() => '');
    throw new DncAuthError(
      `DNC refresh failed: ${refreshResponse.status} ${refreshResponse.statusText}${errorText ? ` - ${errorText}` : ''}`,
      refreshResponse.status,
    );
  }

  const refreshPayload = await refreshResponse.json().catch(() => null);
  const tokenResult = extractTokenResult(refreshPayload);
  const refreshedAccessToken = tokenResult?.access_token?.trim();
  if (!refreshedAccessToken) {
    throw new DncAuthError('DNC refresh response did not include an access token.', 500);
  }

  const refreshedExpiresAt = normalizeExpiresAt(tokenResult?.expires_in, refreshedAccessToken);
  if (!refreshedExpiresAt) {
    throw new DncAuthError(DNC_TOKEN_INVALID_MESSAGE, 400);
  }

  const refreshedSession = {
    accessToken: refreshedAccessToken,
    expiresAt: refreshedExpiresAt,
  };

  await persistSession(refreshedSession);
  return refreshedSession;
}

export async function getDncScrubBearer(): Promise<string> {
  const session = await ensureValidDncAccessToken();
  const changeContextResponse = await fetch(`${DNC_IDENTITY_API_BASE}/account/changecontext`, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
      Origin: 'https://agent.ushadvisors.com',
      Referer: 'https://agent.ushadvisors.com/',
    },
    body: JSON.stringify({ agentNumber: DNC_AGENT_NUMBER }),
  });

  if (changeContextResponse.status === 401 || changeContextResponse.status === 403) {
    await clearStoredSession();
    incrementMetric('dnc.api.unauthorized');
    throw new DncAuthError(DNC_TOKEN_UNAUTHORIZED_MESSAGE, 401);
  }

  if (!changeContextResponse.ok) {
    const errorText = await changeContextResponse.text().catch(() => '');
    throw new DncAuthError(
      `DNC changecontext failed: ${changeContextResponse.status} ${changeContextResponse.statusText}${errorText ? ` - ${errorText}` : ''}`,
      changeContextResponse.status,
    );
  }

  const changeContextPayload = await changeContextResponse.json().catch(() => null);
  const tokenResult = extractTokenResult(changeContextPayload);
  const scrubBearer = tokenResult?.access_token?.trim();
  if (!scrubBearer) {
    throw new DncAuthError('DNC changecontext response did not include a scrub bearer.', 500);
  }

  return scrubBearer;
}

export async function callDncScrub(phone: string): Promise<Response> {
  const scrubBearer = await getDncScrubBearer();
  const url = `${DNC_BUSINESS_API_BASE}/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=${encodeURIComponent(DNC_AGENT_NUMBER)}&phone=${encodeURIComponent(phone)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json, text/plain, */*',
      Authorization: `Bearer ${scrubBearer}`,
      Origin: 'https://agent.ushadvisors.com',
      Referer: 'https://agent.ushadvisors.com/',
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 401 || response.status === 403) {
    await clearStoredSession();
    incrementMetric('dnc.api.unauthorized');
    throw new DncAuthError(DNC_TOKEN_UNAUTHORIZED_MESSAGE, 401);
  }

  return response;
}
