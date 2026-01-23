/**
 * Endpoint Grouping and Templating (Step 2A)
 * 
 * Groups events by canonical endpoint key and creates templates
 */

import type { RequestEvent } from './types';

/**
 * UUID pattern (8-4-4-4-12 hex)
 */
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Common ID patterns
 */
const ID_PATTERNS = [
  /\b\d{10,}\b/g, // Long numeric IDs
  /\b[0-9a-f]{24,}\b/gi, // Hex IDs (MongoDB ObjectId, etc.)
  /\b[A-Z0-9]{20,}\b/g, // Uppercase alphanumeric IDs
];

/**
 * Template a path by replacing IDs/UUIDs with placeholders
 */
function templatePath(path: string): string {
  let templated = path;
  
  // Replace UUIDs
  templated = templated.replace(UUID_PATTERN, ':uuid');
  
  // Replace common ID patterns
  for (const pattern of ID_PATTERNS) {
    templated = templated.replace(pattern, ':id');
  }
  
  // Replace numeric segments that look like IDs (but keep small numbers)
  templated = templated.replace(/\/(\d{6,})\//g, '/:id/');
  templated = templated.replace(/\/(\d{6,})$/g, '/:id');
  templated = templated.replace(/\/(\d{6,})/g, '/:id');
  
  return templated;
}

/**
 * Create query shape hash (param names only, sorted)
 */
function getQueryShapeHash(query: Record<string, string | string[]>): string {
  const keys = Object.keys(query).sort();
  return keys.join(',');
}

/**
 * Create body shape hash (JSON keys shape, sorted)
 */
function getBodyShapeHash(body: any): string {
  if (!body || typeof body !== 'object') {
    return typeof body;
  }
  
  if (Array.isArray(body)) {
    if (body.length === 0) return 'array:empty';
    const firstItem = body[0];
    if (typeof firstItem === 'object' && firstItem !== null) {
      return `array:${getBodyShapeHash(firstItem)}`;
    }
    return 'array:primitive';
  }
  
  const keys = Object.keys(body).sort();
  const shape: string[] = [];
  
  for (const key of keys) {
    const value = body[key];
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      shape.push(`${key}:${getBodyShapeHash(value)}`);
    } else if (Array.isArray(value)) {
      shape.push(`${key}:array`);
    } else {
      shape.push(`${key}:${typeof value}`);
    }
  }
  
  return shape.join(',');
}

/**
 * Endpoint Key (canonical identifier)
 */
export type EndpointKey = {
  method: string;
  host: string;
  templatedPath: string;
  queryShapeHash: string;
  bodyShapeHash: string;
};

/**
 * Create endpoint key from event
 */
export function createEndpointKey(event: RequestEvent): EndpointKey {
  return {
    method: event.method,
    host: event.host,
    templatedPath: templatePath(event.path),
    queryShapeHash: getQueryShapeHash(event.query),
    bodyShapeHash: event.requestBody?.parsed 
      ? getBodyShapeHash(event.requestBody.parsed)
      : event.requestBody?.text 
        ? 'text'
        : 'none',
  };
}

/**
 * Serialize endpoint key to string for grouping
 */
export function serializeEndpointKey(key: EndpointKey): string {
  return `${key.method}|${key.host}|${key.templatedPath}|${key.queryShapeHash}|${key.bodyShapeHash}`;
}

/**
 * Status distribution
 */
export type StatusDistribution = {
  [status: number]: number;
};

/**
 * Content type distribution
 */
export type ContentTypeDistribution = {
  [contentType: string]: number;
};

/**
 * Endpoint Group
 */
export type EndpointGroup = {
  key: EndpointKey;
  keyString: string;
  
  // Examples
  exampleUrls: string[];
  exampleBodies: Array<{ body: any; eventId: string }>;
  
  // Statistics
  statusDistribution: StatusDistribution;
  contentTypeDistribution: ContentTypeDistribution;
  callCount: number;
  
  // Frequency pattern
  frequencyPattern: 'burst' | 'polling' | 'sparse' | 'unknown';
  
  // Events in this group
  eventIds: string[];
  
  // Role (will be set in Step 2B)
  role?: 'AUTH' | 'DATA' | 'MUTATION' | 'NOISE' | 'UNKNOWN';
};

/**
 * Group events by endpoint key
 */
export function groupEndpoints(events: RequestEvent[]): EndpointGroup[] {
  const groups = new Map<string, EndpointGroup>();
  
  for (const event of events) {
    const key = createEndpointKey(event);
    const keyString = serializeEndpointKey(key);
    
    let group = groups.get(keyString);
    
    if (!group) {
      group = {
        key,
        keyString,
        exampleUrls: [],
        exampleBodies: [],
        statusDistribution: {},
        contentTypeDistribution: {},
        callCount: 0,
        frequencyPattern: 'unknown',
        eventIds: [],
      };
      groups.set(keyString, group);
    }
    
    // Add event
    group.eventIds.push(event.id);
    group.callCount++;
    
    // Add example URL (keep unique, max 5)
    if (!group.exampleUrls.includes(event.url) && group.exampleUrls.length < 5) {
      group.exampleUrls.push(event.url);
    }
    
    // Add example body (keep unique, max 3)
    if (event.requestBody?.parsed) {
      const bodyStr = JSON.stringify(event.requestBody.parsed);
      const existing = group.exampleBodies.find(b => JSON.stringify(b.body) === bodyStr);
      if (!existing && group.exampleBodies.length < 3) {
        group.exampleBodies.push({
          body: event.requestBody.parsed,
          eventId: event.id,
        });
      }
    }
    
    // Update status distribution
    const status = event.status;
    group.statusDistribution[status] = (group.statusDistribution[status] || 0) + 1;
    
    // Update content type distribution
    const contentType = event.contentType || 'unknown';
    group.contentTypeDistribution[contentType] = (group.contentTypeDistribution[contentType] || 0) + 1;
  }
  
  // Analyze frequency patterns
  for (const group of groups.values()) {
    group.frequencyPattern = analyzeFrequencyPattern(group, events);
  }
  
  return Array.from(groups.values());
}

/**
 * Analyze frequency pattern for a group
 */
function analyzeFrequencyPattern(group: EndpointGroup, events: RequestEvent[]): 'burst' | 'polling' | 'sparse' | 'unknown' {
  if (group.callCount < 3) return 'sparse';
  
  const groupEvents = events.filter(e => group.eventIds.includes(e.id));
  if (groupEvents.length < 2) return 'unknown';
  
  // Sort by timestamp
  groupEvents.sort((a, b) => 
    new Date(a.startedDateTime).getTime() - new Date(b.startedDateTime).getTime()
  );
  
  // Calculate intervals
  const intervals: number[] = [];
  for (let i = 1; i < groupEvents.length; i++) {
    const prev = new Date(groupEvents[i - 1].startedDateTime).getTime();
    const curr = new Date(groupEvents[i].startedDateTime).getTime();
    intervals.push(curr - prev);
  }
  
  if (intervals.length === 0) return 'unknown';
  
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const minInterval = Math.min(...intervals);
  const maxInterval = Math.max(...intervals);
  
  // Polling: regular intervals, small variance
  if (avgInterval < 5000 && maxInterval - minInterval < avgInterval * 0.5) {
    return 'polling';
  }
  
  // Burst: many calls in short time
  if (minInterval < 1000 && group.callCount > 5) {
    return 'burst';
  }
  
  // Sparse: long intervals
  if (avgInterval > 30000) {
    return 'sparse';
  }
  
  return 'unknown';
}
