/**
 * Token Refresh Hook
 * 
 * Automatically refreshes auth worker tokens before expiration
 */

import { useEffect, useRef, useCallback } from 'react';
import { listAllSessions, getSessionById } from '../utils/authWorkerPersistence';
import { eventBus } from '../utils/eventBus';
import { generateRequestId } from '../utils/correlationIds';

const REFRESH_CHECK_INTERVAL_MS = 60000; // Check every minute
const PROACTIVE_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiration

export function useTokenRefresh(enabled: boolean = true) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastRefreshRef = useRef<Map<string, number>>(new Map());

  const refreshTokenForSession = useCallback(async (sessionId: string) => {
    const requestId = generateRequestId();
    const refreshStartTime = Date.now();
    
    // Emit TOKEN_REFRESH_START event
    eventBus.emit({
      level: 'auth',
      component: 'auth',
      message: `Token refresh started for session ${sessionId.substring(0, 8)}...`,
      auth: {
        eventType: 'TOKEN_REFRESH_START',
        workerId: sessionId,
      },
      requestId,
    });
    
    try {
      const response = await fetch('/api/auth-worker/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
      });

      if (!response.ok) {
        // Read response body (can only read once)
        const contentType = response.headers.get('content-type') || '';
        let errorDetails: any = null;
        let errorText = '';
        
        try {
          // Try to read as text first (most reliable)
          errorText = await response.text();
          
          // Try to parse as JSON if it looks like JSON
          if (errorText && errorText.trim()) {
            if (errorText.trim().startsWith('{') || errorText.trim().startsWith('[')) {
              try {
                const parsed = JSON.parse(errorText);
                // Check if parsed result is empty object/array
                if (typeof parsed === 'object' && parsed !== null) {
                  if (Array.isArray(parsed) && parsed.length === 0) {
                    errorDetails = {
                      error: `HTTP ${response.status} ${response.statusText}`,
                      message: 'Empty array response',
                      rawResponse: errorText,
                    };
                  } else if (Object.keys(parsed).length === 0) {
                    errorDetails = {
                      error: `HTTP ${response.status} ${response.statusText}`,
                      message: 'Empty object response',
                      rawResponse: errorText,
                      note: 'API returned empty JSON object {}',
                    };
                  } else {
                    errorDetails = parsed;
                  }
                } else {
                  errorDetails = {
                    error: `HTTP ${response.status} ${response.statusText}`,
                    message: String(parsed),
                    rawResponse: errorText,
                  };
                }
              } catch {
                // Not valid JSON, use as text
                errorDetails = {
                  error: `HTTP ${response.status} ${response.statusText}`,
                  message: errorText.substring(0, 500),
                  rawResponse: errorText,
                };
              }
            } else {
              errorDetails = {
                error: `HTTP ${response.status} ${response.statusText}`,
                message: errorText.substring(0, 500),
                rawResponse: errorText,
              };
            }
          } else {
            // Empty response
            errorDetails = {
              error: `HTTP ${response.status} ${response.statusText}`,
              message: 'Empty response body',
              status: response.status,
              statusText: response.statusText,
            };
          }
        } catch (readError) {
          // Failed to read response
          errorDetails = {
            error: `HTTP ${response.status} ${response.statusText}`,
            message: 'Failed to read response body',
            readError: readError instanceof Error ? readError.message : String(readError),
            status: response.status,
            statusText: response.statusText,
          };
        }
        
        // Ensure we always have error details
        if (!errorDetails || (typeof errorDetails === 'object' && Object.keys(errorDetails).length === 0)) {
          errorDetails = {
            error: `HTTP ${response.status} ${response.statusText}`,
            message: 'Unknown error - empty error details',
            status: response.status,
            statusText: response.statusText,
            contentType,
          };
        }
        
        // Build error log with guaranteed non-empty values
        const errorLog: Record<string, any> = {
          status: String(response.status),
          statusText: String(response.statusText || 'Unknown'),
          url: '/api/auth-worker/refresh',
          contentType: String(contentType || 'unknown'),
          sessionId: String(sessionId),
        };
        
        // Add error details - always ensure we have something
        if (errorDetails) {
          if (typeof errorDetails === 'object' && errorDetails !== null) {
            const keys = Object.keys(errorDetails);
            if (keys.length > 0) {
              errorLog.errorDetails = errorDetails;
            } else {
              errorLog.errorDetails = { 
                message: 'API returned empty JSON object {}',
                note: 'The refresh endpoint returned an empty error object',
              };
            }
          } else if (typeof errorDetails === 'string' && errorDetails.length > 0) {
            errorLog.errorMessage = errorDetails;
          } else {
            errorLog.errorDetails = { message: String(errorDetails || 'Unknown error') };
          }
        } else {
          errorLog.errorDetails = { 
            message: 'No error details available',
            note: 'Failed to extract error information from response',
          };
        }
        
        // Add text info
        errorLog.hasErrorText = !!errorText;
        errorLog.errorTextLength = errorText ? errorText.length : 0;
        if (errorText && errorText.length > 0) {
          errorLog.errorTextPreview = errorText.substring(0, 200);
        } else {
          errorLog.errorTextPreview = '(empty)';
        }
        
        // Log with explicit string conversion to avoid empty object issues
        console.error(`[TokenRefresh] Failed to refresh token for session ${sessionId}:`, JSON.stringify(errorLog, null, 2));
        console.error(`[TokenRefresh] Error details object:`, errorDetails);
        console.error(`[TokenRefresh] Error text:`, errorText || '(empty)');
        
        // Emit TOKEN_REFRESH_FAIL event
        eventBus.emit({
          level: 'error',
          component: 'auth',
          message: `Token refresh failed for session ${sessionId.substring(0, 8)}...`,
          auth: {
            eventType: 'TOKEN_REFRESH_FAIL',
            workerId: sessionId,
            refreshAttempted: true,
            refreshSucceeded: false,
          },
          error: {
            message: errorDetails?.error || errorText || 'Unknown error',
            name: 'TokenRefreshError',
            stack: errorDetails?.stack,
          },
          requestId,
        });
        
        return false;
      }

      const result = await response.json();
      const refreshEndTime = Date.now();
      
      // Get expires_at if available
      let expiresAt: number | undefined;
      try {
        if (result.expires_in) {
          expiresAt = refreshEndTime + (result.expires_in * 1000);
        } else if (result.expiresAt) {
          expiresAt = new Date(result.expiresAt).getTime();
        }
      } catch {
        // Ignore
      }
      
      console.log(`[TokenRefresh] ✅ Token refreshed for session ${sessionId}`);
      lastRefreshRef.current.set(sessionId, refreshEndTime);
      
      // Emit TOKEN_REFRESH_SUCCESS event
      eventBus.emit({
        level: 'auth',
        component: 'auth',
        message: `Token refresh succeeded for session ${sessionId.substring(0, 8)}...`,
        auth: {
          eventType: 'TOKEN_REFRESH_SUCCESS',
          workerId: sessionId,
          expiresAt,
          refreshSucceeded: true,
        },
        requestId,
      });
      
      // Emit TOKEN_EXPIRES_AT_UPDATED if we have expiresAt
      if (expiresAt) {
        eventBus.emit({
          level: 'auth',
          component: 'auth',
          message: `Token expires at ${new Date(expiresAt).toISOString()}`,
          auth: {
            eventType: 'TOKEN_EXPIRES_AT_UPDATED',
            workerId: sessionId,
            expiresAt,
          },
          requestId,
        });
      }
      
      return true;
    } catch (error) {
      console.error(`[TokenRefresh] Network/parse error refreshing token for session ${sessionId}:`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return false;
    }
  }, []);

  const checkAndRefreshTokens = useCallback(() => {
    if (!enabled) return;

    try {
      const sessions = listAllSessions();
      
      for (const session of sessions) {
        const fullSession = getSessionById(session.sessionId);
        if (!fullSession) continue;

        const extractedVars = fullSession.step2.extractedVars;
        const accessToken = extractedVars.access_token;
        
        // Must have access token
        if (!accessToken) continue;
        
        // Must have refresh capability (either refresh_token OR refresh_url)
        const hasRefreshToken = !!extractedVars.refresh_token;
        const hasRefreshUrl = !!extractedVars.refresh_url;
        
        if (!hasRefreshToken && !hasRefreshUrl) {
          // No refresh capability, skip
          continue;
        }

        // Extract expiration time from expires_at or JWT
        let expirationTime: number | null = null;
        
        if (extractedVars.expires_at) {
          expirationTime = parseInt(extractedVars.expires_at, 10);
        } else {
          // Try to extract from JWT
          try {
            const parts = accessToken.split('.');
            if (parts.length === 3) {
              const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
              if (payload.exp) {
                expirationTime = payload.exp * 1000; // JWT exp is in seconds
              }
            }
          } catch {
            // JWT parsing failed
          }
        }

        // If no expiration info, skip (can't determine if refresh needed)
        if (!expirationTime) {
          continue;
        }

        const now = Date.now();
        const timeUntilExpiry = expirationTime - now;
        const timeUntilExpiryWithBuffer = timeUntilExpiry - PROACTIVE_REFRESH_BUFFER_MS;

        // Refresh if expired or within buffer window (5 minutes before expiration)
        const shouldRefresh = 
          timeUntilExpiry <= 0 || // Already expired
          (timeUntilExpiryWithBuffer <= 0 && timeUntilExpiry > 0); // Within buffer window

        if (shouldRefresh) {
          // Don't refresh too frequently (max once per 5 minutes per session)
          const lastRefresh = lastRefreshRef.current.get(session.sessionId) || 0;
          const timeSinceLastRefresh = now - lastRefresh;
          
          if (timeSinceLastRefresh > 5 * 60 * 1000) {
            const minutesUntilExpiry = Math.floor(timeUntilExpiry / 1000 / 60);
            console.log(`[TokenRefresh] 🔄 Refreshing token for session ${session.sessionId} (expires in ${minutesUntilExpiry}min, method: ${hasRefreshToken ? 'OAuth' : 'Bearer'})`);
            refreshTokenForSession(session.sessionId);
          }
        }
      }
    } catch (error) {
      console.error('[TokenRefresh] Error checking tokens:', error);
    }
  }, [enabled, refreshTokenForSession]);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial check
    checkAndRefreshTokens();

    // Set up interval
    intervalRef.current = setInterval(() => {
      checkAndRefreshTokens();
    }, REFRESH_CHECK_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, checkAndRefreshTokens]);

  return {
    refreshToken: refreshTokenForSession,
    checkTokens: checkAndRefreshTokens,
  };
}
