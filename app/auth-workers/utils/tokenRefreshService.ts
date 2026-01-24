/**
 * Token Refresh Service
 * 
 * Industry-standard token refresh implementation supporting:
 * - OAuth 2.0 refresh_token flow (standard OAuth)
 * - Bearer token refresh flow (custom implementations like ushadvisors.com)
 * - Automatic JWT expiration extraction and validation
 * - Proper error handling and retry logic
 * - Client and server-side storage synchronization
 */

import type { PersistedAuthWorkerState } from './authWorkerPersistence';
import { getSessionById, persistAuthWorkerState, updateSessionTokens } from './authWorkerPersistence';

/**
 * Extract JWT expiration from token
 */
function extractJWTExpiration(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (payload.exp) {
      // JWT exp is in seconds, convert to milliseconds
      return payload.exp * 1000;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Determine refresh method based on session data
 */
function getRefreshMethod(session: PersistedAuthWorkerState): 'oauth' | 'bearer' {
  const extractedVars = session.step2.extractedVars;
  
  // If we have refresh_token, use OAuth flow
  if (extractedVars.refresh_token) {
    return 'oauth';
  }
  
  // If we have refresh_url but no refresh_token, use Bearer token refresh
  if (extractedVars.refresh_url) {
    return 'bearer';
  }
  
  // Default to OAuth if we have client credentials
  if (extractedVars.client_id || extractedVars.clientId) {
    return 'oauth';
  }
  
  // Default to bearer for custom implementations
  return 'bearer';
}

/**
 * Refresh token using Bearer token flow (custom implementations)
 * Uses current access token to get new access token
 * Handles expired tokens - some endpoints accept expired tokens for refresh
 */
async function refreshBearerToken(
  session: PersistedAuthWorkerState,
  refreshUrl: string
): Promise<{ access_token: string; expires_in?: number; expires_at?: number }> {
  const accessToken = session.step2.extractedVars.access_token;
  if (!accessToken) {
    throw new Error('No access token available for Bearer token refresh');
  }

  // Check if token is expired
  const expiresAt = session.step2.extractedVars.expires_at 
    ? parseInt(session.step2.extractedVars.expires_at, 10) 
    : null;
  const isExpired = expiresAt ? Date.now() > expiresAt : false;

  if (isExpired) {
    console.log('[TokenRefresh] Token is expired, attempting refresh with expired token (some endpoints allow this)');
  }

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
    const errorText = await response.text();
    let errorDetails: any = {};
    try {
      errorDetails = JSON.parse(errorText);
    } catch {
      errorDetails = { error: errorText };
    }
    
    // If token is expired and we get 401/403, provide helpful error
    if (isExpired && (response.status === 401 || response.status === 403)) {
      throw new Error(
        `Bearer token refresh failed: Token is expired and endpoint does not accept expired tokens for refresh. ` +
        `Status: ${response.status} ${response.statusText}. ` +
        `You may need to re-authenticate.`
      );
    }
    
    throw new Error(
      `Bearer token refresh failed: ${response.status} ${response.statusText}. ` +
      `Details: ${errorDetails.error || errorText.substring(0, 200)}`
    );
  }

  const data = await response.json();
  
  // Handle nested tokenResult format (ushadvisors.com style)
  const tokenSource = data.tokenResult || data.data || data;
  const newAccessToken = tokenSource.access_token || data.access_token;
  
  if (!newAccessToken) {
    throw new Error('Refresh response missing access_token');
  }

  // Extract expiration
  let expiresAt: number | undefined;
  const expiresIn = tokenSource.expires_in || data.expires_in;
  
  if (expiresIn) {
    if (expiresIn > 1000000000) {
      // Unix timestamp (seconds) - convert to milliseconds
      expiresAt = expiresIn * 1000;
    } else {
      // Seconds until expiration - add to current time
      expiresAt = Date.now() + (expiresIn * 1000);
    }
  } else {
    // Try to extract from JWT
    expiresAt = extractJWTExpiration(newAccessToken) || undefined;
  }

  return {
    access_token: newAccessToken,
    expires_in: expiresIn,
    expires_at: expiresAt,
  };
}

/**
 * Refresh token using OAuth 2.0 refresh_token flow
 * Uses the API route which handles OAuth properly
 */
async function refreshOAuthToken(sessionId: string): Promise<{ access_token: string; expires_in?: number; expires_at?: number }> {
  const response = await fetch('/api/auth-worker/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(
      `OAuth token refresh failed: ${response.status} ${response.statusText}. ` +
      `Details: ${errorData.error || errorData.message || 'Unknown error'}`
    );
  }

  const result = await response.json();
  
  // The API route returns success, but we need to get the actual token
  // Re-fetch the session to get the updated token
  const updatedSession = getSessionById(sessionId);
  if (!updatedSession) {
    throw new Error('Session not found after refresh');
  }

  const newAccessToken = updatedSession.step2.extractedVars.access_token;
  if (!newAccessToken) {
    throw new Error('No access token in refreshed session');
  }

  // Extract expiration from updated session
  const expiresAtStr = updatedSession.step2.extractedVars.expires_at;
  const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : undefined;
  const expiresInStr = updatedSession.step2.extractedVars.expires_in;
  const expiresIn = expiresInStr ? parseInt(expiresInStr, 10) : undefined;

  return {
    access_token: newAccessToken,
    expires_in: expiresIn,
    expires_at: expiresAt,
  };
}

/**
 * Refresh token for a specific auth worker session
 * Automatically detects refresh method and handles both OAuth and Bearer token flows
 * Works on both client and server - automatically detects environment
 */
export async function refreshAuthWorkerToken(
  sessionId: string
): Promise<{ success: boolean; newToken?: string; error?: string; expiresAt?: number }> {
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
  const refreshToken = extractedVars.refresh_token;
  const refreshUrl = extractedVars.refresh_url;

  // Must have either refresh_token (OAuth) or refresh_url (Bearer)
  if (!refreshToken && !refreshUrl) {
    return { success: false, error: 'No refresh capability found (missing refresh_token and refresh_url)' };
  }

  try {
    const refreshMethod = getRefreshMethod(session);
    let refreshResult: { access_token: string; expires_in?: number; expires_at?: number };

    if (refreshMethod === 'oauth') {
      // Use OAuth refresh_token flow via API route
      refreshResult = await refreshOAuthToken(sessionId);
    } else {
      // Use Bearer token refresh flow (requires refreshUrl)
      if (!refreshUrl) {
        return { success: false, error: 'Bearer token refresh requires refresh_url' };
      }
      refreshResult = await refreshBearerToken(session, refreshUrl);
    }

    const { access_token: newToken, expires_at, expires_in } = refreshResult;

    // Update session with new token and expiration
    const updatedExtractedVars: PersistedAuthWorkerState['step2']['extractedVars'] = {
      ...extractedVars,
      access_token: newToken,
    };

    if (expires_at) {
      updatedExtractedVars.expires_at = expires_at.toString();
    }
    if (expires_in) {
      updatedExtractedVars.expires_in = expires_in.toString();
    } else if (expires_at) {
      // Calculate expires_in from expires_at if not provided
      const expiresInSeconds = Math.floor((expires_at - Date.now()) / 1000);
      if (expiresInSeconds > 0) {
        updatedExtractedVars.expires_in = expiresInSeconds.toString();
      }
    }

    // Update verification timestamp
    const updatedSession: PersistedAuthWorkerState = {
      ...session,
      step2: {
        ...session.step2,
        extractedVars: updatedExtractedVars,
        verificationStatus: {
          ...session.step2.verificationStatus,
          verifiedAt: Date.now(),
        },
      },
    };

    // Persist updated session (handles both client and server storage)
    persistAuthWorkerState(sessionId, updatedSession);

    return { 
      success: true, 
      newToken,
      expiresAt: expires_at || extractJWTExpiration(newToken) || undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[TokenRefreshService] Refresh failed:', {
      sessionId,
      error: errorMessage,
      refreshUrl,
    });
    
    return { 
      success: false, 
      error: errorMessage,
    };
  }
}

/**
 * Check if token needs refresh (within 5 minutes of expiration)
 * Uses JWT expiration if available, otherwise falls back to expires_at
 */
export function needsTokenRefresh(session: PersistedAuthWorkerState): boolean {
  const extractedVars = session.step2.extractedVars;
  const accessToken = extractedVars.access_token;
  
  if (!accessToken) {
    return false;
  }

  // First, try to get expiration from expires_at
  let expirationTime: number | null = null;
  
  if (extractedVars.expires_at) {
    expirationTime = parseInt(extractedVars.expires_at, 10);
  } else {
    // Try to extract from JWT
    expirationTime = extractJWTExpiration(accessToken);
  }

  // If no expiration info, check if we have refresh capability
  if (!expirationTime) {
    // If we have refresh_url, assume it might need refresh
    return !!extractedVars.refresh_url;
  }

  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  const timeUntilExpiry = expirationTime - now;

  // Refresh if expired or expires within 5 minutes
  return timeUntilExpiry < fiveMinutes;
}

/**
 * Get valid token for auth worker (refreshes if needed)
 * Works on both client and server - automatically detects environment
 */
export async function getValidToken(
  sessionId: string
): Promise<{ token: string; wasRefreshed: boolean; expiresAt?: number } | null> {
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
      return { 
        token: refreshResult.newToken, 
        wasRefreshed: true,
        expiresAt: refreshResult.expiresAt,
      };
    }
    // If refresh failed, return current token anyway (might still be valid)
    const expiresAt = extractJWTExpiration(token) || 
                     (session.step2.extractedVars.expires_at 
                       ? parseInt(session.step2.extractedVars.expires_at, 10) 
                       : undefined);
    return { token, wasRefreshed: false, expiresAt };
  }

  const expiresAt = extractJWTExpiration(token) || 
                   (session.step2.extractedVars.expires_at 
                     ? parseInt(session.step2.extractedVars.expires_at, 10) 
                     : undefined);
  return { token, wasRefreshed: false, expiresAt };
}
