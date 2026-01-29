/**
 * Stabilize auth worker via changecontext
 *
 * Calls POST /account/changecontext with Bearer + agentNumber, parses
 * tokenResult response, updates session, and saves to data/auth-workers.
 *
 * Usage:
 *   BEARER_TOKEN=<optional> npx tsx scripts/stabilize-auth-worker-changecontext.ts [sessionId]
 */

import { getDataFilePath, safeReadFile, safeWriteFile } from '../utils/dataDirectory';

const CHANGECONTEXT_URL = 'https://api-identity-agent.ushadvisors.com/account/changecontext';
const AGENT_NUMBER = '00044447';
const DEFAULT_SESSION = 'har_1769120388847_agent_ushadvisors_com';

function loadSession(sessionId: string): any {
  const filePath = getDataFilePath(`auth-workers/${sessionId}.json`);
  const content = safeReadFile(filePath);
  if (!content) {
    throw new Error(`Auth worker not found: ${sessionId}`);
  }
  const session = JSON.parse(content);
  if (!session.sessionId || !session.step2?.extractedVars) {
    throw new Error(`Invalid session structure: ${sessionId}`);
  }
  return session;
}

function saveSession(session: any): void {
  const filePath = getDataFilePath(`auth-workers/${session.sessionId}.json`);
  safeWriteFile(filePath, JSON.stringify(session, null, 2));
}

async function main() {
  const sessionId = process.argv[2] || process.env.SESSION_ID || DEFAULT_SESSION;
  const bearerOverride = process.env.BEARER_TOKEN;

  console.log(`[Stabilize] Loading session: ${sessionId}`);
  const session = loadSession(sessionId);
  const token = bearerOverride || session.step2?.extractedVars?.access_token;
  if (!token) {
    throw new Error('No access_token in session and BEARER_TOKEN not set');
  }

  console.log(`[Stabilize] POST ${CHANGECONTEXT_URL} with agentNumber=${AGENT_NUMBER}`);
  const res = await fetch(CHANGECONTEXT_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Origin: 'https://agent.ushadvisors.com',
      Referer: 'https://agent.ushadvisors.com/',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
    },
    body: JSON.stringify({ agentNumber: AGENT_NUMBER }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) {
      throw new Error(
        `changecontext failed: 401 Unauthorized. ` +
          `Set BEARER_TOKEN to a valid token from logging into agent.ushadvisors.com (e.g. from DevTools).\n${text.slice(0, 300)}`
      );
    }
    throw new Error(`changecontext failed: ${res.status} ${res.statusText}\n${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    tokenResult?: { access_token?: string; expires_in?: number; name?: string; token_type?: string };
  };
  const tr = data?.tokenResult;
  const accessToken = tr?.access_token;
  if (!accessToken) {
    throw new Error('changecontext response missing tokenResult.access_token');
  }

  const expiresIn = tr.expires_in;
  const expiresAtMs =
    typeof expiresIn === 'number'
      ? expiresIn > 1e9
        ? expiresIn * 1000
        : Date.now() + expiresIn * 1000
      : null;

  const now = Date.now();
  session.stabilized = true;
  session.stabilizedAt = now;
  session.savedAt = now;
  session.step2.extractedVars.access_token = accessToken;
  session.step2.extractedVars.expires_at = expiresAtMs != null ? String(expiresAtMs) : session.step2.extractedVars.expires_at;
  session.step2.response = { tokenResult: tr };
  session.step2.verificationStatus.verifiedAt = now;

  const locked = session.lockedSteps?.find((s: any) => s.stepNumber === 2);
  if (locked) {
    locked.response = { tokenResult: tr };
    locked.extractedVars = { ...locked.extractedVars, access_token: accessToken };
    if (expiresAtMs != null) locked.extractedVars.expires_at = String(expiresAtMs);
  }

  saveSession(session);
  console.log(`[Stabilize] Updated ${sessionId}; expires_at=${expiresAtMs ?? 'unchanged'}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
