/**
 * Authentication and session lifecycle detection
 */

import * as crypto from 'crypto';
import type { NetworkEvent } from './types';

export type AuthRole =
  | "auth_primary"
  | "auth_refresh"
  | "auth_guard"
  | "data_protected"
  | "unauthenticated";

export type AuthSignals = {
  hasAuthHeader: boolean;
  hasSessionCookie: boolean;
  hasCsrfHeader: boolean;
  authHeaderFingerprint?: string;
};

export type RetryChain = {
  failedKey: string; // endpoint key that failed
  failureTs: number;
  failureEvent: NetworkEvent;
  recoveryEventKey?: string;
  recoveryTs?: number;
  recoveryEvent?: NetworkEvent;
  retryTs?: number;
  retryEvent?: NetworkEvent;
};

/**
 * Extract auth signals from a network event
 */
export function extractAuthSignals(event: NetworkEvent): AuthSignals {
  const signals: AuthSignals = {
    hasAuthHeader: false,
    hasSessionCookie: false,
    hasCsrfHeader: false,
  };

  // Check for auth headers
  const authHeaderNames = ['authorization', 'x-auth-token', 'x-api-key', 'x-access-token'];
  for (const headerName of authHeaderNames) {
    if (event.reqHeaders[headerName]) {
      signals.hasAuthHeader = true;
      
      // Generate fingerprint (header name + scheme + token length, not value)
      const headerValue = event.reqHeaders[headerName];
      const scheme = headerValue.split(' ')[0] || 'unknown';
      const tokenLength = headerValue.length;
      const fingerprint = crypto
        .createHash('sha256')
        .update(`${headerName}:${scheme}:${tokenLength}`)
        .digest('hex')
        .substring(0, 16);
      signals.authHeaderFingerprint = fingerprint;
      break;
    }
  }

  // Check for session cookies (cookies that appear frequently and may change)
  if (Object.keys(event.reqCookies).length > 0) {
    signals.hasSessionCookie = true;
  }

  // Check for CSRF headers
  const csrfHeaderNames = [
    'x-csrf-token',
    'x-xsrf-token',
    'csrf-token',
    'x-csrf',
    'x-requested-with',
  ];
  for (const headerName of csrfHeaderNames) {
    if (event.reqHeaders[headerName]) {
      signals.hasCsrfHeader = true;
      break;
    }
  }

  return signals;
}

/**
 * Detect session cookie rotation (cookies that change value over time)
 */
export function detectSessionCookieRotation(events: NetworkEvent[]): Set<string> {
  const cookieValues = new Map<string, Set<string>>(); // cookie name -> set of values

  // Collect all cookie values
  for (const event of events) {
    for (const [name, value] of Object.entries(event.reqCookies)) {
      if (!cookieValues.has(name)) {
        cookieValues.set(name, new Set());
      }
      cookieValues.get(name)!.add(value);
    }
  }

  // Find cookies that appear in multiple events with different values
  const rotatingCookies = new Set<string>();
  for (const [name, values] of cookieValues.entries()) {
    // If cookie appears in 3+ events and has multiple values, it's rotating
    const eventCount = events.filter((e) => e.reqCookies[name]).length;
    if (eventCount >= 3 && values.size > 1) {
      rotatingCookies.add(name);
    }
  }

  return rotatingCookies;
}

/**
 * Detect retry chains: 401/403 → auth refresh → successful retry
 */
export function detectRetryChains(events: NetworkEvent[]): RetryChain[] {
  const retryChains: RetryChain[] = [];
  const processedEvents = new Set<number>();

  // Sort events by timestamp
  const sortedEvents = [...events].sort((a, b) => a.ts - b.ts);

  for (let i = 0; i < sortedEvents.length; i++) {
    const failedEvent = sortedEvents[i];

    // Skip if already processed
    if (processedEvents.has(i)) continue;

    // Look for 401 or 403 failures
    if (failedEvent.status !== 401 && failedEvent.status !== 403) {
      continue;
    }

    // Generate normalized key for the failed endpoint
    const failedKey = `${failedEvent.method} ${failedEvent.host}${failedEvent.path}`;

    // Look for recovery event within 5 seconds
    const recoveryWindow = failedEvent.ts + 5000;
    let recoveryEvent: NetworkEvent | undefined;
    let recoveryIndex: number | undefined;

    for (let j = i + 1; j < sortedEvents.length; j++) {
      const candidate = sortedEvents[j];
      if (candidate.ts > recoveryWindow) break;

      // Recovery event must be on same host
      if (candidate.host !== failedEvent.host) continue;

      // Recovery event should have auth material
      const candidateSignals = extractAuthSignals(candidate);
      if (!candidateSignals.hasAuthHeader && !candidateSignals.hasSessionCookie) {
        continue;
      }

      // Check if auth material changed (different fingerprint or cookie value)
      const failedSignals = failedEvent.authSignals || extractAuthSignals(failedEvent);
      if (
        candidateSignals.authHeaderFingerprint &&
        failedSignals.authHeaderFingerprint &&
        candidateSignals.authHeaderFingerprint !== failedSignals.authHeaderFingerprint
      ) {
        recoveryEvent = candidate;
        recoveryIndex = j;
        break;
      }

      // Or check for cookie changes
      const failedCookies = Object.keys(failedEvent.reqCookies);
      const candidateCookies = Object.keys(candidate.reqCookies);
      const cookieChanged = failedCookies.some(
        (name) =>
          candidateCookies.includes(name) &&
          candidate.reqCookies[name] !== failedEvent.reqCookies[name]
      );

      if (cookieChanged) {
        recoveryEvent = candidate;
        recoveryIndex = j;
        break;
      }
      
      // Also accept if candidate has auth but failed event doesn't
      if (candidateSignals.hasAuthHeader && !failedSignals.hasAuthHeader) {
        recoveryEvent = candidate;
        recoveryIndex = j;
        break;
      }
      
      // Or if candidate has auth header with different length (token refresh)
      if (
        candidateSignals.hasAuthHeader &&
        failedSignals.hasAuthHeader &&
        candidate.reqHeaders['authorization'] &&
        failedEvent.reqHeaders['authorization'] &&
        candidate.reqHeaders['authorization'].length !== failedEvent.reqHeaders['authorization'].length
      ) {
        recoveryEvent = candidate;
        recoveryIndex = j;
        break;
      }
    }

    if (!recoveryEvent) continue;

    // Look for successful retry within 10 seconds of recovery
    const retryWindow = recoveryEvent.ts + 10000;
    let retryEvent: NetworkEvent | undefined;

    for (let k = (recoveryIndex || i) + 1; k < sortedEvents.length; k++) {
      const candidate = sortedEvents[k];
      if (candidate.ts > retryWindow) break;

      // Must be same endpoint as failed event
      const candidateKey = `${candidate.method} ${candidate.host}${candidate.path}`;
      if (candidateKey !== failedKey) continue;

      // Must be successful (200-299)
      if (candidate.status && candidate.status >= 200 && candidate.status < 300) {
        retryEvent = candidate;
        processedEvents.add(i);
        processedEvents.add(recoveryIndex!);
        processedEvents.add(k);
        break;
      }
    }

    if (retryEvent) {
      retryChains.push({
        failedKey,
        failureTs: failedEvent.ts,
        failureEvent: failedEvent,
        recoveryEventKey: `${recoveryEvent.method} ${recoveryEvent.host}${recoveryEvent.path}`,
        recoveryTs: recoveryEvent.ts,
        recoveryEvent: recoveryEvent,
        retryTs: retryEvent.ts,
        retryEvent: retryEvent,
      });
    }
  }

  return retryChains;
}

/**
 * Assign auth role to an endpoint group
 */
export function assignAuthRole(
  events: NetworkEvent[],
  allEvents: NetworkEvent[],
  retryChains: RetryChain[],
  sessionStartTs: number
): AuthRole {
  const firstEvent = events[0];
  const signals = extractAuthSignals(firstEvent);

  // Check if this endpoint participates in recovery (auth_refresh)
  const endpointKey = `${firstEvent.method} ${firstEvent.host}${firstEvent.path}`;
  const isRecoveryEndpoint = retryChains.some(
    (chain) => chain.recoveryEventKey === endpointKey
  );
  if (isRecoveryEndpoint) {
    return "auth_refresh";
  }

  // Check if this endpoint fails with 401/403 and retries successfully (data_protected)
  // Check if the endpoint key matches a failed key in a retry chain AND has a retry
  const hasRetryChain = retryChains.some((chain) => {
    const eventKey = `${firstEvent.method} ${firstEvent.host}${firstEvent.path}`;
    return chain.failedKey === eventKey && chain.retryEvent !== undefined;
  });
  if (hasRetryChain) {
    return "data_protected";
  }

  // Check if it runs early in page_load and has auth material (auth_guard)
  const pageLoadWindow = sessionStartTs + 4000;
  const isEarlyPageLoad = firstEvent.ts <= pageLoadWindow;
  if (isEarlyPageLoad && (signals.hasAuthHeader || signals.hasSessionCookie)) {
    // Check if it's a validation-like pattern (GET request, small response, auth present)
    if (
      firstEvent.method === 'GET' &&
      firstEvent.resSize &&
      firstEvent.resSize < 5000 &&
      events.length <= 3
    ) {
      return "auth_guard";
    }
  }

  // Check if it introduces auth material (auth_primary)
  // Find when auth material first appears in the session
  const sortedAllEvents = [...allEvents].sort((a, b) => a.ts - b.ts);
  let firstAuthEvent: NetworkEvent | undefined;
  
  for (const event of sortedAllEvents) {
    const eventSignals = extractAuthSignals(event);
    if (eventSignals.hasAuthHeader || eventSignals.hasSessionCookie) {
      firstAuthEvent = event;
      break;
    }
  }

  // If this is the first event with auth material, it's likely auth_primary
  if (
    firstAuthEvent &&
    firstEvent.method === firstAuthEvent.method &&
    firstEvent.host === firstAuthEvent.host &&
    firstEvent.path === firstAuthEvent.path &&
    firstEvent.ts === firstAuthEvent.ts
  ) {
    // Additional check: POST/PUT with auth material early in session
    if (
      ['POST', 'PUT'].includes(firstEvent.method) &&
      firstEvent.ts <= sessionStartTs + 10000
    ) {
      return "auth_primary";
    }
  }

  // Default: unauthenticated
  return "unauthenticated";
}

/**
 * Get all events that participate in retry chains
 */
export function getRetryChainEvents(retryChains: RetryChain[]): Set<string> {
  const eventKeys = new Set<string>();
  
  for (const chain of retryChains) {
    eventKeys.add(chain.failedKey);
    if (chain.recoveryEventKey) {
      eventKeys.add(chain.recoveryEventKey);
    }
  }
  
  return eventKeys;
}
