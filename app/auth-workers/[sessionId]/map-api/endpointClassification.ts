/**
 * Endpoint Classification (Step 2B)
 * 
 * Classifies endpoints by role: AUTH, DATA, MUTATION, NOISE, UNKNOWN
 */

import type { RequestEvent, EndpointGroup, CookieTimelineEntry, AuthArtifact } from './types';

/**
 * Classify endpoint role
 */
export function classifyEndpointRole(
  group: EndpointGroup,
  events: RequestEvent[],
  cookieTimeline: CookieTimelineEntry[],
  authArtifacts: AuthArtifact[]
): 'AUTH' | 'DATA' | 'MUTATION' | 'NOISE' | 'UNKNOWN' {
  const groupEvents = events.filter(e => group.eventIds.includes(e.id));
  
  // Check for noise first
  if (isNoise(group, groupEvents)) {
    return 'NOISE';
  }
  
  // Check for auth
  if (isAuthEndpoint(group, groupEvents, cookieTimeline, authArtifacts)) {
    return 'AUTH';
  }
  
  // Check for mutation
  if (isMutationEndpoint(group, groupEvents)) {
    return 'MUTATION';
  }
  
  // Check for data
  if (isDataEndpoint(group, groupEvents)) {
    return 'DATA';
  }
  
  return 'UNKNOWN';
}

/**
 * Check if endpoint is noise
 */
function isNoise(group: EndpointGroup, events: RequestEvent[]): boolean {
  // Preflight OPTIONS
  if (group.key.method === 'OPTIONS') {
    return true;
  }
  
  // Polling/heartbeat (high frequency, small size, repetitive)
  if (group.frequencyPattern === 'polling' && events.length > 10) {
    const avgSize = events.reduce((sum, e) => sum + e.size, 0) / events.length;
    if (avgSize < 1000) { // Small responses
      return true;
    }
  }
  
  // Assets (images, fonts, etc.)
  const path = group.key.templatedPath.toLowerCase();
  const assetExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.css', '.js', '.ico'];
  if (assetExtensions.some(ext => path.includes(ext))) {
    return true;
  }
  
  // Telemetry/analytics
  const telemetryPaths = ['analytics', 'telemetry', 'tracking', 'beacon', 'pixel', 'metrics'];
  if (telemetryPaths.some(term => path.includes(term))) {
    return true;
  }
  
  return false;
}

/**
 * Check if endpoint is auth-related
 */
function isAuthEndpoint(
  group: EndpointGroup,
  events: RequestEvent[],
  cookieTimeline: CookieTimelineEntry[],
  authArtifacts: AuthArtifact[]
): boolean {
  // Check if any event sets session cookies
  for (const event of events) {
    if (event.responseCookies.length > 0) {
      // Check if cookies look like session/auth cookies
      const hasAuthCookie = event.responseCookies.some(cookie => {
        const name = cookie.name.toLowerCase();
        return name.includes('session') || 
               name.includes('auth') || 
               name.includes('token') ||
               name === 'sid' ||
               name === 'jsessionid';
      });
      
      if (hasAuthCookie) {
        return true;
      }
    }
  }
  
  // Check if response contains token-like JSON
  for (const event of events) {
    if (event.responseBody?.parsed && typeof event.responseBody.parsed === 'object') {
      const body = event.responseBody.parsed;
      const tokenKeys = ['access_token', 'refresh_token', 'id_token', 'token', 'expires_in', 'token_type'];
      if (tokenKeys.some(key => key in body)) {
        return true;
      }
    }
  }
  
  // Check path for auth-related terms
  const path = group.key.templatedPath.toLowerCase();
  const authPaths = ['login', 'oauth', 'token', 'refresh', 'session', 'sso', 'authorize', 'callback', 'auth', 'authenticate'];
  if (authPaths.some(term => path.includes(term))) {
    return true;
  }
  
  // Check response headers
  for (const event of events) {
    if (event.responseHeaders['www-authenticate']) {
      return true;
    }
    
    // Check for redirects to identity provider
    if (event.status >= 300 && event.status < 400) {
      const location = event.responseHeaders.location || '';
      if (location.includes('login') || location.includes('auth') || location.includes('oauth')) {
        return true;
      }
    }
  }
  
  // Check if this endpoint creates auth artifacts
  for (const artifact of authArtifacts) {
    if (artifact.createdByUrl && group.exampleUrls.some(url => artifact.createdByUrl.includes(new URL(url).pathname))) {
      if (artifact.type === 'bearer_token' || artifact.type === 'refresh_token' || artifact.type === 'session_token') {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Check if endpoint is a mutation
 */
function isMutationEndpoint(group: EndpointGroup, events: RequestEvent[]): boolean {
  // POST/PUT/PATCH/DELETE
  const mutationMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!mutationMethods.includes(group.key.method)) {
    return false;
  }
  
  // Check if it returns JSON (likely an API mutation)
  for (const event of events) {
    if (event.isJson && event.status >= 200 && event.status < 300) {
      return true;
    }
  }
  
  return true; // If it's a mutation method, assume it's a mutation
}

/**
 * Check if endpoint is data retrieval
 */
function isDataEndpoint(group: EndpointGroup, events: RequestEvent[]): boolean {
  // GET requests
  if (group.key.method !== 'GET') {
    return false;
  }
  
  // Must return JSON with non-trivial payload
  for (const event of events) {
    if (event.isJson && event.status === 200) {
      // Check if response has meaningful data
      if (event.responseBody?.parsed) {
        const body = event.responseBody.parsed;
        if (typeof body === 'object' && body !== null) {
          // Has keys = has data
          if (Object.keys(body).length > 0) {
            return true;
          }
        } else if (Array.isArray(body) && body.length > 0) {
          return true;
        }
      } else if (event.size > 100) { // Non-trivial size
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Classify all endpoint groups
 */
export function classifyAllEndpoints(
  groups: EndpointGroup[],
  events: RequestEvent[],
  cookieTimeline: CookieTimelineEntry[],
  authArtifacts: AuthArtifact[]
): EndpointGroup[] {
  for (const group of groups) {
    group.role = classifyEndpointRole(group, events, cookieTimeline, authArtifacts);
  }
  
  return groups;
}
