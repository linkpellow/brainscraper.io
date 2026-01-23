/**
 * Token Injection Verification Utilities
 * 
 * Verifies that token injection was successful by checking for Authorization headers
 * in subsequent network requests after step-2 (extract-tokens) locks.
 */

import type { RawNetworkEvent } from '@/src/tools/api-signal-explorer/neuromap';
import type { LockedStep } from '../types';

/**
 * Check if Authorization headers are present in network events after step-2 locks
 */
export function verifyTokenInjection(
  step2: LockedStep | undefined,
  events: RawNetworkEvent[],
  step2LockedAt: number
): {
  tokenCaptured: boolean;
  tokenInjected: boolean; // Whether injection was attempted (we can't verify server-side success from frontend)
  authenticatedRequestsDetected: boolean;
  authenticatedRequestCount: number;
  authenticatedEndpoints: string[];
  issues: string[];
} {
  const result = {
    tokenCaptured: false,
    tokenInjected: false, // Will be set by caller based on injection API call
    authenticatedRequestsDetected: false,
    authenticatedRequestCount: 0,
    authenticatedEndpoints: [] as string[],
    issues: [] as string[],
  };

  // Check 1: Token was captured
  if (step2?.extractedVars?.access_token) {
    result.tokenCaptured = true;
  } else {
    result.issues.push('Step-2 does not have access_token in extractedVars');
    return result;
  }

  // Check 2: Find events that occurred AFTER step-2 locked
  const postStep2Events = events.filter(e => e.ts >= step2LockedAt);
  
  if (postStep2Events.length === 0) {
    result.issues.push('No network events captured after step-2 locked');
    return result;
  }

  // Check 3: Look for Authorization headers in subsequent requests
  // Exclude the token exchange endpoint itself
  const tokenEndpoint = step2?.endpoint || '';
  const authenticatedEvents = postStep2Events.filter(e => {
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

  result.authenticatedRequestCount = authenticatedEvents.length;
  result.authenticatedEndpoints = authenticatedEvents.map(e => 
    `${e.method} ${e.host || ''}${e.path || e.url || ''}`
  ).filter(Boolean);

  if (authenticatedEvents.length > 0) {
    result.authenticatedRequestsDetected = true;
  } else {
    result.issues.push(`No Authorization headers found in ${postStep2Events.length} requests after step-2`);
    result.issues.push('Token injection may have failed or requests were made before injection');
  }

  return result;
}

/**
 * Determine if step-2 should be marked as "success" based on verification
 */
export function shouldMarkStep2AsSuccess(
  step2: LockedStep | undefined,
  events: RawNetworkEvent[],
  tokenInjectionAttempted: boolean,
  tokenInjectionSucceeded: boolean
): {
  shouldMarkSuccess: boolean;
  reason: string;
  verification: ReturnType<typeof verifyTokenInjection>;
} {
  if (!step2 || step2.stepNumber !== 2) {
    return {
      shouldMarkSuccess: false,
      reason: 'Not step-2',
      verification: verifyTokenInjection(undefined, events, 0),
    };
  }

  const verification = verifyTokenInjection(step2, events, step2.lockedAt);

  // CRITICAL: Step-2 should only be marked "success" if:
  // 1. Token was captured ✅
  // 2. Token injection was attempted ✅
  // 3. Token injection succeeded (API call returned ok) ✅
  // 4. Authenticated requests were detected ✅

  if (!verification.tokenCaptured) {
    return {
      shouldMarkSuccess: false,
      reason: 'Token not captured in step-2',
      verification,
    };
  }

  if (!tokenInjectionAttempted) {
    return {
      shouldMarkSuccess: false,
      reason: 'Token injection was not attempted (browserSession.id may be missing)',
      verification,
    };
  }

  if (!tokenInjectionSucceeded) {
    return {
      shouldMarkSuccess: false,
      reason: 'Token injection API call failed',
      verification,
    };
  }

  if (!verification.authenticatedRequestsDetected) {
    return {
      shouldMarkSuccess: false,
      reason: `No authenticated requests detected after token injection (checked ${verification.authenticatedRequestCount} requests)`,
      verification,
    };
  }

  return {
    shouldMarkSuccess: true,
    reason: `Token captured, injected, and ${verification.authenticatedRequestCount} authenticated requests detected`,
    verification,
  };
}
