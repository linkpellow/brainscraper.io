/**
 * Auth Event Prioritization Utility
 * 
 * Provides production-ready logic to select the BEST matching event
 * when multiple events match detection criteria, preventing false positives.
 */

import type { RawNetworkEvent } from '@/src/tools/api-signal-explorer/neuromap';

/**
 * Score an event for auth relevance (higher = more relevant)
 */
function scoreAuthEvent(event: RawNetworkEvent, stepType: 'auth-discovery' | 'extract-tokens' | 'token-lifecycle' | 'permanent-creds'): number {
  let score = 0;
  const pathLower = (event.path || '').toLowerCase();
  const urlLower = (event.url || '').toLowerCase();
  const method = (event.method || '').toUpperCase();
  const status = event.status || 0;
  const resBodyLower = (event.resBodyText || '').toLowerCase();
  const reqBodyLower = (event.reqBodyText || '').toLowerCase();
  
  // Penalize OPTIONS (preflight) - these are never auth endpoints
  if (method === 'OPTIONS') {
    return -100;
  }
  
  // Penalize error responses (401/403 might be auth-related but not successful auth)
  if (status >= 400 && status < 500) {
    score -= 20;
  }
  
  // Reward successful responses
  if (status >= 200 && status < 300) {
    score += 10;
  }
  
  // Reward POST/PUT methods (auth is usually POST)
  if (method === 'POST' || method === 'PUT') {
    score += 15;
  }
  
  // Penalize GET for auth-discovery (login is usually POST)
  if (stepType === 'auth-discovery' && method === 'GET') {
    score -= 5;
  }
  
  // Step-specific scoring
  switch (stepType) {
    case 'auth-discovery':
      // Strong indicators
      if (pathLower.includes('/oauth2/authorize') || pathLower.includes('/oauth2/token')) {
        score += 50;
      }
      if (pathLower.includes('/login') && method === 'POST') {
        score += 40;
      }
      if (pathLower.includes('/auth') && method === 'POST') {
        score += 35;
      }
      if (pathLower.includes('/.well-known/openid-configuration')) {
        score += 30; // Discovery endpoint
      }
      // Check for credentials in body
      if (reqBodyLower.includes('password') && (reqBodyLower.includes('username') || reqBodyLower.includes('email'))) {
        score += 25;
      }
      // OAuth flow indicators
      if (urlLower.includes('grant_type=') || urlLower.includes('response_type=')) {
        score += 20;
      }
      // Penalize non-auth endpoints
      if (pathLower.includes('helpitems') || pathLower.includes('settings') || pathLower.includes('telemetry')) {
        score -= 50;
      }
      break;
      
    case 'extract-tokens':
      // Strong indicators
      if (resBodyLower.includes('"access_token"') || resBodyLower.includes('"accessToken"')) {
        score += 50;
      }
      if (resBodyLower.includes('"refresh_token"') || resBodyLower.includes('"refreshToken"')) {
        score += 45;
      }
      // Bearer token in request header (subsequent authenticated request)
      const authHeader = Object.entries(event.reqHeaders || {})
        .find(([key]) => key.toLowerCase() === 'authorization')?.[1] || '';
      if (authHeader.startsWith('Bearer ')) {
        score += 40;
      }
      // Token endpoint response
      if (pathLower.includes('/token') && method === 'POST' && status === 200) {
        score += 35;
      }
      // Penalize error messages containing "token"
      if (resBodyLower.includes('invalid token') || resBodyLower.includes('token expired') || resBodyLower.includes('token error')) {
        score -= 30;
      }
      // Penalize non-token endpoints
      if (!pathLower.includes('token') && !pathLower.includes('auth') && !authHeader.startsWith('Bearer ')) {
        score -= 20;
      }
      break;
      
    case 'token-lifecycle':
      // Strong indicators
      if (resBodyLower.includes('"expires_in"') || resBodyLower.includes('"expiresIn"')) {
        score += 40;
      }
      if (resBodyLower.includes('"expires_at"') || resBodyLower.includes('"expiresAt"')) {
        score += 35;
      }
      if (pathLower.includes('refresh') && method === 'POST') {
        score += 30;
      }
      // Token refresh response
      if (pathLower.includes('/token') && reqBodyLower.includes('refresh_token')) {
        score += 25;
      }
      break;
      
    case 'permanent-creds':
      // Strong indicators
      const headerKeys = Object.keys(event.reqHeaders || {}).map(k => k.toLowerCase());
      if (headerKeys.includes('x-api-key') || headerKeys.includes('api-key')) {
        score += 40;
      }
      if (headerKeys.some(k => k.includes('client-id') || k.includes('client_id'))) {
        score += 35;
      }
      if (reqBodyLower.includes('client_id') || reqBodyLower.includes('client_secret')) {
        score += 30;
      }
      // Penalize non-credential endpoints
      if (pathLower.includes('telemetry') || pathLower.includes('analytics') || pathLower.includes('tracking')) {
        score -= 50;
      }
      break;
  }
  
  return score;
}

/**
 * Select the best matching event from candidates
 * Prioritizes: POST > GET, 200 > errors, auth-specific paths > generic
 */
export function selectBestAuthEvent(
  events: RawNetworkEvent[],
  stepType: 'auth-discovery' | 'extract-tokens' | 'token-lifecycle' | 'permanent-creds'
): RawNetworkEvent | undefined {
  if (!events || events.length === 0) return undefined;
  
  // Score all events
  const scoredEvents = events
    .map(event => ({
      event,
      score: scoreAuthEvent(event, stepType),
    }))
    .filter(({ score }) => score > 0) // Only consider positive scores
    .sort((a, b) => b.score - a.score); // Sort by score descending
  
  if (scoredEvents.length === 0) return undefined;
  
  // Return highest scoring event
  return scoredEvents[0].event;
}

/**
 * Verify an event is actually part of an auth flow (not a false positive)
 */
export function verifyAuthEvent(event: RawNetworkEvent, stepType: 'auth-discovery' | 'extract-tokens' | 'token-lifecycle' | 'permanent-creds'): {
  isValid: boolean;
  reason?: string;
} {
  const pathLower = (event.path || '').toLowerCase();
  const method = (event.method || '').toUpperCase();
  const status = event.status || 0;
  const resBodyLower = (event.resBodyText || '').toLowerCase();
  
  // Reject OPTIONS (preflight)
  if (method === 'OPTIONS') {
    return { isValid: false, reason: 'OPTIONS preflight request, not an auth endpoint' };
  }
  
  // Reject error responses for auth-discovery (we want successful login)
  if (stepType === 'auth-discovery' && status >= 400) {
    return { isValid: false, reason: `Error response (${status}), not a successful auth endpoint` };
  }
  
  // Reject clearly non-auth endpoints
  const nonAuthPatterns = [
    'telemetry', 'analytics', 'tracking', 'collect',
    'helpitems', 'settings', 'config', 'static',
    'favicon', 'logo', 'image', 'css', 'js', 'font'
  ];
  
  if (nonAuthPatterns.some(pattern => pathLower.includes(pattern))) {
    return { isValid: false, reason: `Non-auth endpoint: ${event.path}` };
  }
  
  // For extract-tokens, verify tokens are actually present (not just error messages)
  if (stepType === 'extract-tokens') {
    const hasTokenError = resBodyLower.includes('invalid token') ||
                         resBodyLower.includes('token expired') ||
                         resBodyLower.includes('token error') ||
                         resBodyLower.includes('unauthorized');
    
    if (hasTokenError && !resBodyLower.includes('"access_token"') && !resBodyLower.includes('"token"')) {
      return { isValid: false, reason: 'Error message about tokens, not actual token response' };
    }
    
    // Must have actual token in response or Bearer header in request
    const hasActualToken = resBodyLower.includes('"access_token"') ||
                          resBodyLower.includes('"refresh_token"') ||
                          resBodyLower.includes('"token"') ||
                          Object.entries(event.reqHeaders || {}).some(([key, value]) => 
                            key.toLowerCase() === 'authorization' && 
                            typeof value === 'string' && 
                            value.startsWith('Bearer ')
                          );
    
    if (!hasActualToken) {
      return { isValid: false, reason: 'No actual tokens found in response or request headers' };
    }
  }
  
  return { isValid: true };
}
