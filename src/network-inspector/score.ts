/**
 * Importance scoring for network endpoints
 */

import type { NetworkEvent, EndpointSummary, DedupeGroup } from './types';

/**
 * Score an endpoint based on various heuristics
 */
export function scoreEndpoint(group: DedupeGroup, summary: EndpointSummary, allEvents: NetworkEvent[]): number {
  let score = 0;
  const reasons: string[] = [];

  const events = group.events;
  const firstEvent = events[0];

  // +25 if response is JSON
  if (summary.resMimeTop?.includes('json') || firstEvent.resMime?.includes('json')) {
    score += 25;
    reasons.push('JSON response');
  }

  // +20 if request has auth (Authorization header, cookies, or CSRF token)
  const hasAuthHeader = !!firstEvent.reqHeaders['authorization'];
  const hasCookies = Object.keys(firstEvent.reqCookies).length > 0;
  const hasCSRF =
    !!firstEvent.reqHeaders['x-csrf-token'] ||
    !!firstEvent.reqHeaders['x-xsrf-token'] ||
    !!firstEvent.reqHeaders['csrf-token'];

  if (hasAuthHeader || hasCookies || hasCSRF) {
    score += 20;
    reasons.push('Authentication present');
  }

  // +15 if method is POST/PUT/PATCH/DELETE
  const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (writeMethods.includes(firstEvent.method)) {
    score += 15;
    reasons.push('Write method');
  }

  // +10 if status is 2xx and response size >= 2KB
  const isSuccess = summary.statuses['200'] || summary.statuses['201'] || summary.statuses['204'];
  if (isSuccess && summary.resSizeAvg && summary.resSizeAvg >= 2048) {
    score += 10;
    reasons.push('Large successful response');
  }

  // +10 if response is "rich" JSON (infer by size and JSON mime, or if we have body)
  if (
    summary.resMimeTop?.includes('json') &&
    summary.resSizeAvg &&
    summary.resSizeAvg >= 500 &&
    summary.resSizeAvg < 100000
  ) {
    score += 10;
    reasons.push('Rich JSON response');
  }

  // +15 if event occurs in interaction phase
  const hasInteraction = events.some((e) => e.phase === 'interaction');
  if (hasInteraction) {
    score += 15;
    reasons.push('+15 interaction-phase request');
  }

  // +5 if actionTag is present
  const hasActionTag = events.some((e) => e.actionTag);
  if (hasActionTag) {
    score += 5;
    reasons.push('+5 user-action tagged');
  }

  // Auth role-based scoring
  if (summary.authRole === 'auth_primary') {
    score += 25;
    reasons.push('+25 primary authentication endpoint');
  } else if (summary.authRole === 'auth_refresh') {
    score += 20;
    reasons.push('+20 auth refresh endpoint');
  } else if (summary.authRole === 'auth_guard') {
    score += 15;
    reasons.push('+15 auth guard (session validation)');
  } else if (summary.authRole === 'data_protected') {
    score += 10;
    reasons.push('+10 protected data endpoint (401 → retry)');
  }

  // +20 if endpoint participates in retry chains
  if (summary.retryChains && summary.retryChains > 0) {
    score += 20;
    reasons.push(`+20 participates in ${summary.retryChains} retry chain(s)`);
  }

  // Legacy retry chain detection (for backward compatibility)
  const participatesInRetry = detectRetryChain(events, allEvents);
  if (participatesInRetry && !summary.retryChains) {
    score += 10;
    reasons.push('Auth retry chain (legacy detection)');
  }

  // -20 if background phase AND endpoint repeats ≥ 5 times
  const isBackground = summary.phaseDistribution?.background || 0;
  if (isBackground >= 5 && summary.count >= 5) {
    score -= 20;
    reasons.push('-20 background polling pattern');
  }

  // -15 if tiny response (<300 bytes) and repeats frequently (polling-like)
  if (
    summary.resSizeAvg &&
    summary.resSizeAvg < 300 &&
    summary.count > 10 &&
    firstEvent.method === 'GET'
  ) {
    score -= 15;
    reasons.push('Polling-like pattern');
  }

  // Additional penalty if polling loop detected
  if (summary.pollingLoop) {
    score -= 10;
    reasons.push('-10 detected polling loop');
  }

  // -20 if OPTIONS or status 204 repeated
  if (
    (firstEvent.method === 'OPTIONS' || summary.statuses['204']) &&
    summary.count > 5
  ) {
    score -= 20;
    reasons.push('Noise endpoint (OPTIONS/204)');
  }

  // -10 if unauthenticated AND background-only
  if (
    summary.authRole === 'unauthenticated' &&
    summary.phaseDistribution &&
    summary.phaseDistribution.background === summary.count &&
    summary.phaseDistribution.interaction === 0 &&
    summary.phaseDistribution.page_load === 0
  ) {
    score -= 10;
    reasons.push('-10 unauthenticated background-only');
  }

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  return score;
}

/**
 * Detect if events participate in an auth retry chain
 * Pattern: 401 → refresh-like call → same endpoint 200
 */
function detectRetryChain(events: NetworkEvent[], allEvents: NetworkEvent[]): boolean {
  // Look for 401 responses followed by token refresh and then success
  for (const event of events) {
    if (event.status === 401) {
      // Find refresh-like calls within 5 seconds
      const refreshWindow = event.ts + 5000;
      const refreshCalls = allEvents.filter(
        (e) =>
          e.ts > event.ts &&
          e.ts < refreshWindow &&
          e.host === event.host &&
          (e.path.includes('refresh') ||
            e.path.includes('token') ||
            e.path.includes('auth') ||
            e.reqHeaders['authorization'])
      );

      if (refreshCalls.length > 0) {
        // Check if same endpoint succeeds after refresh
        const successWindow = refreshCalls[refreshCalls.length - 1].ts + 10000;
        const successCall = allEvents.find(
          (e) =>
            e.ts > refreshCalls[refreshCalls.length - 1].ts &&
            e.ts < successWindow &&
            e.host === event.host &&
            e.path === event.path &&
            e.method === event.method &&
            (e.status === 200 || e.status === 201)
        );

        if (successCall) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Apply scoring to all endpoint summaries
 */
export function scoreEndpoints(
  groups: DedupeGroup[],
  summaries: EndpointSummary[],
  allEvents: NetworkEvent[]
): EndpointSummary[] {
  return summaries.map((summary, index) => {
    const group = groups[index];
    const score = scoreEndpoint(group, summary, allEvents);
    return {
      ...summary,
      score,
    };
  });
}
