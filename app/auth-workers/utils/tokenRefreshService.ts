/**
 * Token Refresh Service
 * 
 * Automatically refreshes tokens for auth workers using their stored refresh_url
 * Monitors token expiration and refreshes before tokens expire
 */

import type { PersistedAuthWorkerState } from './authWorkerPersistence';
import { getSessionById, persistAuthWorkerState } from './authWorkerPersistence';

/**
 * Refresh token for a specific auth worker session
 * Works on both client and server - automatically detects environment
 */
export async function refreshAuthWorkerToken(
  sessionId: string
): Promise<{ success: boolean; newToken?: string; error?: string }> {
  // Try server-side storage first (for API routes), fall back to client-side
  let session: PersistedAuthWorkerState | null = null;
  
  // Check if we're on the server (no window object)
  if (typeof window === 'undefined') {
    // Dynamic import to avoid bundling server-only code in client
    const { getSessionFromServer } = await import('./authWorkerServerStorage');
    session = getSessionFromServer(sessionId);
  } else {
    session = getSessionById(sessionId);
  }
  
  if (!session) {
    return { success: false, error: 'Session not found' };
  }

  const extractedVars = session.step2.extractedVars;
  const accessToken = extractedVars.access_token;
  const refreshUrl = extractedVars.refresh_url;

  if (!accessToken) {
    return { success: false, error: 'No access token found' };
  }

  if (!refreshUrl) {
    return { success: false, error: 'No refresh URL found' };
  }

  try {
    // For ushadvisors.com style refresh (uses current token to get new one)
    const response = await fetch(refreshUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      return { 
        success: false, 
        error: `Refresh failed: ${response.status} ${response.statusText}` 
      };
    }

    const data = await response.json();
    
    // Handle nested tokenResult format
    const tokenSource = data.tokenResult || data.data || data;
    const newToken = tokenSource.access_token || data.access_token;

    if (!newToken) {
      return { success: false, error: 'Refresh response missing access_token' };
    }

    // Update extractedVars with new token
    const updatedExtractedVars: PersistedAuthWorkerState['step2']['extractedVars'] = {
      ...extractedVars,
      access_token: newToken,
    };

    // Extract expiration from new token (JWT) or response
    let expiresAt: number | undefined;
    if (tokenSource.expires_in || data.expires_in) {
      const expiresIn = tokenSource.expires_in || data.expires_in;
      if (expiresIn > 1000000000) {
        // Unix timestamp (seconds)
        expiresAt = expiresIn * 1000;
      } else {
        // Seconds until expiration
        expiresAt = Date.now() + (expiresIn * 1000);
      }
      updatedExtractedVars.expires_at = expiresAt.toString();
      updatedExtractedVars.expires_in = expiresIn.toString();
    } else {
      // Try to extract from JWT
      try {
        const parts = newToken.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
          if (payload.exp) {
            expiresAt = payload.exp * 1000;
            updatedExtractedVars.expires_at = expiresAt.toString();
          }
        }
      } catch (e) {
        // JWT parsing failed
      }
    }

    // Update session with new token
    const updatedSession: PersistedAuthWorkerState = {
      ...session,
      step2: {
        ...session.step2,
        extractedVars: updatedExtractedVars,
      },
    };

    persistAuthWorkerState(sessionId, updatedSession);

    return { success: true, newToken };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Check if token needs refresh (within 5 minutes of expiration)
 */
export function needsTokenRefresh(session: PersistedAuthWorkerState): boolean {
  const expiresAt = session.step2.extractedVars.expires_at;
  if (!expiresAt) {
    // No expiration info - assume it needs refresh if we have refresh_url
    return !!session.step2.extractedVars.refresh_url;
  }

  const expirationTime = parseInt(expiresAt, 10);
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  // Refresh if token expires within 5 minutes
  return (expirationTime - now) < fiveMinutes;
}

/**
 * Get valid token for auth worker (refreshes if needed)
 * Works on both client and server - automatically detects environment
 */
export async function getValidToken(
  sessionId: string
): Promise<{ token: string; wasRefreshed: boolean } | null> {
  // Try server-side storage first (for API routes), fall back to client-side
  let session: PersistedAuthWorkerState | null = null;
  
  // Check if we're on the server (no window object)
  if (typeof window === 'undefined') {
    // Dynamic import to avoid bundling server-only code in client
    const { getSessionFromServer } = await import('./authWorkerServerStorage');
    session = getSessionFromServer(sessionId);
  } else {
    session = getSessionById(sessionId);
  }
  
  if (!session) {
    return null;
  }

  const token = session.step2.extractedVars.access_token;
  if (!token) {
    return null;
  }

  // Check if refresh is needed
  if (needsTokenRefresh(session)) {
    const refreshResult = await refreshAuthWorkerToken(sessionId);
    if (refreshResult.success && refreshResult.newToken) {
      return { token: refreshResult.newToken, wasRefreshed: true };
    }
    // If refresh failed, return current token anyway
    return { token, wasRefreshed: false };
  }

  return { token, wasRefreshed: false };
}
