/**
 * Minimal Auth Requirements (Step 2C)
 * 
 * Computes what's actually required to call each endpoint
 */

import type { RequestEvent, EndpointGroup, CookieTimelineEntry, AuthArtifact } from './types';

/**
 * Cookie requirement
 */
export type CookieRequirement = {
  name: string;
  domain: string;
  path: string;
  required: boolean; // true if consistently present in successful calls
  confidence: number; // 0-1, based on consistency
  source?: string; // Which endpoint minted it
  presentInSuccess: number; // Count in successful calls
  presentInFailure: number; // Count in failed calls
};

/**
 * Header requirement
 */
export type HeaderRequirement = {
  name: string;
  required: boolean;
  confidence: number; // 0-1
  source?: string; // Where the value comes from (endpoint/cookie)
  valuePattern?: string; // Pattern of values seen
  presentInSuccess: number;
  presentInFailure: number;
};

/**
 * CSRF binding rule
 */
export type CSRFBinding = {
  cookieName?: string;
  headerName?: string;
  requiredForMutations: boolean;
  detected: boolean;
};

/**
 * Minimal auth requirements for an endpoint group
 */
export type MinimalAuthRequirements = {
  requiredCookies: CookieRequirement[];
  optionalCookies: CookieRequirement[];
  requiredHeaders: HeaderRequirement[];
  optionalHeaders: HeaderRequirement[];
  csrfBinding?: CSRFBinding;
  cookieSources: Map<string, string>; // cookie name -> endpoint URL that sets it
};

/**
 * Compute minimal auth requirements for an endpoint group
 */
export function computeAuthRequirements(
  group: EndpointGroup,
  events: RequestEvent[],
  cookieTimeline: CookieTimelineEntry[],
  authArtifacts: AuthArtifact[]
): MinimalAuthRequirements {
  const groupEvents = events.filter(e => group.eventIds.includes(e.id));
  
  // Separate successful and failed calls
  const successfulEvents = groupEvents.filter(e => e.status >= 200 && e.status < 300);
  const failedEvents = groupEvents.filter(e => e.status === 401 || e.status === 403);
  
  // Compute cookie requirements
  const cookieReqs = computeCookieRequirements(
    groupEvents,
    successfulEvents,
    failedEvents,
    cookieTimeline
  );
  
  // Compute header requirements
  const headerReqs = computeHeaderRequirements(
    groupEvents,
    successfulEvents,
    failedEvents,
    authArtifacts
  );
  
  // Detect CSRF binding
  const csrfBinding = detectCSRFBinding(groupEvents, cookieTimeline);
  
  // Map cookie sources
  const cookieSources = new Map<string, string>();
  for (const cookie of cookieTimeline) {
    cookieSources.set(cookie.cookieName, cookie.setByUrl);
  }
  
  return {
    requiredCookies: cookieReqs.filter(c => c.required),
    optionalCookies: cookieReqs.filter(c => !c.required),
    requiredHeaders: headerReqs.filter(h => h.required),
    optionalHeaders: headerReqs.filter(h => !h.required),
    csrfBinding,
    cookieSources,
  };
}

/**
 * Compute cookie requirements
 */
function computeCookieRequirements(
  allEvents: RequestEvent[],
  successfulEvents: RequestEvent[],
  failedEvents: RequestEvent[],
  cookieTimeline: CookieTimelineEntry[]
): CookieRequirement[] {
  const cookieMap = new Map<string, CookieRequirement>();
  
  // Track cookie presence in events
  for (const event of allEvents) {
    for (const cookie of event.requestCookies) {
      const key = `${cookie.name}:${cookie.domain || event.host}`;
      
      let req = cookieMap.get(key);
      if (!req) {
        req = {
          name: cookie.name,
          domain: cookie.domain || '',
          path: cookie.path || '/',
          required: false,
          confidence: 0,
          presentInSuccess: 0,
          presentInFailure: 0,
        };
        cookieMap.set(key, req);
      }
      
      if (successfulEvents.some(e => e.id === event.id)) {
        req.presentInSuccess++;
      }
      if (failedEvents.some(e => e.id === event.id)) {
        req.presentInFailure++;
      }
    }
  }
  
  // Determine if required
  for (const req of cookieMap.values()) {
    const successRate = successfulEvents.length > 0 
      ? req.presentInSuccess / successfulEvents.length 
      : 0;
    const failureRate = failedEvents.length > 0 
      ? req.presentInFailure / failedEvents.length 
      : 0;
    
    // Required if present in most successful calls
    req.required = successRate > 0.8;
    req.confidence = successRate;
    
    // If present in failures but not successes, it's definitely not required
    if (req.presentInFailure > 0 && req.presentInSuccess === 0) {
      req.required = false;
      req.confidence = 0;
    }
  }
  
  // Add cookie sources
  for (const cookie of cookieTimeline) {
    const key = `${cookie.cookieName}:${cookie.domain}`;
    const req = cookieMap.get(key);
    if (req) {
      req.source = cookie.setByUrl;
    }
  }
  
  return Array.from(cookieMap.values());
}

/**
 * Compute header requirements
 */
function computeHeaderRequirements(
  allEvents: RequestEvent[],
  successfulEvents: RequestEvent[],
  failedEvents: RequestEvent[],
  authArtifacts: AuthArtifact[]
): HeaderRequirement[] {
  const headerMap = new Map<string, HeaderRequirement>();
  
  // Track header presence
  for (const event of allEvents) {
    for (const [headerName, headerValue] of Object.entries(event.requestHeaders)) {
      const key = headerName.toLowerCase();
      
      let req = headerMap.get(key);
      if (!req) {
        req = {
          name: headerName,
          required: false,
          confidence: 0,
          presentInSuccess: 0,
          presentInFailure: 0,
        };
        headerMap.set(key, req);
      }
      
      if (successfulEvents.some(e => e.id === event.id)) {
        req.presentInSuccess++;
      }
      if (failedEvents.some(e => e.id === event.id)) {
        req.presentInFailure++;
      }
    }
  }
  
  // Determine if required
  for (const req of headerMap.values()) {
    const successRate = successfulEvents.length > 0 
      ? req.presentInSuccess / successfulEvents.length 
      : 0;
    const failureRate = failedEvents.length > 0 
      ? req.presentInFailure / failedEvents.length 
      : 0;
    
    // Authorization is always required if present
    if (req.name.toLowerCase() === 'authorization') {
      req.required = successRate > 0.5;
      req.confidence = successRate;
    } else {
      // Other headers: required if consistently present in successes
      req.required = successRate > 0.8;
      req.confidence = successRate;
    }
    
    // If present in failures but not successes, it's not required
    if (req.presentInFailure > 0 && req.presentInSuccess === 0) {
      req.required = false;
      req.confidence = 0;
    }
  }
  
  // Link to auth artifacts for sources
  for (const artifact of authArtifacts) {
    if (artifact.location === 'request_header') {
      const key = artifact.name.toLowerCase();
      const req = headerMap.get(key);
      if (req && artifact.createdByUrl !== 'unknown') {
        req.source = artifact.createdByUrl;
      }
    }
  }
  
  return Array.from(headerMap.values());
}

/**
 * Detect CSRF binding rules
 */
function detectCSRFBinding(
  events: RequestEvent[],
  cookieTimeline: CookieTimelineEntry[]
): CSRFBinding | undefined {
  // Look for XSRF-TOKEN cookie + X-XSRF-Token header pattern
  const xsrfCookie = cookieTimeline.find(c => 
    c.cookieName.toLowerCase().includes('xsrf') || 
    c.cookieName.toLowerCase().includes('csrf')
  );
  
  if (!xsrfCookie) {
    return undefined;
  }
  
  // Find corresponding header
  let xsrfHeader: string | undefined;
  for (const event of events) {
    for (const [headerName] of Object.entries(event.requestHeaders)) {
      if (headerName.toLowerCase() === 'x-xsrf-token' || 
          headerName.toLowerCase() === 'x-csrf-token' ||
          headerName.toLowerCase() === 'xsrf-token' ||
          headerName.toLowerCase() === 'csrf-token') {
        xsrfHeader = headerName;
        break;
      }
    }
    if (xsrfHeader) break;
  }
  
  if (xsrfHeader) {
    return {
      cookieName: xsrfCookie.cookieName,
      headerName: xsrfHeader,
      requiredForMutations: true,
      detected: true,
    };
  }
  
  return undefined;
}
