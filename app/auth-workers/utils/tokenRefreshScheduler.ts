/**
 * Scheduled token refresh check.
 * Runs inside Next.js (API route); used by /api/auth-worker/cron-refresh.
 * Logic extracted from server.js to avoid require() of bundled auth-worker modules.
 */

import { listSessionsFromServer, getSessionFromServer } from './authWorkerServerStorage';
import { refreshAuthWorkerToken, getRefreshFailureStats, needsTokenRefresh } from './tokenRefreshService';

const PROACTIVE_REFRESH_BUFFER_MS = 2 * 60 * 60 * 1000; // 2 hours
const URGENT_REFRESH_THRESHOLD_MS = 1 * 60 * 60 * 1000; // 1 hour

export interface TokenRefreshCheckResult {
  urgent: boolean;
  checked: number;
  refreshed: number;
  errors: string[];
}

function extractExpirationFromJwt(accessToken: string): number | null {
  try {
    const parts = accessToken.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export async function runTokenRefreshCheck(): Promise<TokenRefreshCheckResult> {
  let urgent = false;
  let checked = 0;
  let refreshed = 0;
  const errors: string[] = [];

  try {
    const sessions = listSessionsFromServer();
    if (sessions.length === 0) {
      return { urgent: false, checked: 0, refreshed: 0, errors: [] };
    }

    console.log(`[Server] Checking ${sessions.length} auth worker(s) for token refresh...`);

    for (const sessionMeta of sessions) {
      try {
        const session = getSessionFromServer(sessionMeta.sessionId);
        if (!session) continue;

        const extractedVars = session.step2.extractedVars;
        const accessToken = extractedVars.access_token;
        if (!accessToken) continue;

        const hasRefreshToken = !!extractedVars.refresh_token;
        const hasRefreshUrl = !!extractedVars.refresh_url;
        if (!hasRefreshToken && !hasRefreshUrl) continue;

        let expirationTime: number | null = null;
        if (extractedVars.expires_at) {
          expirationTime = parseInt(extractedVars.expires_at, 10);
        } else {
          expirationTime = extractExpirationFromJwt(accessToken);
        }
        if (!expirationTime) continue;

        checked += 1;

        const now = Date.now();
        const timeUntilExpiry = expirationTime - now;
        const minutesUntilExpiry = Math.floor(timeUntilExpiry / 1000 / 60);
        const isExpired = timeUntilExpiry <= 0;
        const isUrgent = timeUntilExpiry <= URGENT_REFRESH_THRESHOLD_MS && !isExpired;

        if (isUrgent) {
          urgent = true;
        }

        // CRITICAL: Use needsTokenRefresh to get adaptive buffer for previous failures
        // This ensures tokens are refreshed earlier if previous attempts failed
        const shouldRefresh = needsTokenRefresh(session);

        if (!shouldRefresh) {
          // Log why refresh is skipped (for debugging)
          const failureStats = getRefreshFailureStats(sessionMeta.sessionId);
          if (failureStats.consecutiveFailures > 0) {
            console.warn(
              `[Server] ⚠️ Skipping refresh for ${sessionMeta.targetDomain || sessionMeta.sessionId} (expires in ${minutesUntilExpiry}min, ${failureStats.consecutiveFailures} previous failures) - buffer not reached yet`
            );
          } else if (isUrgent) {
            console.log(
              `[Server] 📊 Token for ${sessionMeta.targetDomain || sessionMeta.sessionId} expires in ${minutesUntilExpiry}min (monitoring)`
            );
          }
          continue;
        }

        const urgency = isExpired
          ? 'CRITICAL (expired)'
          : timeUntilExpiry < 5 * 60 * 1000
            ? 'URGENT (<5min)'
            : timeUntilExpiry < 15 * 60 * 1000
              ? 'HIGH (<15min)'
              : timeUntilExpiry < 60 * 60 * 1000
                ? 'ELEVATED (<1hr)'
                : 'NORMAL';

        console.log(
          `[Server] 🔄 Auto-refreshing token for ${sessionMeta.targetDomain || sessionMeta.sessionId} (${urgency}, expires in ${minutesUntilExpiry}min)`
        );

        try {
          const failureStats = getRefreshFailureStats(sessionMeta.sessionId);
          if (failureStats.needsAttention) {
            console.warn(
              `[Server] ⚠️ Session ${sessionMeta.sessionId.substring(0, 8)}... has ${failureStats.consecutiveFailures} consecutive failures`
            );
            console.warn(`[Server] Last error: ${failureStats.lastFailureError}`);
          }

          const refreshResult = await refreshAuthWorkerToken(sessionMeta.sessionId);

          if (refreshResult.success && refreshResult.newToken) {
            refreshed += 1;
            const newExpiresAt = refreshResult.expiresAt;
            const newTimeUntilExpiry = newExpiresAt ? newExpiresAt - Date.now() : null;
            const newMinutesUntilExpiry = newTimeUntilExpiry
              ? Math.floor(newTimeUntilExpiry / 1000 / 60)
              : null;
            console.log(
              `[Server] ✅ Token refreshed for ${sessionMeta.targetDomain || sessionMeta.sessionId}`,
              {
                expiresAt: newExpiresAt ? new Date(newExpiresAt).toISOString() : 'unknown',
                expiresIn: newMinutesUntilExpiry ? `${newMinutesUntilExpiry}min` : 'unknown',
                retried: refreshResult.retried ? 'yes' : 'no',
              }
            );
            if (
              newTimeUntilExpiry &&
              newTimeUntilExpiry <= URGENT_REFRESH_THRESHOLD_MS &&
              newTimeUntilExpiry > 0
            ) {
              urgent = true;
            }
          } else {
            const errorMsg = refreshResult.error || 'Unknown error';
            errors.push(`${sessionMeta.sessionId}: ${errorMsg}`);
            console.error(
              `[Server] ❌ Token refresh failed for ${sessionMeta.targetDomain || sessionMeta.sessionId}:`,
              errorMsg
            );
            if (isExpired) {
              console.error(`[Server] 🚨🚨🚨 CRITICAL ALERT 🚨🚨🚨`);
              console.error(`[Server] 🚨 Token is EXPIRED and refresh FAILED`);
              console.error(`[Server] 🚨 Session: ${sessionMeta.targetDomain || sessionMeta.sessionId}`);
              console.error(`[Server] 🚨 Error: ${errorMsg}`);
              console.error(`[Server] 🚨 DNC scrub API calls will fail until re-authenticated`);
              console.error(`[Server] 🚨 ACTION REQUIRED: Create new auth worker from fresh HAR file`);
              console.error(`[Server] 🚨🚨🚨 END CRITICAL ALERT 🚨🚨🚨`);
            } else if (timeUntilExpiry < 30 * 60 * 1000) {
              console.error(`[Server] ⚠️⚠️ HIGH URGENCY ALERT ⚠️⚠️`);
              console.error(
                `[Server] ⚠️ Token expires in ${minutesUntilExpiry} minutes and refresh FAILED`
              );
              console.error(`[Server] ⚠️ Session: ${sessionMeta.targetDomain || sessionMeta.sessionId}`);
              console.error(`[Server] ⚠️ Error: ${errorMsg}`);
              console.error(`[Server] ⚠️ Will retry in 1 minute (urgent mode active)`);
              urgent = true;
            } else if (isUrgent) {
              console.warn(
                `[Server] ⚠️ ELEVATED ALERT: Token expires in ${minutesUntilExpiry} minutes and refresh failed`
              );
              console.warn(`[Server] ⚠️ Session: ${sessionMeta.targetDomain || sessionMeta.sessionId}`);
              urgent = true;
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${sessionMeta.sessionId}: ${msg}`);
          console.error(
            `[Server] ❌ Token refresh error for ${sessionMeta.targetDomain || sessionMeta.sessionId}:`,
            msg
          );
          if (err instanceof Error && err.stack) {
            console.error(`[Server] Stack:`, err.stack);
          }
          if (isExpired) {
            console.error(`[Server] 🚨 CRITICAL: Token is EXPIRED and refresh threw exception`);
            console.error(`[Server] 🚨 ACTION REQUIRED: Create new auth worker from fresh HAR file`);
          } else if (isUrgent) {
            console.error(
              `[Server] ⚠️ URGENT: Token expires in ${minutesUntilExpiry}min and refresh threw exception`
            );
            urgent = true;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`session ${sessionMeta.sessionId}: ${msg}`);
        console.error(`[Server] Error checking session ${sessionMeta.sessionId}:`, msg);
      }
    }

    return { urgent, checked, refreshed, errors };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    console.error('[Server] Error in token refresh check:', msg);
    if (err instanceof Error && err.stack) {
      console.error('[Server] Stack:', err.stack);
    }
    return { urgent: false, checked, refreshed, errors };
  }
}
