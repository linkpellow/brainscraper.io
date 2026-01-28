/**
 * Token Refresh Service
 * 
 * Industry-standard token refresh implementation supporting:
 * - OAuth 2.0 refresh_token flow (standard OAuth)
 * - Bearer token refresh flow (custom implementations like ushadvisors.com)
 * - Automatic JWT expiration extraction and validation
 * - Proper error handling and retry logic with exponential backoff
 * - Client and server-side storage synchronization
 * - Failure tracking and adaptive refresh timing
 * - Token verification after refresh
 * - Clock skew detection
 */

import type { PersistedAuthWorkerState } from './authWorkerPersistence';
import { getSessionById, persistAuthWorkerState, updateSessionTokens } from './authWorkerPersistence';

/**
 * Track refresh failures per session for adaptive behavior
 */
const refreshFailureTracker = new Map<string, {
  consecutiveFailures: number;
  lastFailureTime: number;
  lastFailureError: string;
  lastSuccessTime: number;
}>();

/**
 * Maximum number of consecutive failures before alerting
 */
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Base delay for exponential backoff (in milliseconds)
 */
const BASE_RETRY_DELAY_MS = 1000; // 1 second

/**
 * Maximum retry delay (in milliseconds)
 */
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Clock skew tolerance (in milliseconds)
 * If server clock is off by more than this, we adjust expiration checks
 */
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Track detected clock skew per session
 */
const clockSkewTracker = new Map<string, number>();

/**
 * Track in-flight refresh requests to prevent concurrent refreshes (request deduplication)
 */
const inFlightRefreshes = new Map<string, Promise<{ access_token: string; expires_in?: number; expires_at?: number }>>();

/**
 * Track in-flight refresh operations at the session level (prevents concurrent refreshAuthWorkerToken calls)
 */
const inFlightRefreshOperations = new Map<string, Promise<{ success: boolean; newToken?: string; error?: string; expiresAt?: number; retried?: boolean }>>();

/**
 * Request timeout for refresh calls (30 seconds)
 */
const REFRESH_REQUEST_TIMEOUT_MS = 30000;

/**
 * Extract origin domain from refresh URL for headers
 */
function extractOriginFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}`;
  } catch {
    // Fallback: try to extract domain from common patterns
    const match = url.match(/https?:\/\/([^\/]+)/);
    return match ? `https://${match[1]}` : 'https://agent.ushadvisors.com';
  }
}

/**
 * Detect and account for clock skew
 * Compares JWT expiration with stored expiration to detect clock differences
 */
function detectClockSkew(session: PersistedAuthWorkerState): number {
  const extractedVars = session.step2.extractedVars;
  const accessToken = extractedVars.access_token;
  
  if (!accessToken || !extractedVars.expires_at) {
    return 0; // No skew detected
  }

  const storedExpiresAt = parseInt(extractedVars.expires_at, 10);
  const jwtExpiresAt = extractJWTExpiration(accessToken);

  if (!jwtExpiresAt || !storedExpiresAt) {
    return 0; // Can't detect skew
  }

  // If stored expiration and JWT expiration differ significantly, there's clock skew
  const diff = storedExpiresAt - jwtExpiresAt;
  
  // Only consider it clock skew if difference is significant (> 1 minute)
  if (Math.abs(diff) > 60 * 1000) {
    const skew = diff; // Positive = server is ahead, negative = server is behind
    clockSkewTracker.set(session.sessionId, skew);
    return skew;
  }

  return 0;
}

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
 * 
 * IMPROVEMENTS:
 * - Request timeout (30 seconds) to prevent hanging requests
 * - Request deduplication to prevent concurrent refreshes
 * - Additional headers (Origin, Referer, User-Agent) matching browser behavior
 * - Robust JSON parsing with error handling
 * - URL validation before attempting refresh
 */
export async function refreshBearerToken(
  session: PersistedAuthWorkerState,
  refreshUrl: string
): Promise<{ access_token: string; expires_in?: number; expires_at?: number }> {
  const accessToken = session.step2.extractedVars.access_token;
  if (!accessToken) {
    throw new Error('No access token available for Bearer token refresh');
  }

  // Validate refresh URL
  if (!refreshUrl || typeof refreshUrl !== 'string') {
    throw new Error('Invalid refresh URL');
  }
  
  try {
    new URL(refreshUrl);
  } catch {
    throw new Error(`Invalid refresh URL format: ${refreshUrl}`);
  }

  // Check if token is expired
  const expiresAt = session.step2.extractedVars.expires_at 
    ? parseInt(session.step2.extractedVars.expires_at, 10) 
    : null;
  const isExpired = expiresAt ? Date.now() > expiresAt : false;

  if (isExpired) {
    console.log('[TokenRefresh] Token is expired, attempting refresh with expired token (some endpoints allow this)');
  }

  // Request deduplication: Check if refresh is already in-flight
  const inFlightKey = `${session.sessionId}:${refreshUrl}`;
  const existingRefresh = inFlightRefreshes.get(inFlightKey);
  if (existingRefresh) {
    console.log('[TokenRefresh] Refresh already in-flight, waiting for existing request...');
    return existingRefresh;
  }

  // Create refresh promise with timeout and proper headers
  const refreshPromise = (async () => {
    try {
      // Extract origin from refresh URL for headers
      const origin = extractOriginFromUrl(refreshUrl);
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, REFRESH_REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(refreshUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
            'Origin': origin,
            'Referer': `${origin}/`,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
            'Connection': 'keep-alive',
          },
          body: JSON.stringify({}),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorText: string;
          try {
            errorText = await response.text();
          } catch {
            errorText = `Failed to read error response (status: ${response.status})`;
          }
          
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

        // Robust JSON parsing with error handling
        let data: any;
        try {
          const responseText = await response.text();
          if (!responseText || responseText.trim().length === 0) {
            throw new Error('Empty response body');
          }
          data = JSON.parse(responseText);
        } catch (parseError) {
          throw new Error(
            `Failed to parse refresh response as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
          );
        }
        
        // Handle nested tokenResult format (ushadvisors.com style)
        const tokenSource = data.tokenResult || data.data || data;
        const newAccessToken = tokenSource.access_token || data.access_token;
        
        if (!newAccessToken || typeof newAccessToken !== 'string') {
          throw new Error('Refresh response missing or invalid access_token');
        }

        // Extract expiration
        let newExpiresAt: number | undefined;
        const expiresIn = tokenSource.expires_in || data.expires_in;
        
        if (expiresIn !== undefined && expiresIn !== null) {
          if (expiresIn > 1000000000) {
            // Unix timestamp (seconds) - convert to milliseconds
            newExpiresAt = expiresIn * 1000;
          } else {
            // Seconds until expiration - add to current time
            newExpiresAt = Date.now() + (expiresIn * 1000);
          }
        } else {
          // Try to extract from JWT
          newExpiresAt = extractJWTExpiration(newAccessToken) || undefined;
        }

        return {
          access_token: newAccessToken,
          expires_in: expiresIn,
          expires_at: newExpiresAt,
        };
      } catch (fetchError) {
        clearTimeout(timeoutId);
        
        // Handle timeout specifically
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error(`Request timeout after ${REFRESH_REQUEST_TIMEOUT_MS}ms`);
        }
        
        throw fetchError;
      }
    } finally {
      // Remove from in-flight map when done (success or failure)
      inFlightRefreshes.delete(inFlightKey);
    }
  })();

  // Store promise for deduplication
  inFlightRefreshes.set(inFlightKey, refreshPromise);
  
  return refreshPromise;
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
 * Verify that a token is valid (not expired and properly formatted)
 */
function verifyToken(token: string): { valid: boolean; expiresAt?: number; error?: string } {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid JWT format' };
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    const expiresAt = payload.exp ? payload.exp * 1000 : undefined;
    
    if (expiresAt && expiresAt <= Date.now()) {
      return { valid: false, expiresAt, error: 'Token is expired' };
    }

    return { valid: true, expiresAt };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Token verification failed' };
  }
}

/**
 * Refresh token for a specific auth worker session with retry logic
 * Automatically detects refresh method and handles both OAuth and Bearer token flows
 * Works on both client and server - automatically detects environment
 * 
 * @param sessionId - Session ID to refresh
 * @param retryAttempt - Current retry attempt (internal use)
 * @param maxRetries - Maximum number of retry attempts
 */
export async function refreshAuthWorkerToken(
  sessionId: string,
  retryAttempt: number = 0,
  maxRetries: number = 3
): Promise<{ success: boolean; newToken?: string; error?: string; expiresAt?: number; retried?: boolean }> {
  // Request deduplication: If refresh is already in-flight for this session, wait for it
  // (Skip deduplication on retries to allow retry logic to work)
  if (retryAttempt === 0) {
    const existingOperation = inFlightRefreshOperations.get(sessionId);
    if (existingOperation) {
      console.log('[TokenRefreshService] Refresh operation already in-flight for session, waiting...');
      return existingOperation;
    }
  }

  // Create refresh operation promise
  const refreshOperation = (async () => {
    try {
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

        // CRITICAL: Verify the new token is valid before saving
        const verification = verifyToken(newToken);
        if (!verification.valid) {
          const errorMsg = `Refreshed token is invalid: ${verification.error}`;
          console.error('[TokenRefreshService] Refreshed token verification failed:', {
            sessionId,
            error: errorMsg,
            tokenExpiresAt: verification.expiresAt,
          });

          // Retry if we haven't exceeded max retries
          if (retryAttempt < maxRetries) {
            const delay = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, retryAttempt), MAX_RETRY_DELAY_MS);
            console.log(`[TokenRefreshService] Retrying refresh in ${delay}ms (attempt ${retryAttempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return refreshAuthWorkerToken(sessionId, retryAttempt + 1, maxRetries);
          }

          // Track failure
          const tracker = refreshFailureTracker.get(sessionId) || {
            consecutiveFailures: 0,
            lastFailureTime: 0,
            lastFailureError: '',
            lastSuccessTime: 0,
          };
          tracker.consecutiveFailures++;
          tracker.lastFailureTime = Date.now();
          tracker.lastFailureError = errorMsg;
          refreshFailureTracker.set(sessionId, tracker);

          return { 
            success: false, 
            error: errorMsg,
            retried: retryAttempt > 0,
          };
        }

        // Update session with new token and expiration
        const updatedExtractedVars: PersistedAuthWorkerState['step2']['extractedVars'] = {
          ...extractedVars,
          access_token: newToken,
        };

        // Use verified expiration or provided expiration
        const finalExpiresAt = verification.expiresAt || expires_at;
        if (finalExpiresAt) {
          updatedExtractedVars.expires_at = finalExpiresAt.toString();
        }
        if (expires_in) {
          updatedExtractedVars.expires_in = expires_in.toString();
        } else if (finalExpiresAt) {
          // Calculate expires_in from expires_at if not provided
          const expiresInSeconds = Math.floor((finalExpiresAt - Date.now()) / 1000);
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
        // CRITICAL: Must await to ensure token is saved before returning success
        await persistAuthWorkerState(sessionId, updatedSession);

        // Track success (reset failure counter)
        const tracker = refreshFailureTracker.get(sessionId);
        if (tracker) {
          tracker.consecutiveFailures = 0;
          tracker.lastSuccessTime = Date.now();
          tracker.lastFailureError = '';
        } else {
          refreshFailureTracker.set(sessionId, {
            consecutiveFailures: 0,
            lastFailureTime: 0,
            lastFailureError: '',
            lastSuccessTime: Date.now(),
          });
        }

        return { 
          success: true, 
          newToken,
          expiresAt: finalExpiresAt,
          retried: retryAttempt > 0,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Retry on network errors or transient failures
        const isNetworkError = errorMessage.includes('fetch') || 
                              errorMessage.includes('network') ||
                              errorMessage.includes('timeout') ||
                              errorMessage.includes('ECONNREFUSED') ||
                              errorMessage.includes('ETIMEDOUT') ||
                              errorMessage.includes('AbortError');
        
        // Retry on rate limit (429) - use Retry-After header if available
        const is429 = errorMessage.includes('429');
        
        // Retry on server errors (5xx) - these are typically transient
        const is5xx = errorMessage.includes('500') || 
                     errorMessage.includes('502') || 
                     errorMessage.includes('503') || 
                     errorMessage.includes('504');
        
        // Also retry on 401/403 - sometimes these are transient (rate limits, temporary API issues)
        // BUT only if the error message doesn't indicate the token is definitively expired
        const is401or403 = errorMessage.includes('401') || errorMessage.includes('403');
        const isDefinitelyExpired = errorMessage.includes('expired') && 
                                   errorMessage.includes('does not accept expired tokens');
        
        // Retry 401/403 only if not definitively expired (transient auth issues can be retried)
        const isAuthRetryable = is401or403 && !isDefinitelyExpired;
        
        const isRetryable = isNetworkError || isAuthRetryable || is429 || is5xx;

        if (isRetryable && retryAttempt < maxRetries) {
          // Determine retry delay based on error type
          let delayMs: number;
          
          if (is429) {
            // Rate limit: use longer delay (10s base)
            delayMs = Math.min(10000 * Math.pow(2, retryAttempt), MAX_RETRY_DELAY_MS);
            console.log(`[TokenRefreshService] Rate limited (429), waiting ${delayMs}ms before retry...`);
          } else if (is5xx) {
            // Server error: moderate delay (5s base)
            delayMs = Math.min(5000 * Math.pow(2, retryAttempt), MAX_RETRY_DELAY_MS);
            console.log(`[TokenRefreshService] Server error (5xx), retrying in ${delayMs}ms...`);
          } else if (isAuthRetryable) {
            // Auth error: longer delay (4s base)
            delayMs = Math.min(BASE_RETRY_DELAY_MS * 2 * Math.pow(2, retryAttempt), MAX_RETRY_DELAY_MS);
          } else {
            // Network error: standard exponential backoff
            delayMs = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, retryAttempt), MAX_RETRY_DELAY_MS);
          }
          
          // Add jitter (0-500ms) to prevent thundering herd
          const jitter = Math.random() * 500;
          delayMs += jitter;
          
          const errorType = is429 ? 'rate-limit' : is5xx ? 'server' : isAuthRetryable ? 'auth' : 'network';
          console.log(`[TokenRefreshService] Retrying refresh after ${errorType} error in ${Math.round(delayMs)}ms (attempt ${retryAttempt + 1}/${maxRetries}):`, errorMessage);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          return refreshAuthWorkerToken(sessionId, retryAttempt + 1, maxRetries);
        }

        console.error('[TokenRefreshService] Refresh failed:', {
          sessionId,
          error: errorMessage,
          refreshUrl,
          retryAttempt,
          isRetryable,
        });

        // Track failure
        const tracker = refreshFailureTracker.get(sessionId) || {
          consecutiveFailures: 0,
          lastFailureTime: 0,
          lastFailureError: '',
          lastSuccessTime: 0,
        };
        tracker.consecutiveFailures++;
        tracker.lastFailureTime = Date.now();
        tracker.lastFailureError = errorMessage;
        refreshFailureTracker.set(sessionId, tracker);

        // Alert if too many consecutive failures
        if (tracker.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.error(`[TokenRefreshService] ⚠️ ALERT: ${tracker.consecutiveFailures} consecutive refresh failures for session ${sessionId.substring(0, 8)}...`);
          console.error(`[TokenRefreshService] Last error: ${tracker.lastFailureError}`);
          console.error(`[TokenRefreshService] Last success: ${tracker.lastSuccessTime ? new Date(tracker.lastSuccessTime).toISOString() : 'Never'}`);
        }
        
        return { 
          success: false, 
          error: errorMessage,
          retried: retryAttempt > 0,
        };
      }
    } finally {
      // Remove from in-flight map when done (only on first attempt)
      if (retryAttempt === 0) {
        inFlightRefreshOperations.delete(sessionId);
      }
    }
  })();

  // Store operation promise for deduplication (only on first attempt)
  if (retryAttempt === 0) {
    inFlightRefreshOperations.set(sessionId, refreshOperation);
  }

  return refreshOperation;
}

/**
 * Check if token needs refresh (within 30 minutes of expiration, or earlier if previous refresh failed)
 * Uses JWT expiration if available, otherwise falls back to expires_at
 * 
 * CRITICAL: This ensures tokens are refreshed proactively before expiration,
 * preventing DNC scrub API calls from failing due to expired tokens.
 * 
 * Adaptive behavior: If previous refresh failed, refresh earlier to give more time for retries.
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

  // Detect clock skew and adjust
  const clockSkew = detectClockSkew(session);
  const now = Date.now() + clockSkew; // Adjust for clock skew
  
  // Base refresh buffer: 2 HOURS before expiration (MUST match server.js)
  // This aggressive buffer accounts for: Railway deployments, network issues, retry delays
  let PROACTIVE_REFRESH_BUFFER_MS = 2 * 60 * 60 * 1000; // 2 hours
  
  // Add clock skew tolerance to buffer
  if (Math.abs(clockSkew) > CLOCK_SKEW_TOLERANCE_MS) {
    PROACTIVE_REFRESH_BUFFER_MS += Math.abs(clockSkew);
    console.log(`[TokenRefreshService] Clock skew detected: ${Math.round(clockSkew / 1000 / 60)}min, adjusted buffer to ${Math.round(PROACTIVE_REFRESH_BUFFER_MS / 1000 / 60)}min`);
  }
  
  // Adaptive refresh: If previous refresh failed, refresh earlier to allow for retries
  const tracker = refreshFailureTracker.get(session.sessionId);
  if (tracker && tracker.consecutiveFailures > 0) {
    // Add extra buffer based on failure count (up to 2 hours for critical failures)
    const extraBuffer = Math.min(tracker.consecutiveFailures * 30 * 60 * 1000, 2 * 60 * 60 * 1000);
    PROACTIVE_REFRESH_BUFFER_MS += extraBuffer;
    console.log(`[TokenRefreshService] Adaptive refresh: ${tracker.consecutiveFailures} previous failures, using ${PROACTIVE_REFRESH_BUFFER_MS / 1000 / 60}min buffer`);
  }
  
  const timeUntilExpiry = expirationTime - now;

  // Refresh if expired or expires within buffer window
  return timeUntilExpiry <= 0 || timeUntilExpiry < PROACTIVE_REFRESH_BUFFER_MS;
}

/**
 * Get refresh failure statistics for a session
 */
export function getRefreshFailureStats(sessionId: string): {
  consecutiveFailures: number;
  lastFailureTime: number | null;
  lastFailureError: string | null;
  lastSuccessTime: number | null;
  needsAttention: boolean;
} {
  const tracker = refreshFailureTracker.get(sessionId);
  if (!tracker) {
    return {
      consecutiveFailures: 0,
      lastFailureTime: null,
      lastFailureError: null,
      lastSuccessTime: null,
      needsAttention: false,
    };
  }

  return {
    consecutiveFailures: tracker.consecutiveFailures,
    lastFailureTime: tracker.lastFailureTime || null,
    lastFailureError: tracker.lastFailureError || null,
    lastSuccessTime: tracker.lastSuccessTime || null,
    needsAttention: tracker.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES,
  };
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
      // Verify the refreshed token is actually valid
      const verification = verifyToken(refreshResult.newToken);
      if (verification.valid) {
        return { 
          token: refreshResult.newToken, 
          wasRefreshed: true,
          expiresAt: refreshResult.expiresAt,
        };
      } else {
        console.error('[TokenRefreshService] Refreshed token failed verification:', verification.error);
        // Fall through to return current token
      }
    } else {
      // Refresh failed - log warning but continue with current token
      const failureStats = getRefreshFailureStats(sessionId);
      if (failureStats.needsAttention) {
        console.warn(`[TokenRefreshService] ⚠️ Refresh failed for session ${sessionId.substring(0, 8)}... (${failureStats.consecutiveFailures} consecutive failures)`);
      }
    }
    
    // If refresh failed, return current token anyway (might still be valid)
    // But verify it's not expired
    const expiresAt = extractJWTExpiration(token) || 
                     (session.step2.extractedVars.expires_at 
                       ? parseInt(session.step2.extractedVars.expires_at, 10) 
                       : undefined);
    
    // Check if current token is expired
    if (expiresAt && expiresAt <= Date.now()) {
      console.error('[TokenRefreshService] ⚠️ Current token is expired and refresh failed - token may not work');
    }
    
    return { token, wasRefreshed: false, expiresAt };
  }

  const expiresAt = extractJWTExpiration(token) || 
                   (session.step2.extractedVars.expires_at 
                     ? parseInt(session.step2.extractedVars.expires_at, 10) 
                     : undefined);
  return { token, wasRefreshed: false, expiresAt };
}
