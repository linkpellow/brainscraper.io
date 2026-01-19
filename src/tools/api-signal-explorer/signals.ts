/**
 * Network Traffic Signal Classification Schema
 * 
 * "Rosetta Stone" for tagging network events with high-signal categories
 * to support API curation and endpoint analysis.
 * 
 * Works with events from Chromium (Playwright) or mitmproxy.
 */

export type CategoryTag =
  | "identity"        // Identity & Session Management
  | "endpoint"        // Requests & Endpoints
  | "headers"         // Headers & Client Context
  | "flow-control"    // State & Flow Control
  | "timing"          // Timing & Execution Order
  | "error"           // Error & Throttling Feedback
  | "protection"      // Protection Signals (passive detection)
  | "derived-meta";   // Derived Meta Signals

export type NetworkSignal = {
  method: string;
  url: string;
  headers: Record<string, string>;
  cookies: Record<string, string>;
  queryParams: Record<string, string>;
  postData: string | Record<string, string> | null;
  status: number;
  responseHeaders: Record<string, string>;
  responseBody?: string;
  timestamp: number;
  source: "browser" | "mobile";
  categoryTags: CategoryTag[];
  // Additional metadata
  redirectChain?: string[];
  duration?: number;
};

/**
 * Identity & Session Management Signals
 * 
 * Detects: Cookies, session tokens, access/refresh tokens, CSRF tokens
 */
function detectIdentitySignals(
  headers: Record<string, string>,
  cookies: Record<string, string>,
  postData: string | Record<string, string> | null,
  responseHeaders: Record<string, string>
): boolean {
  // Check for session cookies
  const sessionCookieNames = ['session', 'sessionid', 'sess', 'sid', 'jsessionid', 'phpsessid', 'aspsessionid'];
  const hasSessionCookie = Object.keys(cookies).some(name =>
    sessionCookieNames.some(pattern => name.toLowerCase().includes(pattern))
  );

  // Check for authorization headers
  const hasAuthHeader = !!(
    headers['authorization'] ||
    headers['x-auth-token'] ||
    headers['x-access-token'] ||
    headers['x-api-key']
  );

  // Check for CSRF tokens in headers
  const hasCsrfHeader = !!(
    headers['x-csrf-token'] ||
    headers['x-xsrf-token'] ||
    headers['csrf-token']
  );

  // Check for tokens in post data
  let hasTokenInBody = false;
  if (postData) {
    const bodyStr = typeof postData === 'string' ? postData : JSON.stringify(postData);
    const tokenPatterns = ['token', 'access_token', 'refresh_token', 'csrf', 'nonce'];
    hasTokenInBody = tokenPatterns.some(pattern => bodyStr.toLowerCase().includes(pattern));
  }

  // Check for Set-Cookie in response (session establishment)
  const hasSetCookie = !!(
    responseHeaders['set-cookie'] ||
    Object.keys(responseHeaders).some(key => key.toLowerCase() === 'set-cookie')
  );

  return hasSessionCookie || hasAuthHeader || hasCsrfHeader || hasTokenInBody || hasSetCookie;
}

/**
 * Requests & Endpoints Signals
 * 
 * Always present - this is the core endpoint definition
 */
function detectEndpointSignals(): boolean {
  return true; // All requests have endpoints
}

/**
 * Headers & Client Context Signals
 * 
 * Detects: Authorization, Content-Type, User-Agent, Origin, Referer
 */
function detectHeadersSignals(headers: Record<string, string>): boolean {
  const contextHeaders = [
    'authorization',
    'content-type',
    'user-agent',
    'origin',
    'referer',
    'referrer',
    'x-requested-with',
    'accept',
    'accept-language',
    'accept-encoding',
  ];

  return Object.keys(headers).some(key =>
    contextHeaders.some(context => key.toLowerCase() === context)
  );
}

/**
 * State & Flow Control Signals
 * 
 * Detects: Cursors, nonces, pagination tokens, flow identifiers
 */
function detectFlowControlSignals(
  queryParams: Record<string, string>,
  postData: string | Record<string, string> | null,
  headers: Record<string, string>,
  cookies: Record<string, string>
): boolean {
  // Check query parameters
  const flowControlQueryParams = [
    'cursor', 'page', 'offset', 'limit', 'next', 'prev',
    'token', 'nonce', 'state', 'flow', 'step', 'id',
    'continuation', 'marker', 'since', 'until'
  ];
  const hasFlowInQuery = Object.keys(queryParams).some(key =>
    flowControlQueryParams.some(pattern => key.toLowerCase().includes(pattern))
  );

  // Check post data
  let hasFlowInBody = false;
  if (postData) {
    const bodyStr = typeof postData === 'string' ? postData : JSON.stringify(postData);
    const flowPatterns = ['cursor', 'pagination', 'next', 'prev', 'continuation', 'token', 'nonce', 'state', 'flow'];
    hasFlowInBody = flowPatterns.some(pattern => bodyStr.toLowerCase().includes(pattern));
  }

  // Check headers
  const flowControlHeaders = ['x-pagination-token', 'x-continuation', 'x-cursor', 'x-next-page'];
  const hasFlowInHeaders = Object.keys(headers).some(key =>
    flowControlHeaders.some(pattern => key.toLowerCase().includes(pattern))
  );

  // Check cookies for flow state
  const flowCookieNames = ['state', 'flow', 'step', 'nonce'];
  const hasFlowInCookies = Object.keys(cookies).some(name =>
    flowCookieNames.some(pattern => name.toLowerCase().includes(pattern))
  );

  return hasFlowInQuery || hasFlowInBody || hasFlowInHeaders || hasFlowInCookies;
}

/**
 * Timing & Execution Order Signals
 * 
 * Always present - timestamps are always available
 */
function detectTimingSignals(): boolean {
  return true; // All events have timestamps
}

/**
 * Error & Throttling Feedback Signals
 * 
 * Detects: Status codes, rate-limit headers, retry-after headers
 */
function detectErrorSignals(
  status: number,
  responseHeaders: Record<string, string>
): boolean {
  // Error status codes
  const isErrorStatus = status >= 400;

  // Rate limiting headers
  const rateLimitHeaders = [
    'x-ratelimit-remaining',
    'x-ratelimit-limit',
    'x-ratelimit-reset',
    'retry-after',
    'x-rate-limit',
  ];
  const hasRateLimitHeader = Object.keys(responseHeaders).some(key =>
    rateLimitHeaders.some(pattern => key.toLowerCase().includes(pattern))
  );

  // Throttling indicators
  const throttlingStatuses = [429, 503, 509];
  const isThrottled = throttlingStatuses.includes(status);

  return isErrorStatus || hasRateLimitHeader || isThrottled;
}

/**
 * Protection Signals (Passive Detection)
 * 
 * Detects: Captcha tokens, fingerprint headers, challenge parameters
 */
function detectProtectionSignals(
  headers: Record<string, string>,
  postData: string | Record<string, string> | null,
  responseHeaders: Record<string, string>
): boolean {
  // Captcha-related
  const captchaPatterns = ['captcha', 'recaptcha', 'hcaptcha', 'turnstile', 'challenge'];
  
  // Check headers
  const hasCaptchaInHeaders = Object.keys(headers).some(key =>
    captchaPatterns.some(pattern => key.toLowerCase().includes(pattern))
  );

  // Check post data
  let hasCaptchaInBody = false;
  if (postData) {
    const bodyStr = typeof postData === 'string' ? postData : JSON.stringify(postData);
    hasCaptchaInBody = captchaPatterns.some(pattern => bodyStr.toLowerCase().includes(pattern));
  }

  // Check response headers
  const hasCaptchaInResponse = Object.keys(responseHeaders).some(key =>
    captchaPatterns.some(pattern => key.toLowerCase().includes(pattern))
  );

  // Fingerprint headers
  const fingerprintHeaders = [
    'x-fingerprint',
    'x-device-id',
    'x-browser-id',
    'x-client-fingerprint',
    'x-request-id',
  ];
  const hasFingerprint = Object.keys(headers).some(key =>
    fingerprintHeaders.some(pattern => key.toLowerCase().includes(pattern))
  );

  // Challenge parameters
  const challengePatterns = ['challenge', 'verify', 'validation', 'proof'];
  let hasChallenge = false;
  if (postData) {
    const bodyStr = typeof postData === 'string' ? postData : JSON.stringify(postData);
    hasChallenge = challengePatterns.some(pattern => bodyStr.toLowerCase().includes(pattern));
  }

  return hasCaptchaInHeaders || hasCaptchaInBody || hasCaptchaInResponse || hasFingerprint || hasChallenge;
}

/**
 * Classify a network event into signal categories
 */
export function classifyNetworkSignals(
  event: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
    queryParams?: Record<string, string>;
    postData?: string | Record<string, string> | null;
    status?: number;
    responseHeaders?: Record<string, string>;
    responseBody?: string;
    timestamp: number;
    source: "browser" | "mobile";
    redirectChain?: string[];
    duration?: number;
  }
): NetworkSignal {
  const headers = event.headers || {};
  const cookies = event.cookies || {};
  const queryParams = event.queryParams || {};
  const postData = event.postData || null;
  const responseHeaders = event.responseHeaders || {};
  const status = event.status || 0;

  const categoryTags: CategoryTag[] = [];

  // Core categories (always checked)
  if (detectIdentitySignals(headers, cookies, postData, responseHeaders)) {
    categoryTags.push('identity');
  }

  if (detectEndpointSignals()) {
    categoryTags.push('endpoint');
  }

  if (detectHeadersSignals(headers)) {
    categoryTags.push('headers');
  }

  if (detectFlowControlSignals(queryParams, postData, headers, cookies)) {
    categoryTags.push('flow-control');
  }

  if (detectTimingSignals()) {
    categoryTags.push('timing');
  }

  if (detectErrorSignals(status, responseHeaders)) {
    categoryTags.push('error');
  }

  if (detectProtectionSignals(headers, postData, responseHeaders)) {
    categoryTags.push('protection');
  }

  // Derived meta signals are added separately based on cross-event analysis
  // (not included in basic classification)

  return {
    method: event.method,
    url: event.url,
    headers,
    cookies,
    queryParams,
    postData,
    status,
    responseHeaders,
    responseBody: event.responseBody,
    timestamp: event.timestamp,
    source: event.source,
    categoryTags,
    redirectChain: event.redirectChain,
    duration: event.duration,
  };
}

/**
 * Convert RawNetworkEvent (from mitmproxy/Playwright) to NetworkSignal
 */
export function convertToNetworkSignal(
  event: {
    ts: number;
    method: string;
    url: string;
    path: string;
    host: string;
    status?: number;
    reqHeaders?: Record<string, string>;
    resHeaders?: Record<string, string>;
    reqCookies?: Record<string, string>;
    reqBodyText?: string;
    resBodyText?: string;
    query?: Record<string, string | string[]>;
    source: "mobile" | "browser";
    durationMs?: number;
  }
): NetworkSignal {
  // Parse URL to extract query parameters
  let queryParams: Record<string, string> = {};
  try {
    const urlObj = new URL(event.url);
    urlObj.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });
  } catch {
    // Fallback to provided query if URL parsing fails
    if (event.query) {
      for (const [key, value] of Object.entries(event.query)) {
        queryParams[key] = Array.isArray(value) ? value[0] : value;
      }
    }
  }

  // Parse post data
  let postData: string | Record<string, string> | null = null;
  if (event.reqBodyText) {
    try {
      // Try to parse as JSON
      const parsed = JSON.parse(event.reqBodyText);
      postData = parsed;
    } catch {
      // Keep as string if not JSON
      postData = event.reqBodyText;
    }
  }

  return classifyNetworkSignals({
    method: event.method,
    url: event.url,
    headers: event.reqHeaders || {},
    cookies: event.reqCookies || {},
    queryParams,
    postData,
    status: event.status,
    responseHeaders: event.resHeaders || {},
    responseBody: event.resBodyText,
    timestamp: event.ts,
    source: event.source,
    duration: event.durationMs,
  });
}

/**
 * Get human-readable description for a category tag
 */
export function getCategoryDescription(tag: CategoryTag): string {
  const descriptions: Record<CategoryTag, string> = {
    'identity': 'Identity & Session Management - Maintains session continuity via cookies, tokens, CSRF',
    'endpoint': 'Requests & Endpoints - Defines automation targets (method, URL, query, body)',
    'headers': 'Headers & Client Context - Provides valid client identity and metadata',
    'flow-control': 'State & Flow Control - Enables multi-step flows and pagination',
    'timing': 'Timing & Execution Order - Preserves request sequences and delays',
    'error': 'Error & Throttling Feedback - Enables adaptive automation logic',
    'protection': 'Protection Signals - Detects security mechanisms (passive)',
    'derived-meta': 'Derived Meta Signals - Inferred automation-relevant insights',
  };
  return descriptions[tag];
}

/**
 * Get category priority (for sorting/display)
 */
export function getCategoryPriority(tag: CategoryTag): number {
  const priorities: Record<CategoryTag, number> = {
    'identity': 1,
    'endpoint': 2,
    'headers': 3,
    'flow-control': 4,
    'timing': 5,
    'error': 6,
    'protection': 7,
    'derived-meta': 8,
  };
  return priorities[tag];
}
