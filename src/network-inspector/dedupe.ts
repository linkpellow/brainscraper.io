/**
 * Request deduplication logic
 */

import type { NetworkEvent, DedupeGroup, EndpointSummary } from './types';
import { normalizedKey, queryShape, bodyFingerprint } from './normalize';
import { detectPollingLoop, calculatePhaseDistribution } from './phase';
import { assignAuthRole, type RetryChain } from './auth';
import { analyzeEventShape } from './jsonShape';
import { inferEndpointIntent } from './intent';

/**
 * Group events by normalized key and optional body fingerprint
 */
export function groupEvents(events: NetworkEvent[]): DedupeGroup[] {
  const groups = new Map<string, DedupeGroup>();

  for (const event of events) {
    const key = normalizedKey(event);
    const shape = queryShape(event.query);
    const fingerprint = bodyFingerprint(event);

    // Create composite key for grouping
    const groupKey = fingerprint ? `${key}::${fingerprint}` : `${key}::${shape}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key,
        events: [],
        queryShape: shape,
        bodyFingerprint: fingerprint,
      });
    }

    groups.get(groupKey)!.events.push(event);
  }

  return Array.from(groups.values());
}

/**
 * Create endpoint summary from a dedupe group
 */
export function createEndpointSummary(
  group: DedupeGroup,
  allEvents: NetworkEvent[],
  retryChains: RetryChain[],
  sessionStartTs: number
): EndpointSummary {
  const events = group.events;
  const firstEvent = events[0];

  // Calculate statistics
  const statuses: Record<string, number> = {};
  const mimeTypes: Record<string, number> = {};
  const sizes: number[] = [];

  for (const event of events) {
    if (event.status !== undefined) {
      const statusStr = String(event.status);
      statuses[statusStr] = (statuses[statusStr] || 0) + 1;
    }

    if (event.resMime) {
      mimeTypes[event.resMime] = (mimeTypes[event.resMime] || 0) + 1;
    }

    if (event.resSize !== undefined && event.resSize > 0) {
      sizes.push(event.resSize);
    }
  }

  // Find top status and MIME type
  const topStatus = Object.entries(statuses).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topMime = Object.entries(mimeTypes).sort((a, b) => b[1] - a[1])[0]?.[0];

  // Calculate average and median response size
  const avgSize = sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : undefined;
  const medianSize =
    sizes.length > 0
      ? [...sizes].sort((a, b) => a - b)[Math.floor(sizes.length / 2)]
      : undefined;

  // Collect sample URLs (max 3, unique)
  const sampleUrls = new Set<string>();
  for (const event of events) {
    if (sampleUrls.size >= 3) break;
    sampleUrls.add(event.url);
  }

  // Collect sample bodies (max 2, redacted)
  const sampleBodies: string[] = [];
  for (const event of events) {
    if (sampleBodies.length >= 2) break;
    if (event.reqBodyText && event.reqBodyMime?.includes('json')) {
      try {
        const parsed = JSON.parse(event.reqBodyText);
        const redacted = redactSensitiveFields(parsed);
        sampleBodies.push(JSON.stringify(redacted, null, 2).substring(0, 500));
      } catch {
        // Skip invalid JSON
      }
    }
  }

  // Extract query keys
  const queryKeys = Object.keys(firstEvent.query).sort();

  // Calculate phase distribution
  const phaseDistribution = calculatePhaseDistribution(events);

  // Detect polling loops
  const pollingLoop = detectPollingLoop(events);

  // Assign auth role
  const authRole = assignAuthRole(events, allEvents, retryChains, sessionStartTs);

  // Count retry chains this endpoint participates in
  const endpointKey = `${firstEvent.method} ${firstEvent.host}${firstEvent.path}`;
  const retryChainCount = retryChains.filter(
    (chain) =>
      chain.failedKey === endpointKey ||
      chain.recoveryEventKey === endpointKey
  ).length;

  // Analyze JSON shape and entity signals
  // Use the largest successful (2xx) response as representative
  const successfulEvents = events.filter(
    (e) => e.status && e.status >= 200 && e.status < 300 && e.resBodyText
  );
  const representativeEvent =
    successfulEvents.length > 0
      ? successfulEvents.reduce((a, b) => (b.resSize || 0) > (a.resSize || 0) ? b : a)
      : events[0]; // Fallback to first event if no successful ones

  const { jsonShape, entitySignals } = analyzeEventShape(representativeEvent);

  // Infer intent
  const intent = inferEndpointIntent(events);

  return {
    key: group.key,
    method: firstEvent.method,
    host: firstEvent.host,
    path: firstEvent.path,
    queryKeys,
    count: events.length,
    firstSeen: Math.min(...events.map((e) => e.ts)),
    lastSeen: Math.max(...events.map((e) => e.ts)),
    statuses,
    resMimeTop: topMime,
    resSizeAvg: avgSize,
    resSizeMedian: medianSize,
    score: 0, // Will be set by scoring function
    reasons: [],
    sampleUrls: Array.from(sampleUrls),
    sampleBodies: sampleBodies.length > 0 ? sampleBodies : undefined,
    phaseDistribution,
    pollingLoop,
    authRole,
    retryChains: retryChainCount > 0 ? retryChainCount : undefined,
    jsonShape: jsonShape.isJson ? jsonShape : undefined,
    entitySignals: entitySignals.hasIdLike || entitySignals.hasTimestamps || entitySignals.hasContactFields || entitySignals.hasLocationFields ? entitySignals : undefined,
    intent: intent !== 'unknown' ? intent : undefined,
  };
}

/**
 * Redact sensitive fields from JSON objects
 * 
 * CRITICAL: 'authorization' keys are whitelisted and preserved.
 * The core purpose of this system is to harvest auth tokens.
 */
function redactSensitiveFields(obj: any): any {
  // WHITELIST: Never redact 'authorization' - it's critical for token harvesting
  const AUTHORIZATION_WHITELIST = new Set(['authorization']);
  
  const SENSITIVE_KEYS = new Set([
    'password',
    'token',
    'secret',
    'api_key',
    'apikey',
    'auth',
    'cookie',
    'session',
    'csrf',
  ]);

  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveFields);
  }

  if (obj !== null && typeof obj === 'object') {
    const redacted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      
      // WHITELIST: Preserve authorization keys exactly as received
      if (AUTHORIZATION_WHITELIST.has(lowerKey)) {
        redacted[key] = value; // Preserve exactly as received
      } else if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('password') || lowerKey.includes('token')) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactSensitiveFields(value);
      }
    }
    return redacted;
  }

  return obj;
}
