/**
 * Auth Worker Health Monitor
 * 
 * DEPRECATED: This file has been moved to app/auth-workers/utils/authWorkerHealthMonitor.ts
 * Re-exporting from new location for backward compatibility
 */

export * from '../../../../auth-workers/utils/authWorkerHealthMonitor';

export type HealthStatus = 'healthy' | 'unhealthy' | 'unverified' | 'unknown';

export type HealthCheckResult = {
  status: HealthStatus;
  lastChecked: number;
  reason?: string;
  details: {
    hasValidSession: boolean;
    hasValidToken: boolean;
    hasRecentRequests: boolean;
    tokenExpired?: boolean;
    noRequestsInWindow?: boolean;
    injectionErrors?: boolean;
  };
};

const HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds
const REQUEST_WINDOW_MS = 60000; // 60 seconds - window for checking recent requests
const TOKEN_EXPIRY_BUFFER_MS = 300000; // 5 minutes - buffer before considering token expired

/**
 * Check if token is expired based on verification timestamp and typical expiry
 * Also checks if we have expires_in from the token response
 */
function isTokenExpired(
  verificationStatus: LockedStep['verificationStatus'],
  step2?: LockedStep
): boolean {
  if (!verificationStatus?.verifiedAt) return false;
  
  // Try to get expires_in from step2 response
  let expiresInSeconds: number | undefined;
  if (step2?.response) {
    try {
      const response = typeof step2.response === 'string' 
        ? JSON.parse(step2.response) 
        : step2.response;
      expiresInSeconds = response?.expires_in || response?.expiresIn;
    } catch {
      // Response parsing failed
    }
  }
  
  // Use actual expiry if available, otherwise default to 1 hour
  const expiryMs = expiresInSeconds 
    ? expiresInSeconds * 1000 
    : 3600 * 1000; // Default 1 hour
  
  const tokenAge = Date.now() - verificationStatus.verifiedAt;
  
  // Consider expired if past expiry time minus buffer
  return tokenAge > (expiryMs - TOKEN_EXPIRY_BUFFER_MS);
}

/**
 * Check if there are recent authenticated requests
 */
function hasRecentAuthenticatedRequests(
  events: RawNetworkEvent[],
  step2LockedAt: number
): { hasRequests: boolean; count: number; lastRequestAge?: number } {
  const now = Date.now();
  const windowStart = now - REQUEST_WINDOW_MS;
  
  // Get events after step-2 locked and within the window
  const recentEvents = events.filter(e => 
    e.ts >= step2LockedAt && 
    e.ts >= windowStart &&
    e.ts <= now
  );
  
  // Check for Authorization headers
  const authenticatedEvents = recentEvents.filter(e => {
    // Skip token exchange endpoint
    if (e.url?.includes('/token') || e.url?.includes('/oauth')) {
      return false;
    }
    
    // Skip static assets
    const urlLower = (e.url || '').toLowerCase();
    const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ico'];
    if (staticExtensions.some(ext => urlLower.includes(ext))) {
      return false;
    }
    
    // Check for Authorization header
    const headers = e.reqHeaders || {};
    const authHeader = headers['authorization'] || headers['Authorization'];
    return !!authHeader && authHeader.toLowerCase().startsWith('bearer ');
  });
  
  const lastRequestAge = authenticatedEvents.length > 0
    ? now - Math.max(...authenticatedEvents.map(e => e.ts))
    : undefined;
  
  return {
    hasRequests: authenticatedEvents.length > 0,
    count: authenticatedEvents.length,
    lastRequestAge,
  };
}

/**
 * Perform health check for a specific session
 */
export function checkAuthWorkerHealth(
  sessionId: string,
  events: RawNetworkEvent[],
  lockedSteps: LockedStep[]
): HealthCheckResult {
  const session = getSessionById(sessionId);
  
  if (!session) {
    return {
      status: 'unknown',
      lastChecked: Date.now(),
      reason: 'Session not found',
      details: {
        hasValidSession: false,
        hasValidToken: false,
        hasRecentRequests: false,
      },
    };
  }
  
  // Try to find step2 from lockedSteps, or reconstruct from session data
  let step2 = lockedSteps.find(s => s.stepNumber === 2);
  if (!step2 && session.step2) {
    // Reconstruct step2 from session data if not in lockedSteps
    step2 = {
      id: session.step2.id,
      stepNumber: 2,
      endpoint: session.step2.endpoint,
      method: session.step2.method,
      code: '',
      response: {},
      extractedVars: session.step2.extractedVars,
      dependencies: [],
      lockedAt: session.stabilizedAt,
      status: 'success',
      verificationStatus: session.step2.verificationStatus,
    };
  }
  
  const verificationStatus = session.step2.verificationStatus;
  
  // Check 1: Valid session
  if (!session.stabilized || !verificationStatus) {
    return {
      status: 'unverified',
      lastChecked: Date.now(),
      reason: 'Session not stabilized or missing verification',
      details: {
        hasValidSession: false,
        hasValidToken: false,
        hasRecentRequests: false,
      },
    };
  }
  
  // Check 2: Token expired
  const tokenExpired = isTokenExpired(verificationStatus, step2);
  
  // Check if refresh token exists (can refresh if expired)
  const hasRefreshToken = !!step2?.extractedVars?.refresh_token;
  
  // Check 3: Recent authenticated requests (only if we have events)
  const recentRequests = events.length > 0 && step2
    ? hasRecentAuthenticatedRequests(events, step2.lockedAt)
    : { hasRequests: false, count: 0, lastRequestAge: undefined };
  
  // Determine overall health status
  let status: HealthStatus = 'healthy';
  let reason: string | undefined;
  
  // Token expiration check: Only mark unhealthy if expired AND no refresh token
  // If refresh token exists, token can be refreshed, so consider it healthy
  if (tokenExpired && !hasRefreshToken) {
    status = 'unhealthy';
    reason = 'Token expired and no refresh token available';
  } else if (tokenExpired && hasRefreshToken) {
    // Token expired but refresh token exists - can be refreshed
    // When checking from /auth-workers page (no live events), still consider healthy
    // because token can be refreshed using the refresh token
    if (events.length === 0) {
      // No live events - check based on session data
      if (verificationStatus.authenticatedRequestsDetected && verificationStatus.authenticatedRequestCount > 0) {
        status = 'healthy';
        reason = `Token expired but refresh token available - can be refreshed. Verified with ${verificationStatus.authenticatedRequestCount} authenticated endpoints`;
      } else {
        status = 'unverified';
        reason = 'Token expired but refresh token available - can be refreshed';
      }
    } else {
      // Live events available - check recent requests
      if (recentRequests.hasRequests) {
        status = 'healthy';
        reason = `Token expired but refresh token available - ${recentRequests.count} authenticated requests in last ${REQUEST_WINDOW_MS / 1000}s`;
      } else {
        status = 'unverified';
        reason = 'Token expired but refresh token available - can be refreshed';
      }
    }
  } else if (!verificationStatus.verified) {
    status = 'unverified';
    reason = 'Verification not complete';
  } else if (events.length > 0) {
    // We have live events - check for recent requests
    if (!recentRequests.hasRequests) {
      const timeSinceVerification = Date.now() - (verificationStatus.verifiedAt || 0);
      if (timeSinceVerification > REQUEST_WINDOW_MS) {
        status = 'unhealthy';
        reason = `No authenticated requests in last ${REQUEST_WINDOW_MS / 1000}s`;
      } else {
        status = 'unverified';
        reason = 'Waiting for authenticated requests';
      }
    } else {
      status = 'healthy';
      reason = `${recentRequests.count} authenticated requests in last ${REQUEST_WINDOW_MS / 1000}s`;
    }
  } else {
    // No live events available - check based on session data only
    // If verified and has authenticated endpoints, consider healthy
    if (verificationStatus.authenticatedRequestsDetected && verificationStatus.authenticatedRequestCount > 0) {
      status = 'healthy';
      reason = `Verified with ${verificationStatus.authenticatedRequestCount} authenticated endpoints`;
    } else {
      status = 'unverified';
      reason = 'No authenticated endpoints detected';
    }
  }
  
  return {
    status,
    lastChecked: Date.now(),
    reason,
    details: {
      hasValidSession: true,
      hasValidToken: !tokenExpired && !!verificationStatus.tokenCaptured,
      hasRecentRequests: recentRequests.hasRequests,
      tokenExpired,
      noRequestsInWindow: !recentRequests.hasRequests && verificationStatus.verified,
      injectionErrors: verificationStatus.tokenInjectionAttempted && !verificationStatus.tokenInjectionSucceeded,
    },
  };
}

/**
 * Check health for all active sessions
 */
export function checkAllSessionsHealth(
  events: RawNetworkEvent[],
  lockedSteps: LockedStep[]
): Map<string, HealthCheckResult> {
  const sessions = listAllSessions();
  const healthMap = new Map<string, HealthCheckResult>();
  
  for (const session of sessions) {
    const health = checkAuthWorkerHealth(session.sessionId, events, lockedSteps);
    healthMap.set(session.sessionId, health);
  }
  
  return healthMap;
}

/**
 * Format time ago for display
 */
export function formatHealthTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  
  return new Date(timestamp).toLocaleDateString();
}
