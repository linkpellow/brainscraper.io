/**
 * USHA JWT token via Auth Worker (preferred source)
 *
 * This is the most reliable way to keep a valid USHA JWT token without manual env updates,
 * because the Auth Worker can auto-refresh using its stored refresh_url.
 *
 * Server-only: uses auth worker server storage. Returns null on client or when unavailable.
 */
export async function getUshaJwtFromAuthWorker(
  targetDomain: string = 'agent.ushadvisors.com'
): Promise<string | null> {
  // Server-side only
  if (typeof window !== 'undefined') return null;

  try {
    const { listSessionsFromServer, getSessionFromServer } = await import(
      '@/app/auth-workers/utils/authWorkerServerStorage'
    );
    const { getValidToken } = await import('@/app/auth-workers/utils/tokenRefreshService');

    const sessions = listSessionsFromServer()
      .filter(s => s.targetDomain === targetDomain)
      .sort((a, b) => b.stabilizedAt - a.stabilizedAt);

    if (sessions.length === 0) return null;

    // Prefer the most recently stabilized session for this domain
    const sessionId = sessions[0].sessionId;
    const session = getSessionFromServer(sessionId);
    if (!session) return null;

    const tokenResult = await getValidToken(session.sessionId);
    if (!tokenResult?.token) return null;

    return tokenResult.token;
  } catch (error) {
    // Don't throw; token fetch falls back to other sources.
    console.warn(
      '[USHA_TOKEN] Auth worker token fetch failed:',
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

