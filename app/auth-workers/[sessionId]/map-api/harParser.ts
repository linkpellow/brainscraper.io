/**
 * HAR Parser
 * 
 * Converts HAR file into normalized RequestEvent stream
 */

import type { RequestEvent, CookieRecord } from './types';

/**
 * HAR file structure (partial, only what we need)
 */
type HAR = {
  log: {
    entries: Array<{
      startedDateTime: string;
      pageref?: string;
      request: {
        method: string;
        url: string;
        httpVersion: string;
        headers: Array<{ name: string; value: string }>;
        cookies: Array<{
          name: string;
          value: string;
          domain?: string;
          path?: string;
          expires?: string;
          httpOnly?: boolean;
          secure?: boolean;
          sameSite?: string;
        }>;
        postData?: {
          mimeType?: string;
          text?: string;
        };
        queryString?: Array<{ name: string; value: string }>;
      };
      response: {
        status: number;
        statusText: string;
        httpVersion: string;
        headers: Array<{ name: string; value: string }>;
        content: {
          mimeType?: string;
          size: number;
          text?: string;
        };
      };
      timings: {
        wait: number;
        receive: number;
      };
    }>;
    pages?: Array<{
      id: string;
      title: string;
      startedDateTime: string;
    }>;
  };
};

/**
 * Parse Set-Cookie header value into CookieRecord
 */
function parseSetCookie(setCookieValue: string, domain?: string, path?: string): CookieRecord | null {
  const parts = setCookieValue.split(';').map(p => p.trim());
  if (parts.length === 0) return null;
  
  const [nameValue, ...attributes] = parts;
  const [name, value] = nameValue.split('=');
  
  if (!name) return null;
  
  const cookie: CookieRecord = {
    name: name.trim(),
    value: value || '',
    domain,
    path: path || '/',
  };
  
  // Parse attributes
  for (const attr of attributes) {
    const [key, val] = attr.split('=').map(s => s.trim());
    const keyLower = key.toLowerCase();
    
    if (keyLower === 'domain' && val) {
      cookie.domain = val;
    } else if (keyLower === 'path' && val) {
      cookie.path = val;
    } else if (keyLower === 'expires' && val) {
      const expires = new Date(val).getTime();
      if (!isNaN(expires)) {
        cookie.expires = expires;
      }
    } else if (keyLower === 'max-age' && val) {
      const maxAge = parseInt(val, 10);
      if (!isNaN(maxAge)) {
        cookie.maxAge = maxAge;
      }
    } else if (keyLower === 'secure') {
      cookie.secure = true;
    } else if (keyLower === 'httponly') {
      cookie.httpOnly = true;
    } else if (keyLower === 'samesite' && val) {
      cookie.sameSite = val as 'Strict' | 'Lax' | 'None';
    }
  }
  
  return cookie;
}

/**
 * Extract cookies from Set-Cookie headers in response
 */
function extractResponseCookies(
  headers: Array<{ name: string; value: string }>,
  url: string
): CookieRecord[] {
  const cookies: CookieRecord[] = [];
  const urlObj = new URL(url);
  
  for (const header of headers) {
    if (header.name.toLowerCase() === 'set-cookie') {
      const cookie = parseSetCookie(header.value, urlObj.hostname, urlObj.pathname);
      if (cookie) {
        cookies.push(cookie);
      }
    }
  }
  
  return cookies;
}

/**
 * Parse request cookies from HAR entry (request.cookies array)
 */
function parseRequestCookies(
  cookies: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
  }>
): CookieRecord[] {
  return cookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    expires: c.expires ? new Date(c.expires).getTime() : undefined,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite as 'Strict' | 'Lax' | 'None' | undefined,
  }));
}

/**
 * Parse Cookie header string (e.g. "name=value; name2=value2") into CookieRecord[].
 * Many HAR exports put cookies only in the Cookie header, not in request.cookies.
 */
function parseCookieHeader(cookieHeader: string, host?: string): CookieRecord[] {
  if (!cookieHeader || typeof cookieHeader !== 'string') return [];
  const cookies: CookieRecord[] = [];
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (name && value) {
      cookies.push({
        name,
        value,
        domain: host,
        path: '/',
      });
    }
  }
  return cookies;
}

/**
 * Normalize headers to lowercase map
 */
function normalizeHeaders(headers: Array<{ name: string; value: string }>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const header of headers) {
    const key = header.name.toLowerCase();
    // If duplicate, concatenate with comma (HTTP spec)
    if (normalized[key]) {
      normalized[key] += `, ${header.value}`;
    } else {
      normalized[key] = header.value;
    }
  }
  return normalized;
}

/**
 * Parse query string into object
 */
function parseQueryString(queryString?: Array<{ name: string; value: string }>): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  if (!queryString) return query;
  
  for (const param of queryString) {
    const key = param.name;
    const value = param.value;
    
    if (query[key]) {
      // Multiple values for same key
      const existing = query[key];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        query[key] = [existing, value];
      }
    } else {
      query[key] = value;
    }
  }
  
  return query;
}

/**
 * Try to parse JSON from text
 */
function tryParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Parse HAR file into normalized RequestEvent stream
 */
export function parseHAR(harContent: string | HAR): RequestEvent[] {
  let har: HAR;
  
  if (typeof harContent === 'string') {
    har = JSON.parse(harContent);
  } else {
    har = harContent;
  }
  
  if (!har.log || !har.log.entries) {
    throw new Error('Invalid HAR file: missing log.entries');
  }
  
  const events: RequestEvent[] = [];
  
  for (let i = 0; i < har.log.entries.length; i++) {
    const entry = har.log.entries[i];
    const eventId = `event_${i}_${Date.now()}`;
    
    try {
      const url = new URL(entry.request.url);
      const requestHeaders = normalizeHeaders(entry.request.headers);
      const responseHeaders = normalizeHeaders(entry.response.headers);
      
      // Determine derived flags
      const isPreflight = entry.request.method === 'OPTIONS';
      const contentType = responseHeaders['content-type'] || '';
      const isJson = contentType.includes('application/json') || contentType.includes('application/vnd.api+json');
      const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(entry.request.method);
      
      // Parse request body
      let requestBody: RequestEvent['requestBody'] | undefined;
      if (entry.request.postData) {
        requestBody = {
          mimeType: entry.request.postData.mimeType,
          text: entry.request.postData.text,
        };
        
        // Try to parse as JSON
        if (entry.request.postData.text && entry.request.postData.mimeType?.includes('json')) {
          requestBody.parsed = tryParseJson(entry.request.postData.text);
        }
      }
      
      // Extract response cookies
      const responseCookies = extractResponseCookies(entry.response.headers, entry.request.url);
      
      // Parse request cookies: use request.cookies array if present, else parse Cookie header
      let requestCookies = parseRequestCookies(entry.request.cookies || []);
      if (requestCookies.length === 0) {
        const cookieHeader = (entry.request.headers || []).find(
          (h: { name: string }) => h.name.toLowerCase() === 'cookie'
        )?.value;
      if (cookieHeader) {
        try {
          const reqUrl = new URL(entry.request.url);
          requestCookies = parseCookieHeader(cookieHeader, reqUrl.hostname);
        } catch {
          requestCookies = parseCookieHeader(cookieHeader);
        }
      }
      }
      
      // Parse query string
      const query = parseQueryString(entry.request.queryString);
      
      // Parse response body
      let responseBody: RequestEvent['responseBody'] | undefined;
      if (entry.response.content.text) {
        responseBody = {
          text: entry.response.content.text,
        };
        
        // Try to parse as JSON
        if (isJson && entry.response.content.text) {
          responseBody.parsed = tryParseJson(entry.response.content.text);
        }
      }
      
      const event: RequestEvent = {
        id: eventId,
        startedDateTime: entry.startedDateTime,
        pageref: entry.pageref,
        method: entry.request.method,
        url: entry.request.url,
        host: url.hostname,
        path: url.pathname,
        query,
        httpVersion: entry.request.httpVersion,
        requestHeaders,
        requestCookies,
        requestBody,
        status: entry.response.status,
        statusText: entry.response.statusText,
        responseHeaders,
        contentType: entry.response.content.mimeType,
        size: entry.response.content.size,
        responseBody,
        responseCookies,
        wait: entry.timings.wait || 0,
        receive: entry.timings.receive || 0,
        isPreflight,
        isJson,
        isMutation,
        isFirstParty: false, // Will be set later by first-party host identifier
      };
      
      events.push(event);
    } catch (error) {
      console.error(`[HARParser] Failed to parse entry ${i}:`, error);
      // Continue with next entry
    }
  }
  
  return events;
}
