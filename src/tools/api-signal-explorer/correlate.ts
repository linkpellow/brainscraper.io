/**
 * Action → Network Correlation Engine
 * 
 * Links user actions to network events based on timing and structural signals.
 */

import type { ActionEvent } from './actions';
import type { RawNetworkEvent } from './neuromap';

export type CorrelationResult = {
  eventId: string;
  confidence: number;
};

export type CorrelationOptions = {
  windowMs?: number;       // default 2000 (Δt ≤ 2000ms for target-action ↔ network)
  maxLinks?: number;      // default 12
  baselineEvents?: Set<string>; // Event IDs to exclude (captured before interaction)
  excludeBaseline?: boolean;    // Filter out baseline events (default: true)
};

/**
 * Correlate an action to network events
 */
export function correlateActionToNetwork(
  action: ActionEvent,
  events: RawNetworkEvent[],
  options: CorrelationOptions = {}
): CorrelationResult[] {
  const windowMs = options.windowMs ?? 2000;
  const maxLinks = options.maxLinks || 12;

  // Find candidate events within time window. Network-to-Action delay: requests typically
  // fire after the click; allow 150ms before (anticipation/clock skew) and windowMs after.
  const windowStart = action.ts - 150;
  const windowEnd = action.ts + windowMs;

  // Generate body hash for deduplication
  const getBodyHash = (event: RawNetworkEvent): string => {
    const body = event.reqBodyText || '';
    if (body.length === 0) return '';
    // Simple hash (can be improved with crypto)
    let hash = 0;
    for (let i = 0; i < body.length; i++) {
      const char = body.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  };

  // Track redirect chains
  const redirectChains = new Map<string, RawNetworkEvent[]>();
  for (const event of events) {
    if (event.status && event.status >= 300 && event.status < 400) {
      const location = event.resHeaders?.['location'] || event.resHeaders?.['Location'];
      if (location) {
        // Find the event that follows this redirect
        const nextEvent = events.find(e => 
          e.ts > event.ts && 
          e.ts < event.ts + 1000 && // Within 1 second
          e.url.includes(new URL(location, event.url).pathname)
        );
        if (nextEvent) {
          const chain = redirectChains.get(event.url) || [event];
          chain.push(nextEvent);
          redirectChains.set(event.url, chain);
        }
      }
    }
  }

  const candidates = events.filter(event => {
    // Must be within time window
    if (event.ts < windowStart || event.ts > windowEnd) return false;
    
    // Skip OPTIONS requests (preflight)
    if (event.method === 'OPTIONS') return false;
    
    // Exclude baseline events if baseline is provided
    if (options.excludeBaseline !== false && options.baselineEvents) {
      const eventKey = `${event.ts}_${event.method}_${event.host}_${event.path}`;
      const bodyHash = getBodyHash(event);
      const hashKey = bodyHash ? `${eventKey}_${bodyHash}` : eventKey;
      
      if (options.baselineEvents.has(eventKey) || options.baselineEvents.has(hashKey)) {
        return false; // This is a baseline event, exclude it
      }
    }
    
    return true;
  });

  if (candidates.length === 0) return [];

  // Calculate confidence for each candidate
  const scored: Array<{ event: RawNetworkEvent; confidence: number }> = [];

  // Determine dominant API host (for host matching boost)
  const hostCounts = new Map<string, number>();
  for (const event of events) {
    hostCounts.set(event.host, (hostCounts.get(event.host) || 0) + 1);
  }
  const dominantHost = Array.from(hostCounts.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  // Detect polling loops (endpoints that repeat frequently)
  const endpointCounts = new Map<string, number>();
  const endpointTimestamps = new Map<string, number[]>();
  for (const event of events) {
    const key = `${event.method} ${event.host}${event.path}`;
    endpointCounts.set(key, (endpointCounts.get(key) || 0) + 1);
    if (!endpointTimestamps.has(key)) {
      endpointTimestamps.set(key, []);
    }
    endpointTimestamps.get(key)!.push(event.ts);
  }

  const pollingEndpoints = new Set<string>();
  for (const [key, timestamps] of endpointTimestamps.entries()) {
    if (timestamps.length < 5) continue;
    
    // Check if timestamps are roughly evenly spaced (polling pattern)
    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }
    
    if (intervals.length >= 4) {
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((sum, interval) => {
        return sum + Math.pow(interval - avgInterval, 2);
      }, 0) / intervals.length;
      const stdDev = Math.sqrt(variance);
      
      // If standard deviation is low relative to average, it's likely polling
      if (stdDev < avgInterval * 0.3 && avgInterval < 10000) {
        pollingEndpoints.add(key);
      }
    }
  }

  // Count events per minute for frequency penalty
  const eventsPerMinute = new Map<string, number>();
  const oneMinute = 60000;
  for (const event of events) {
    const key = `${event.method} ${event.host}${event.path}`;
    const recentCount = events.filter(e => {
      const eKey = `${e.method} ${e.host}${e.path}`;
      return eKey === key && Math.abs(e.ts - event.ts) < oneMinute;
    }).length;
    eventsPerMinute.set(key, recentCount);
  }

  for (const event of candidates) {
    let confidence = 0.5; // Base confidence

    const endpointKey = `${event.method} ${event.host}${event.path}`;

    // Boosts
    // +0.25 if authenticated
    const hasAuth = !!(
      event.reqHeaders?.['authorization'] ||
      event.reqHeaders?.['x-auth-token'] ||
      event.reqHeaders?.['cookie']
    );
    if (hasAuth) confidence += 0.25;

    // +0.20 if mutation
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.method)) {
      confidence += 0.20;
    }

    // +0.20 if JSON response > 2KB
    if (event.resMime?.includes('json') && event.resBodySize && event.resBodySize > 2048) {
      confidence += 0.20;
    }

    // +0.15 if 2xx status
    if (event.status && event.status >= 200 && event.status < 300) {
      confidence += 0.15;
    }

    // +0.10 if host matches dominant API host
    if (dominantHost && event.host === dominantHost) {
      confidence += 0.10;
    }

    // +0.15 if part of redirect chain (indicates important navigation)
    for (const chain of redirectChains.values()) {
      if (chain.some(e => e === event)) {
        confidence += 0.15;
        break;
      }
    }

    // +0.10 if request body matches action context (e.g., form submission)
    if (event.reqBodyText && action.type === 'submit') {
      // Could enhance this to check if body contains form field names
      confidence += 0.10;
    }

    // +0.05 if URL path matches action meta (e.g., selector contains path keyword)
    if (action.meta?.url && event.url.includes(new URL(action.meta.url).pathname)) {
      confidence += 0.05;
    }

    // Penalties
    // -0.30 if polling loop
    if (pollingEndpoints.has(endpointKey)) {
      confidence -= 0.30;
    }

    // -0.20 if tiny response
    if (event.resBodySize && event.resBodySize < 300) {
      confidence -= 0.20;
    }

    // -0.20 if frequent (more than 10 per minute)
    const freq = eventsPerMinute.get(endpointKey) || 0;
    if (freq > 10) {
      confidence -= 0.20;
    }

    // Normalize to 0-1
    confidence = Math.max(0, Math.min(1, confidence));

    scored.push({ event, confidence });
  }

  // Sort by confidence and take top N
  scored.sort((a, b) => b.confidence - a.confidence);
  const topN = scored.slice(0, maxLinks);

  // Return results with event identifiers
  return topN.map(({ event, confidence }) => ({
    eventId: `${event.ts}_${event.method}_${event.host}_${event.path}`,
    confidence,
  }));
}

/**
 * Link action to network events in a Neuromap
 */
export function linkActionToEvents(
  action: ActionEvent,
  events: RawNetworkEvent[],
  options: CorrelationOptions = {}
): void {
  const correlations = correlateActionToNetwork(action, events, options);

  // Create a map for quick lookup by multiple keys (handle timestamp variations)
  const eventMap = new Map<string, RawNetworkEvent[]>();
  for (const event of events) {
    const baseKey = `${event.method}_${event.host}_${event.path}`;
    if (!eventMap.has(baseKey)) {
      eventMap.set(baseKey, []);
    }
    eventMap.get(baseKey)!.push(event);
  }

  // Apply correlations
  for (const { eventId, confidence } of correlations) {
    // Parse eventId: "ts_method_host_path"
    const parts = eventId.split('_');
    if (parts.length >= 4) {
      const method = parts[1];
      const host = parts[2];
      const path = parts.slice(3).join('_');
      const baseKey = `${method}_${host}_${path}`;
      
      const candidates = eventMap.get(baseKey) || [];
      // Find the event closest to the action timestamp
      const targetEvent = candidates.reduce((closest, current) => {
        if (!closest) return current;
        const closestDiff = Math.abs(closest.ts - action.ts);
        const currentDiff = Math.abs(current.ts - action.ts);
        return currentDiff < closestDiff ? current : closest;
      }, undefined as RawNetworkEvent | undefined);

      if (targetEvent && confidence > 0.3) {
        targetEvent.actionId = action.id;
        targetEvent.actionConfidence = confidence;
        if (action.meta?.xpath) targetEvent.actionXpath = action.meta.xpath;
      }
    }
  }
}
