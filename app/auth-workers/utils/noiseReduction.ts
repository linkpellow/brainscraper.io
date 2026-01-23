/**
 * Noise Reduction Utilities
 * 
 * Detects and collapses repetitive logs, polling, and static assets
 */

import type { StructuredEvent } from './eventBus';
import type { CapturedLog } from '../hooks/useConsoleCapture';

export type EventClassification = 'asset' | 'polling' | 'api' | 'auth' | 'error' | 'unknown';

/**
 * Classify event type for noise filtering
 */
export function classifyEvent(event: StructuredEvent | CapturedLog): EventClassification {
  // Check network events
  const network = (event as StructuredEvent).network;
  if (network) {
    const url = network.url.toLowerCase();
    
    // Static assets
    if (url.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|ico|map)$/)) {
      return 'asset';
    }
    
    // Polling patterns
    if (url.includes('poll') || 
        url.includes('heartbeat') || 
        url.includes('ping') ||
        url.includes('status') && network.method === 'GET') {
      return 'polling';
    }
    
    // Auth endpoints
    if (url.includes('auth') || 
        url.includes('token') || 
        url.includes('login') ||
        url.includes('oauth')) {
      return 'auth';
    }
    
    // API endpoints
    if (url.includes('/api/') || url.includes('/v1/') || url.includes('/v2/')) {
      return 'api';
    }
  }
  
  // Error events
  if (event.level === 'error') {
    return 'error';
  }
  
  return 'unknown';
}

/**
 * Check if event is repetitive (same fingerprint within time window)
 */
export function isRepetitive(
  event: StructuredEvent | CapturedLog,
  recentEvents: Array<StructuredEvent | CapturedLog>,
  timeWindowMs: number = 3000
): boolean {
  const fingerprint = (event as any).fingerprint || event.id;
  const cutoff = event.timestamp - timeWindowMs;
  
  const similarEvents = recentEvents.filter(e => 
    ((e as any).fingerprint || e.id) === fingerprint &&
    e.timestamp >= cutoff &&
    e.id !== event.id
  );
  
  return similarEvents.length > 0;
}

/**
 * Get repeat count for an event group
 */
export function getRepeatCount(
  event: StructuredEvent | CapturedLog,
  allEvents: Array<StructuredEvent | CapturedLog>,
  timeWindowMs: number = 3000
): number {
  const fingerprint = (event as any).fingerprint || event.id;
  const cutoff = event.timestamp - timeWindowMs;
  
  return allEvents.filter(e => 
    ((e as any).fingerprint || e.id) === fingerprint &&
    e.timestamp >= cutoff
  ).length;
}

/**
 * Filter noise based on classification and repetition
 */
export function filterNoise(
  events: Array<StructuredEvent | CapturedLog>,
  options: {
    hideAssets?: boolean;
    hidePolling?: boolean;
    collapseRepetitive?: boolean;
    minRepeatCount?: number;
  } = {}
): {
  filtered: Array<StructuredEvent | CapturedLog>;
  collapsed: Map<string, { event: StructuredEvent | CapturedLog; count: number }>;
} {
  const {
    hideAssets = true,
    hidePolling = true,
    collapseRepetitive = true,
    minRepeatCount = 3,
  } = options;
  
  const filtered: Array<StructuredEvent | CapturedLog> = [];
  const collapsed = new Map<string, { event: StructuredEvent | CapturedLog; count: number }>();
  const seenFingerprints = new Map<string, number>();
  
  for (const event of events) {
    const classification = classifyEvent(event);
    const fingerprint = (event as any).fingerprint || event.id;
    
    // Skip assets and polling if enabled
    if (hideAssets && classification === 'asset') continue;
    if (hidePolling && classification === 'polling') continue;
    
    // Handle repetitive events
    if (collapseRepetitive) {
      const repeatCount = getRepeatCount(event, events);
      
      if (repeatCount >= minRepeatCount) {
        if (!seenFingerprints.has(fingerprint)) {
          seenFingerprints.set(fingerprint, repeatCount);
          collapsed.set(fingerprint, { event, count: repeatCount });
        }
        // Skip adding to filtered if it's repetitive (will show in collapsed)
        continue;
      }
    }
    
    filtered.push(event);
  }
  
  return { filtered, collapsed };
}
