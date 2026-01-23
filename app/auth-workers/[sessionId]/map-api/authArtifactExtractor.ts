/**
 * Auth Artifact Extractor
 * 
 * Extracts authentication tokens, headers, and artifacts from requests/responses
 */

import type { RequestEvent, AuthArtifact } from './types';

/**
 * Token key patterns to look for in JSON responses
 */
const TOKEN_KEY_PATTERNS = [
  /^access[_-]?token$/i,
  /^refresh[_-]?token$/i,
  /^id[_-]?token$/i,
  /^token$/i,
  /^bearer[_-]?token$/i,
  /^auth[_-]?token$/i,
  /^session[_-]?token$/i,
];

/**
 * Token expiration key patterns
 */
const EXPIRY_KEY_PATTERNS = [
  /^expires[_-]?in$/i,
  /^expires[_-]?at$/i,
  /^exp$/i,
  /^expiration$/i,
];

/**
 * Extract auth artifacts from events
 */
export function extractAuthArtifacts(events: RequestEvent[]): AuthArtifact[] {
  const artifacts: AuthArtifact[] = [];
  const artifactMap = new Map<string, AuthArtifact>();
  
  for (const event of events) {
    // 1. Extract from request headers
    extractFromRequestHeaders(event, artifacts, artifactMap);
    
    // 2. Extract from response headers
    extractFromResponseHeaders(event, artifacts, artifactMap);
    
    // 3. Extract from request body (JSON)
    extractFromRequestBody(event, artifacts, artifactMap);
    
    // 4. Extract from response body (JSON)
    extractFromResponseBody(event, artifacts, artifactMap);
    
    // 5. Extract from cookies (session/auth cookies)
    extractFromCookies(event, artifacts, artifactMap);
  }
  
  return artifacts;
}

/**
 * Extract auth artifacts from request headers
 */
function extractFromRequestHeaders(
  event: RequestEvent,
  artifacts: AuthArtifact[],
  artifactMap: Map<string, AuthArtifact>
) {
  const headers = event.requestHeaders;
  
  // Authorization header
  if (headers.authorization) {
    const authHeader = headers.authorization;
    let type: AuthArtifact['type'] = 'bearer_token';
    let value = authHeader;
    
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      value = authHeader.substring(7);
      type = 'bearer_token';
    } else if (authHeader.toLowerCase().startsWith('basic ')) {
      value = authHeader.substring(6);
      type = 'basic_auth';
    }
    
    const key = `request_header:authorization:${event.id}`;
    if (!artifactMap.has(key)) {
      const artifact: AuthArtifact = {
        type,
        name: 'Authorization',
        value,
        location: 'request_header',
        firstSeenAtEventId: event.id,
        createdByUrl: 'unknown', // Will be updated if found in response
        usedInEventIds: [event.id],
      };
      artifacts.push(artifact);
      artifactMap.set(key, artifact);
    } else {
      const artifact = artifactMap.get(key)!;
      if (!artifact.usedInEventIds.includes(event.id)) {
        artifact.usedInEventIds.push(event.id);
      }
    }
  }
  
  // CSRF tokens
  const csrfHeaders = ['x-csrf-token', 'x-xsrf-token', 'csrf-token', 'xsrf-token'];
  for (const headerName of csrfHeaders) {
    if (headers[headerName]) {
      const key = `request_header:${headerName}:${event.id}`;
      if (!artifactMap.has(key)) {
        const artifact: AuthArtifact = {
          type: 'csrf_token',
          name: headerName,
          value: headers[headerName],
          location: 'request_header',
          firstSeenAtEventId: event.id,
          createdByUrl: 'unknown',
          usedInEventIds: [event.id],
        };
        artifacts.push(artifact);
        artifactMap.set(key, artifact);
      }
    }
  }
  
  // API keys and other token headers
  const tokenHeaderPatterns = [
    /^x-api-key$/i,
    /^x-auth-token$/i,
    /^x-access-token$/i,
    /^x-.*token$/i,
  ];
  
  for (const [headerName, headerValue] of Object.entries(headers)) {
    for (const pattern of tokenHeaderPatterns) {
      if (pattern.test(headerName)) {
        const key = `request_header:${headerName}:${event.id}`;
        if (!artifactMap.has(key)) {
          const artifact: AuthArtifact = {
            type: 'api_key',
            name: headerName,
            value: headerValue,
            location: 'request_header',
            firstSeenAtEventId: event.id,
            createdByUrl: 'unknown',
            usedInEventIds: [event.id],
          };
          artifacts.push(artifact);
          artifactMap.set(key, artifact);
        }
        break;
      }
    }
  }
}

/**
 * Extract auth artifacts from response headers
 */
function extractFromResponseHeaders(
  event: RequestEvent,
  artifacts: AuthArtifact[],
  artifactMap: Map<string, AuthArtifact>
) {
  const headers = event.responseHeaders;
  
  // WWW-Authenticate header
  if (headers['www-authenticate']) {
    const key = `response_header:www-authenticate:${event.id}`;
    if (!artifactMap.has(key)) {
      const artifact: AuthArtifact = {
        type: 'bearer_token',
        name: 'WWW-Authenticate',
        value: headers['www-authenticate'],
        location: 'response_header',
        firstSeenAtEventId: event.id,
        createdByUrl: event.url,
        usedInEventIds: [],
      };
      artifacts.push(artifact);
      artifactMap.set(key, artifact);
    }
  }
  
  // Authorization header in response (some APIs return updated tokens)
  if (headers.authorization) {
    const key = `response_header:authorization:${event.id}`;
    if (!artifactMap.has(key)) {
      const artifact: AuthArtifact = {
        type: 'bearer_token',
        name: 'Authorization',
        value: headers.authorization,
        location: 'response_header',
        firstSeenAtEventId: event.id,
        createdByUrl: event.url,
        usedInEventIds: [],
      };
      artifacts.push(artifact);
      artifactMap.set(key, artifact);
    }
  }
}

/**
 * Extract auth artifacts from request body (JSON)
 */
function extractFromRequestBody(
  event: RequestEvent,
  artifacts: AuthArtifact[],
  artifactMap: Map<string, AuthArtifact>
) {
  if (!event.requestBody?.parsed || typeof event.requestBody.parsed !== 'object') {
    return;
  }
  
  const body = event.requestBody.parsed;
  extractTokensFromObject(body, event, 'request_body', artifacts, artifactMap);
}

/**
 * Extract auth artifacts from response body (JSON)
 */
function extractFromResponseBody(
  event: RequestEvent,
  artifacts: AuthArtifact[],
  artifactMap: Map<string, AuthArtifact>
) {
  if (!event.responseBody?.parsed || typeof event.responseBody.parsed !== 'object') {
    return;
  }
  
  const body = event.responseBody.parsed;
  extractTokensFromObject(body, event, 'response_body', artifacts, artifactMap);
}

/**
 * Extract tokens from JSON object recursively
 */
function extractTokensFromObject(
  obj: any,
  event: RequestEvent,
  location: 'request_body' | 'response_body',
  artifacts: AuthArtifact[],
  artifactMap: Map<string, AuthArtifact>,
  path: string = ''
) {
  if (typeof obj !== 'object' || obj === null) {
    return;
  }
  
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = path ? `${path}.${key}` : key;
    
    // Check if key matches token patterns
    let tokenType: AuthArtifact['type'] | null = null;
    let artifactName = key;
    
    if (TOKEN_KEY_PATTERNS.some(pattern => pattern.test(key))) {
      if (/refresh/i.test(key)) {
        tokenType = 'refresh_token';
      } else if (/id[_-]?token/i.test(key)) {
        tokenType = 'id_token';
      } else if (/access/i.test(key) || /bearer/i.test(key)) {
        tokenType = 'bearer_token';
      } else {
        tokenType = 'bearer_token';
      }
    }
    
    if (tokenType && typeof value === 'string' && value.length > 10) {
      // Found a token
      const mapKey = `${location}:${fullPath}:${event.id}`;
      if (!artifactMap.has(mapKey)) {
        const artifact: AuthArtifact = {
          type: tokenType,
          name: artifactName,
          value: value,
          location,
          firstSeenAtEventId: event.id,
          createdByUrl: event.url,
          usedInEventIds: [],
        };
        
        // Look for expiration info in same object
        if (typeof obj === 'object') {
          for (const [expKey, expValue] of Object.entries(obj)) {
            if (EXPIRY_KEY_PATTERNS.some(pattern => pattern.test(expKey))) {
              if (typeof expValue === 'number') {
                if (/expires[_-]?in/i.test(expKey)) {
                  artifact.expiresIn = expValue;
                } else if (/exp$/i.test(expKey) || /expires[_-]?at/i.test(expKey)) {
                  artifact.expiresAt = typeof expValue === 'number' && expValue > 1000000000000 
                    ? expValue 
                    : expValue * 1000; // Convert seconds to ms if needed
                }
              }
            }
          }
        }
        
        artifacts.push(artifact);
        artifactMap.set(mapKey, artifact);
      }
    }
    
    // Recurse into nested objects
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      extractTokensFromObject(value, event, location, artifacts, artifactMap, fullPath);
    }
  }
}

/**
 * Extract auth artifacts from cookies
 */
function extractFromCookies(
  event: RequestEvent,
  artifacts: AuthArtifact[],
  artifactMap: Map<string, AuthArtifact>
) {
  // Check response cookies (Set-Cookie) for session/auth cookies
  for (const cookie of event.responseCookies) {
    const cookieName = cookie.name.toLowerCase();
    
    // Common session/auth cookie names
    if (
      cookieName.includes('session') ||
      cookieName.includes('auth') ||
      cookieName.includes('token') ||
      cookieName.includes('jwt') ||
      cookieName === 'sid' ||
      cookieName === 'jsessionid'
    ) {
      const key = `cookie:${cookie.name}:${event.id}`;
      if (!artifactMap.has(key)) {
        const artifact: AuthArtifact = {
          type: cookieName.includes('session') ? 'session_token' : 'cookie_auth',
          name: cookie.name,
          value: cookie.value,
          location: 'cookie',
          firstSeenAtEventId: event.id,
          createdByUrl: event.url,
          usedInEventIds: [],
          metadata: {
            domain: cookie.domain,
            path: cookie.path,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            expires: cookie.expires,
          },
        };
        artifacts.push(artifact);
        artifactMap.set(key, artifact);
      }
    }
  }
}
