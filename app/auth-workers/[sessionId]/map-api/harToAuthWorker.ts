/**
 * HAR to Auth Worker Converter
 * 
 * Creates an auth worker session from HAR file data alone
 */

import type { RequestEvent, ArtifactBundle } from './types';
import type { PersistedAuthWorkerState } from '../../utils/authWorkerPersistence';

/**
 * OAuth credentials extracted from HAR
 */
export type OAuthCredentials = {
  client_id?: string;
  client_secret?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  grant_type?: string;
  redirect_uri?: string;
};

/**
 * Token data extracted from HAR
 */
export type TokenData = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
};

/**
 * Extract OAuth credentials from HAR events
 */
export function extractOAuthCredentials(events: RequestEvent[]): {
  credentials: OAuthCredentials;
  tokenEndpoint: RequestEvent | null;
  tokenData: TokenData | null;
} {
  const credentials: OAuthCredentials = {};
  let tokenEndpoint: RequestEvent | null = null;
  let tokenData: TokenData | null = null;
  
  // Find token endpoint (usually POST to /oauth2/v2.0/token or /token)
  for (const event of events) {
    const url = event.url.toLowerCase();
    const path = event.path.toLowerCase();
    
    // Check if this is a token endpoint
    const isTokenEndpoint = 
      (url.includes('/oauth2/v2.0/token') || 
       url.includes('/oauth/token') ||
       url.includes('/connect/token') ||
       url.includes('/account/refresh') ||
       url.includes('/account/token') ||
       url.includes('/api/token') ||
       url.includes('/auth/token') ||
       path.includes('/token') ||
       path.includes('/refresh')) &&
      event.method === 'POST' &&
      event.status >= 200 && event.status < 300;
    
    if (isTokenEndpoint) {
      tokenEndpoint = event;
      
      // Extract credentials from request body (JSON or form-urlencoded)
      if (event.requestBody?.parsed && typeof event.requestBody.parsed === 'object') {
        const body = event.requestBody.parsed;
        
        if (body.client_id) credentials.client_id = body.client_id;
        if (body.clientId) credentials.clientId = body.clientId;
        if (body.client_secret) credentials.client_secret = body.client_secret;
        if (body.clientSecret) credentials.clientSecret = body.clientSecret;
        if (body.scope) credentials.scope = body.scope;
        if (body.grant_type) credentials.grant_type = body.grant_type;
        if (body.redirect_uri) credentials.redirect_uri = body.redirect_uri;
      }
      
      // Also check raw text for form-urlencoded (if parsed failed)
      if (event.requestBody?.text && !event.requestBody?.parsed) {
        try {
          const params = new URLSearchParams(event.requestBody.text);
          if (params.get('client_id') && !credentials.client_id) {
            credentials.client_id = params.get('client_id')!;
          }
          if (params.get('client_secret') && !credentials.client_secret) {
            credentials.client_secret = params.get('client_secret')!;
          }
          if (params.get('scope') && !credentials.scope) {
            credentials.scope = params.get('scope')!;
          }
          if (params.get('grant_type') && !credentials.grant_type) {
            credentials.grant_type = params.get('grant_type')!;
          }
          if (params.get('redirect_uri') && !credentials.redirect_uri) {
            credentials.redirect_uri = params.get('redirect_uri')!;
          }
        } catch (e) {
          // Not form-urlencoded, ignore
        }
      }
      
      // Extract token data from response
      if (event.responseBody?.parsed && typeof event.responseBody.parsed === 'object') {
        const response = event.responseBody.parsed;
        
        // Handle nested tokenResult format (e.g., {"tokenResult":{"access_token":"..."}})
        const tokenSource = response.tokenResult || response.data || response;
        
        tokenData = {
          access_token: tokenSource.access_token || tokenSource.accessToken || response.access_token || response.accessToken,
          refresh_token: tokenSource.refresh_token || tokenSource.refreshToken || response.refresh_token || response.refreshToken,
          id_token: tokenSource.id_token || tokenSource.idToken || response.id_token || response.idToken,
          expires_in: tokenSource.expires_in || tokenSource.expiresIn || response.expires_in || response.expiresIn,
          token_type: tokenSource.token_type || tokenSource.tokenType || response.token_type || response.tokenType || 'Bearer',
        };
      }
      
      break; // Use first successful token endpoint
    }
  }
  
  // If not found in token endpoint, search all events for OAuth credentials
  if (!tokenEndpoint || Object.keys(credentials).length === 0) {
    for (const event of events) {
      // Check request body for OAuth parameters
      if (event.requestBody?.parsed && typeof event.requestBody.parsed === 'object') {
        const body = event.requestBody.parsed;
        
        if (body.client_id && !credentials.client_id) {
          credentials.client_id = body.client_id;
        }
        if (body.clientId && !credentials.clientId) {
          credentials.clientId = body.clientId;
        }
        if (body.client_secret && !credentials.client_secret) {
          credentials.client_secret = body.client_secret;
        }
        if (body.clientSecret && !credentials.clientSecret) {
          credentials.clientSecret = body.clientSecret;
        }
        if (body.scope && !credentials.scope) {
          credentials.scope = body.scope;
        }
      }
      
      // Check response for tokens
      if (event.responseBody?.parsed && typeof event.responseBody.parsed === 'object' && !tokenData) {
        const response = event.responseBody.parsed;
        
        // Handle nested tokenResult format (e.g., {"tokenResult":{"access_token":"..."}})
        const tokenSource = response.tokenResult || response.data || response;
        
        if (tokenSource.access_token || tokenSource.refresh_token || response.access_token || response.refresh_token) {
          tokenData = {
            access_token: tokenSource.access_token || tokenSource.accessToken || response.access_token || response.accessToken,
            refresh_token: tokenSource.refresh_token || tokenSource.refreshToken || response.refresh_token || response.refreshToken,
            id_token: tokenSource.id_token || tokenSource.idToken || response.id_token || response.idToken,
            expires_in: tokenSource.expires_in || tokenSource.expiresIn || response.expires_in || response.expiresIn,
            token_type: tokenSource.token_type || tokenSource.tokenType || response.token_type || response.tokenType || 'Bearer',
          };
          
          if (!tokenEndpoint && event.status >= 200 && event.status < 300) {
            tokenEndpoint = event;
          }
        }
      }
    }
  }
  
  return {
    credentials,
    tokenEndpoint,
    tokenData,
  };
}

/**
 * Find refresh endpoint in HAR events
 */
function findRefreshEndpoint(
  bundle: ArtifactBundle,
  targetDomain: string
): RequestEvent | null {
  // Look for refresh endpoints (POST requests to /refresh, /account/refresh, etc.)
  const firstPartyEvents = bundle.events.filter(e => 
    e.host.includes(targetDomain) || bundle.hosts.firstParty.includes(e.host)
  );
  
  for (const event of firstPartyEvents) {
    const url = event.url.toLowerCase();
    const path = event.path.toLowerCase();
    
    // Check if this is a refresh endpoint
    const isRefreshEndpoint = 
      (url.includes('/account/refresh') ||
       url.includes('/auth/refresh') ||
       url.includes('/token/refresh') ||
       url.includes('/refresh') ||
       path.includes('/refresh')) &&
      event.method === 'POST' &&
      event.status >= 200 && event.status < 300;
    
    if (isRefreshEndpoint) {
      // Verify it returns a token
      if (event.responseBody?.parsed) {
        const response = event.responseBody.parsed;
        const tokenSource = response.tokenResult || response.data || response;
        if (tokenSource.access_token || response.access_token) {
          return event;
        }
      }
    }
  }
  
  return null;
}

/**
 * Extract Bearer token from Authorization headers in request events
 */
function extractBearerTokenFromHeaders(
  bundle: ArtifactBundle,
  targetDomain: string
): { token: string; event: RequestEvent | null; refreshEndpoint: RequestEvent | null } | null {
  // First, try to find Bearer token in auth artifacts
  const bearerArtifact = bundle.authArtifacts.find(
    a => a.type === 'bearer_token' && a.location === 'request_header'
  );
  
  let token: string | null = null;
  let event: RequestEvent | null = null;
  
  if (bearerArtifact && bearerArtifact.value) {
    // Find the first event that uses this token (prefer first-party domain)
    const firstPartyEvents = bundle.events.filter(e => 
      e.host.includes(targetDomain) || bundle.hosts.firstParty.includes(e.host)
    );
    
    event = firstPartyEvents.find(e => 
      bearerArtifact.usedInEventIds.includes(e.id)
    ) || bundle.events.find(e => bearerArtifact.usedInEventIds.includes(e.id));
    
    if (event) {
      token = bearerArtifact.value;
    }
  }
  
  // Fallback: scan events directly for Authorization headers
  if (!token) {
    const firstPartyEvents = bundle.events.filter(e => 
      e.host.includes(targetDomain) || bundle.hosts.firstParty.includes(e.host)
    );
    
    for (const evt of firstPartyEvents) {
      const authHeader = evt.requestHeaders.authorization || evt.requestHeaders['authorization'];
      if (authHeader) {
        const match = authHeader.match(/^Bearer\s+(.+)$/i);
        if (match && match[1] && match[1].length > 10) {
          token = match[1];
          event = evt;
          break;
        }
      }
    }
  }
  
  // Also check all events if no first-party match
  if (!token) {
    for (const evt of bundle.events) {
      const authHeader = evt.requestHeaders.authorization || evt.requestHeaders['authorization'];
      if (authHeader) {
        const match = authHeader.match(/^Bearer\s+(.+)$/i);
        if (match && match[1] && match[1].length > 10) {
          token = match[1];
          event = evt;
          break;
        }
      }
    }
  }
  
  if (!token) {
    return null;
  }
  
  // Find refresh endpoint
  const refreshEndpoint = findRefreshEndpoint(bundle, targetDomain);
  
  return { token, event, refreshEndpoint };
}

/**
 * Extract session cookies for target domain
 */
function extractSessionCookies(
  bundle: ArtifactBundle,
  targetDomain: string
): { cookies: Array<{ name: string; value: string }>; event: RequestEvent | null } | null {
  const sessionCookies: Array<{ name: string; value: string }> = [];
  
  // Find cookies for target domain
  const relevantCookies = bundle.cookieJar.timeline.filter(c => 
    c.domain.includes(targetDomain) || 
    bundle.hosts.firstParty.some(h => c.domain.includes(h))
  );
  
  // Get the most recent values
  for (const cookie of relevantCookies) {
    if (cookie.cookieName.toLowerCase().includes('session') ||
        cookie.cookieName.toLowerCase().includes('auth') ||
        cookie.cookieName.toLowerCase().includes('token')) {
      sessionCookies.push({
        name: cookie.cookieName,
        value: cookie.value,
      });
    }
  }
  
  if (sessionCookies.length === 0) return null;
  
  // Find an event that uses these cookies
  const event = bundle.events.find(e => {
    return sessionCookies.some(c => 
      e.requestCookies.some(rc => rc.name === c.name && rc.value === c.value)
    );
  });
  
  return { cookies: sessionCookies, event };
}

/**
 * Extract API keys from headers
 */
function extractAPIKeys(
  bundle: ArtifactBundle,
  targetDomain: string
): { apiKey: string; headerName: string; event: RequestEvent | null } | null {
  // Find API key in auth artifacts
  const apiKeyArtifact = bundle.authArtifacts.find(
    a => a.type === 'api_key' && a.location === 'request_header'
  );
  
  if (apiKeyArtifact) {
    const event = bundle.events.find(e => 
      apiKeyArtifact.usedInEventIds.includes(e.id)
    );
    if (event) {
      return { apiKey: apiKeyArtifact.value, headerName: apiKeyArtifact.name, event };
    }
  }
  
  // Fallback: scan events for common API key headers
  const apiKeyHeaders = ['x-api-key', 'api-key', 'x-rapidapi-key', 'authorization'];
  const firstPartyEvents = bundle.events.filter(e => 
    e.host.includes(targetDomain) || bundle.hosts.firstParty.includes(e.host)
  );
  
  for (const event of firstPartyEvents) {
    for (const headerName of apiKeyHeaders) {
      const value = event.requestHeaders[headerName] || event.requestHeaders[headerName.toLowerCase()];
      if (value && value.length > 10 && !value.toLowerCase().startsWith('bearer')) {
        return { apiKey: value, headerName, event };
      }
    }
  }
  
  return null;
}

/**
 * Create auth worker session from HAR data
 * 
 * Supports multiple auth methods:
 * 1. OAuth token endpoints (with access_token in response)
 * 2. Bearer tokens in Authorization headers
 * 3. Session cookies
 * 4. API keys in headers
 * 
 * Note: targetDomain should be the actual site being automated (e.g., agent.ushadvisors.com),
 * NOT the OAuth provider (e.g., microsoftonline.com). The OAuth provider is just used for authentication.
 */
export function createAuthWorkerFromHAR(
  bundle: ArtifactBundle,
  sessionId: string,
  targetDomain: string
): PersistedAuthWorkerState | null {
  // Strategy 1: Try OAuth token endpoint first
  const { credentials, tokenEndpoint, tokenData } = extractOAuthCredentials(bundle.events);
  
  if (tokenEndpoint && tokenData?.access_token) {
    console.log('[HARToAuthWorker] Using OAuth token endpoint:', {
      sessionId,
      targetDomain,
      tokenEndpointHost: tokenEndpoint.host,
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
    });
    
    return createAuthWorkerFromOAuth(
      sessionId,
      targetDomain,
      tokenEndpoint,
      tokenData,
      credentials
    );
  }
  
  // Strategy 2: Try Bearer token from Authorization headers
  const bearerToken = extractBearerTokenFromHeaders(bundle, targetDomain);
  if (bearerToken) {
    console.log('[HARToAuthWorker] Using Bearer token from Authorization header:', {
      sessionId,
      targetDomain,
      tokenLength: bearerToken.token.length,
      eventUrl: bearerToken.event?.url,
      hasRefreshEndpoint: !!bearerToken.refreshEndpoint,
      refreshEndpointUrl: bearerToken.refreshEndpoint?.url,
    });
    
    return createAuthWorkerFromBearerToken(
      sessionId,
      targetDomain,
      bearerToken.token,
      bearerToken.event,
      bearerToken.refreshEndpoint
    );
  }
  
  // Strategy 3: Try session cookies
  const sessionCookies = extractSessionCookies(bundle, targetDomain);
  if (sessionCookies && sessionCookies.cookies.length > 0) {
    console.log('[HARToAuthWorker] Using session cookies:', {
      sessionId,
      targetDomain,
      cookieCount: sessionCookies.cookies.length,
      cookieNames: sessionCookies.cookies.map(c => c.name),
    });
    
    return createAuthWorkerFromCookies(
      sessionId,
      targetDomain,
      sessionCookies.cookies,
      sessionCookies.event
    );
  }
  
  // Strategy 4: Try API keys
  const apiKey = extractAPIKeys(bundle, targetDomain);
  if (apiKey) {
    console.log('[HARToAuthWorker] Using API key:', {
      sessionId,
      targetDomain,
      headerName: apiKey.headerName,
    });
    
    return createAuthWorkerFromAPIKey(
      sessionId,
      targetDomain,
      apiKey.apiKey,
      apiKey.headerName,
      apiKey.event
    );
  }
  
  // No auth method found
  console.warn('[HARToAuthWorker] No authentication method found in HAR:', {
    availableEvents: bundle.events.length,
    targetDomain,
    authArtifacts: bundle.authArtifacts.length,
    cookies: bundle.cookieJar.timeline.length,
    bearerTokens: bundle.authArtifacts.filter(a => a.type === 'bearer_token').length,
    apiKeys: bundle.authArtifacts.filter(a => a.type === 'api_key').length,
  });
  
  return null;
}

/**
 * Create auth worker from OAuth token endpoint
 */
function createAuthWorkerFromOAuth(
  sessionId: string,
  targetDomain: string,
  tokenEndpoint: RequestEvent,
  tokenData: TokenData,
  credentials: OAuthCredentials
): PersistedAuthWorkerState {
  const extractedVars: Record<string, string> = {
    access_token: tokenData.access_token!,
    auth_method: 'oauth',
  };
  
  if (tokenData.refresh_token) {
    extractedVars.refresh_token = tokenData.refresh_token;
  }
  if (tokenData.id_token) {
    extractedVars.id_token = tokenData.id_token;
  }
  
  // Extract and store expiration info
  let expiresAt: number | undefined;
  if (tokenData.expires_in) {
    // expires_in can be seconds until expiration OR Unix timestamp
    // If it's > 1000000000, it's likely a Unix timestamp (seconds)
    // Otherwise, it's seconds until expiration
    if (tokenData.expires_in > 1000000000) {
      // Unix timestamp (seconds) - convert to milliseconds
      expiresAt = tokenData.expires_in * 1000;
    } else {
      // Seconds until expiration - add to current time
      expiresAt = Date.now() + (tokenData.expires_in * 1000);
    }
    extractedVars.expires_at = expiresAt.toString();
    extractedVars.expires_in = tokenData.expires_in.toString();
  } else if (tokenData.access_token) {
    // Try to extract expiration from JWT token
    try {
      const parts = tokenData.access_token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        if (payload.exp) {
          // JWT exp is in seconds, convert to milliseconds
          expiresAt = payload.exp * 1000;
          extractedVars.expires_at = expiresAt.toString();
        }
      }
    } catch (e) {
      // JWT parsing failed, ignore
    }
  }
  
  if (credentials.client_id) {
    extractedVars.client_id = credentials.client_id;
  } else if (credentials.clientId) {
    extractedVars.clientId = credentials.clientId;
  }
  
  if (credentials.client_secret) {
    extractedVars.client_secret = credentials.client_secret;
  } else if (credentials.clientSecret) {
    extractedVars.clientSecret = credentials.clientSecret;
  }
  
  if (credentials.scope) {
    extractedVars.scope = credentials.scope;
  }
  
  const refreshUrl = tokenEndpoint.url || `${tokenEndpoint.host}${tokenEndpoint.path}`;
  
  return createAuthWorkerState(
    sessionId,
    targetDomain,
    tokenEndpoint.path,
    tokenEndpoint.method,
    extractedVars,
    tokenEndpoint.responseBody?.parsed || tokenEndpoint.responseBody?.text,
    {
      refresh_url: refreshUrl,
      token_endpoint_host: tokenEndpoint.host,
    }
  );
}

/**
 * Create auth worker from Bearer token in headers
 */
function createAuthWorkerFromBearerToken(
  sessionId: string,
  targetDomain: string,
  token: string,
  event: RequestEvent | null,
  refreshEndpoint: RequestEvent | null
): PersistedAuthWorkerState {
  const extractedVars: Record<string, string> = {
    access_token: token,
    auth_method: 'bearer_header',
  };
  
  // Extract expiration from JWT token
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      if (payload.exp) {
        // JWT exp is in seconds, convert to milliseconds
        const expiresAt = payload.exp * 1000;
        extractedVars.expires_at = expiresAt.toString();
      }
    }
  } catch (e) {
    // JWT parsing failed, ignore
  }
  
  // Add refresh URL if found
  if (refreshEndpoint) {
    const refreshUrl = refreshEndpoint.url || `${refreshEndpoint.host}${refreshEndpoint.path}`;
    extractedVars.refresh_url = refreshUrl;
    extractedVars.token_endpoint_host = refreshEndpoint.host;
    console.log('[HARToAuthWorker] Found refresh endpoint:', refreshUrl);
  }
  
  // Use the event's endpoint as a placeholder (or a generic one)
  const endpoint = event?.path || '/api/auth';
  const method = event?.method || 'GET';
  
  return createAuthWorkerState(
    sessionId,
    targetDomain,
    endpoint,
    method,
    extractedVars,
    event?.responseBody?.parsed || event?.responseBody?.text,
    {
      token_source: 'authorization_header',
      token_event_url: event?.url || '',
    }
  );
}

/**
 * Create auth worker from session cookies
 */
function createAuthWorkerFromCookies(
  sessionId: string,
  targetDomain: string,
  cookies: Array<{ name: string; value: string }>,
  event: RequestEvent | null
): PersistedAuthWorkerState {
  const extractedVars: Record<string, string> = {
    auth_method: 'cookie',
  };
  
  // Store cookies as extracted vars
  for (const cookie of cookies) {
    extractedVars[`cookie_${cookie.name}`] = cookie.value;
  }
  
  const endpoint = event?.path || '/';
  const method = event?.method || 'GET';
  
  return createAuthWorkerState(
    sessionId,
    targetDomain,
    endpoint,
    method,
    extractedVars,
    event?.responseBody?.parsed || event?.responseBody?.text,
    {
      cookie_names: cookies.map(c => c.name).join(','),
      cookie_source: 'har_cookie_jar',
    }
  );
}

/**
 * Create auth worker from API key
 */
function createAuthWorkerFromAPIKey(
  sessionId: string,
  targetDomain: string,
  apiKey: string,
  headerName: string,
  event: RequestEvent | null
): PersistedAuthWorkerState {
  const extractedVars: Record<string, string> = {
    api_key: apiKey,
    api_key_header: headerName,
    auth_method: 'api_key',
  };
  
  const endpoint = event?.path || '/api';
  const method = event?.method || 'GET';
  
  return createAuthWorkerState(
    sessionId,
    targetDomain,
    endpoint,
    method,
    extractedVars,
    event?.responseBody?.parsed || event?.responseBody?.text,
    {
      api_key_source: 'request_header',
    }
  );
}

/**
 * Create the auth worker state structure
 */
function createAuthWorkerState(
  sessionId: string,
  targetDomain: string,
  endpoint: string,
  method: string,
  extractedVars: Record<string, string>,
  response: any,
  additionalVars: Record<string, string> = {}
): PersistedAuthWorkerState {
  const allExtractedVars = {
    ...extractedVars,
    ...additionalVars,
  };
  
  const lockedStep = {
    id: `har_${sessionId}`,
    stepNumber: 2,
    endpoint,
    method,
    code: '',
    response: response || {},
    extractedVars: allExtractedVars,
    dependencies: [],
    lockedAt: Date.now(),
    status: 'success' as const,
    verificationStatus: {
      tokenCaptured: true,
      tokenInjectionAttempted: false,
      tokenInjectionSucceeded: false,
      authenticatedRequestsDetected: false,
      authenticatedRequestCount: 0,
      verified: true,
      verifiedAt: Date.now(),
      authenticatedEndpoints: [],
      issues: [],
    },
  };

  return {
    version: '1.0.0',
    sessionId,
    targetDomain,
    stabilized: true,
    stabilizedAt: Date.now(),
    step2: {
      id: `har_${sessionId}`,
      endpoint,
      method,
      extractedVars: allExtractedVars,
      verificationStatus: {
        tokenCaptured: true,
        tokenInjectionAttempted: false,
        tokenInjectionSucceeded: false,
        authenticatedRequestsDetected: false,
        authenticatedRequestCount: 0,
        verified: true,
        verifiedAt: Date.now(),
        authenticatedEndpoints: [],
        issues: [],
      },
      response,
    },
    authenticatedEndpoints: [],
    lockedSteps: [lockedStep],
  };
}
