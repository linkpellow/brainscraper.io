/**
 * Automation-Ready Endpoint Grouping (Refactored Step A)
 * 
 * Groups requests by method + host + normalizedPathTemplate + bodyShapeHash + queryShapeHash
 */

import type { RequestEvent } from './types';

/**
 * Endpoint Group (simplified for automation)
 */
export type AutomationEndpointGroup = {
  // Identity
  method: string;
  host: string;
  normalizedPathTemplate: string;
  bodyShapeHash: string;
  queryShapeHash: string;
  groupKey: string; // Composite key for grouping
  
  // Examples
  examples: string[]; // Full URLs (max 5)
  sampleHeaders: string[]; // Header names only
  sampleBodyKeys: string[]; // JSON keys from request body
  sampleResponseKeys: string[]; // JSON keys from response body
  
  // Response metadata
  responseContentType?: string;
  statusCounts: Record<number, number>;
  count: number;
  
  // Auth flags
  hasAuthHeader: boolean; // Authorization present
  hasCookies: boolean; // Cookie header present
  isJsonResponse: boolean;
  
  // Derived
  isFirstParty: boolean;
  isMutation: boolean; // POST/PUT/PATCH/DELETE
  isAutomationReady: boolean; // Passes automation filter
};

/**
 * Normalize path template
 */
function normalizePathTemplate(path: string): string {
  let normalized = path;
  
  // Replace UUIDs
  normalized = normalized.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':uuid');
  
  // Replace long numeric IDs (6+ digits)
  normalized = normalized.replace(/\/(\d{6,})\//g, '/:id/');
  normalized = normalized.replace(/\/(\d{6,})$/g, '/:id');
  normalized = normalized.replace(/\/(\d{6,})/g, '/:id');
  
  // Replace long hex tokens (24+ chars)
  normalized = normalized.replace(/\/([0-9a-f]{24,})\//gi, '/:hash/');
  normalized = normalized.replace(/\/([0-9a-f]{24,})$/gi, '/:hash');
  normalized = normalized.replace(/\/([0-9a-f]{24,})/gi, '/:hash');
  
  return normalized;
}

/**
 * Get body shape hash
 */
function getBodyShapeHash(body: any): string {
  if (!body || typeof body !== 'object') {
    return typeof body;
  }
  
  if (Array.isArray(body)) {
    if (body.length === 0) return 'array:empty';
    return `array:${getBodyShapeHash(body[0])}`;
  }
  
  const keys = Object.keys(body).sort();
  return keys.join(',');
}

/**
 * Get query shape hash
 */
function getQueryShapeHash(query: Record<string, string | string[]>): string {
  const keys = Object.keys(query).sort();
  return keys.join(',');
}

/**
 * Extract JSON keys from object (recursive, top-level only for samples)
 */
function extractTopLevelKeys(obj: any): string[] {
  if (!obj || typeof obj !== 'object') return [];
  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === 'object') {
      return Object.keys(obj[0]);
    }
    return [];
  }
  return Object.keys(obj);
}

/**
 * Group events into automation-ready endpoint groups
 */
export function groupAutomationEndpoints(
  events: RequestEvent[],
  firstPartyHosts: string[]
): AutomationEndpointGroup[] {
  const groups = new Map<string, AutomationEndpointGroup>();
  
  for (const event of events) {
    // Skip noise
    if (event.isPreflight || event.method === 'OPTIONS' || event.method === 'HEAD') {
      continue;
    }
    
    // Skip assets
    const path = event.path.toLowerCase();
    const assetExtensions = ['.js', '.css', '.woff', '.woff2', '.ttf', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.mp4', '.webm'];
    if (assetExtensions.some(ext => path.includes(ext))) {
      continue;
    }
    
    // Skip telemetry
    const telemetryPaths = ['analytics', 'telemetry', 'tracking', 'beacon', 'pixel', 'metrics'];
    if (telemetryPaths.some(term => path.includes(term))) {
      continue;
    }
    
    const normalizedPath = normalizePathTemplate(event.path);
    const bodyShapeHash = event.requestBody?.parsed 
      ? getBodyShapeHash(event.requestBody.parsed)
      : event.requestBody?.text ? 'text' : 'none';
    const queryShapeHash = getQueryShapeHash(event.query);
    
    const groupKey = `${event.method}|${event.host}|${normalizedPath}|${bodyShapeHash}|${queryShapeHash}`;
    
    let group = groups.get(groupKey);
    
    if (!group) {
      group = {
        method: event.method,
        host: event.host,
        normalizedPathTemplate: normalizedPath,
        bodyShapeHash,
        queryShapeHash,
        groupKey,
        examples: [],
        sampleHeaders: [],
        sampleBodyKeys: [],
        sampleResponseKeys: [],
        statusCounts: {},
        count: 0,
        hasAuthHeader: false,
        hasCookies: false,
        isJsonResponse: false,
        isFirstParty: firstPartyHosts.includes(event.host),
        isMutation: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.method),
        isAutomationReady: false,
      };
      groups.set(groupKey, group);
    }
    
    // Update group
    group.count++;
    
    // Add example URL
    if (!group.examples.includes(event.url) && group.examples.length < 5) {
      group.examples.push(event.url);
    }
    
    // Collect header names
    for (const headerName of Object.keys(event.requestHeaders)) {
      if (!group.sampleHeaders.includes(headerName)) {
        group.sampleHeaders.push(headerName);
      }
    }
    
    // Check auth
    if (event.requestHeaders.authorization) {
      group.hasAuthHeader = true;
    }
    if (event.requestHeaders.cookie) {
      group.hasCookies = true;
    }
    
    // Extract body keys
    if (event.requestBody?.parsed && typeof event.requestBody.parsed === 'object') {
      const bodyKeys = extractTopLevelKeys(event.requestBody.parsed);
      for (const key of bodyKeys) {
        if (!group.sampleBodyKeys.includes(key)) {
          group.sampleBodyKeys.push(key);
        }
      }
    }
    
    // Extract response keys
    if (event.responseBody?.parsed && typeof event.responseBody.parsed === 'object') {
      const responseKeys = extractTopLevelKeys(event.responseBody.parsed);
      for (const key of responseKeys) {
        if (!group.sampleResponseKeys.includes(key)) {
          group.sampleResponseKeys.push(key);
        }
      }
    }
    
    // Update status counts
    group.statusCounts[event.status] = (group.statusCounts[event.status] || 0) + 1;
    
    // Update content type
    if (event.contentType && !group.responseContentType) {
      group.responseContentType = event.contentType;
    }
    
    // Check if JSON response
    if (event.isJson || event.contentType?.includes('json')) {
      group.isJsonResponse = true;
    }
  }
  
  // Determine automation-ready status
  for (const group of groups.values()) {
    // Automation-ready if:
    // - JSON response OR JSON body
    // - AND (mutation OR important GET with data)
    // - AND first-party (unless explicitly allowed)
    group.isAutomationReady = 
      (group.isJsonResponse || group.sampleBodyKeys.length > 0) &&
      (group.isMutation || (group.method === 'GET' && group.sampleResponseKeys.length > 0)) &&
      group.isFirstParty;
  }
  
  return Array.from(groups.values())
    .filter(g => g.isAutomationReady)
    .sort((a, b) => {
      // Sort: mutations first, then by count
      if (a.isMutation && !b.isMutation) return -1;
      if (!a.isMutation && b.isMutation) return 1;
      return b.count - a.count;
    });
}
