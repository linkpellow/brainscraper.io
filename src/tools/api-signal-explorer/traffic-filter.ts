/**
 * Traffic Filter - Aggressive noise filtering and valuable signal extraction
 * 
 * @module traffic-filter
 * @description CRITICAL SYSTEM: Filters out junk and extracts valuable API calls.
 * This is the most important part of the system - if we miss signals in noise, everything fails.
 * 
 * @priority CRITICAL
 */

export type NetworkEvent = {
  ts: number;
  method: string;
  url: string;
  path: string;
  reqBodyText?: string;
  reqHeaders?: Record<string, string>;
  resBodyText?: string;
  status?: number;
  responseTime?: number;
  initiator?: string; // fetch, xhr, script, etc.
  requestType?: string; // XHR, fetch, websocket, etc.
};

export type FilteredEvent = NetworkEvent & {
  isValuable: boolean;
  noiseReasons: string[];
  signalScore: number; // 0-100 (higher = more valuable)
  category: 'valuable_api' | 'form_submission' | 'asset' | 'analytics' | 'cdn' | 'ads' | 'noise';
  extractedTokens?: ExtractedToken[];
  extractedVariables?: ExtractedVariable[];
};

export type ExtractedToken = {
  type: 'bearer' | 'jwt' | 'api_key' | 'session' | 'csrf' | 'oauth';
  location: 'header' | 'cookie' | 'body' | 'query';
  name: string;
  value: string;
  isExpired?: boolean;
  expiresAt?: number;
};

export type ExtractedVariable = {
  name: string;
  value: any;
  type: 'id' | 'timestamp' | 'uuid' | 'hash' | 'constant';
  pattern?: string; // Regex pattern if detected
  locations: Array<'url' | 'body' | 'header'>;
};

export type TrafficFilterResult = {
  valuableAPIs: FilteredEvent[];
  formSubmissions: FilteredEvent[];
  noise: FilteredEvent[];
  stats: {
    total: number;
    valuable: number;
    noise: number;
    noisePercentage: number;
    topNoiseReasons: Array<{ reason: string; count: number }>;
  };
  extractedTokens: ExtractedToken[];
  extractedVariables: ExtractedVariable[];
};

/**
 * NOISE BLACKLIST - Known junk domains and paths
 * These are NEVER valuable API calls
 */
const NOISE_DOMAINS = [
  // Analytics
  'google-analytics.com',
  'googletagmanager.com',
  'analytics.google.com',
  'doubleclick.net',
  'facebook.com/tr',
  'connect.facebook.net',
  'pixel.facebook.com',
  'mixpanel.com',
  'segment.com',
  'amplitude.com',
  'heap.io',
  'hotjar.com',
  'fullstory.com',
  'logrocket.com',
  'sentry.io',
  'bugsnag.com',
  'rollbar.com',
  
  // Ads
  'googlesyndication.com',
  'adservice.google.com',
  'pagead2.googlesyndication.com',
  'adnxs.com',
  'adsystem.com',
  'advertising.com',
  'doubleclick.com',
  
  // CDN (usually assets)
  'cloudflare.com',
  'akamai.net',
  'fastly.net',
  'cloudfront.net',
  
  // Social widgets
  'twitter.com/widgets',
  'platform.twitter.com',
  'linkedin.com/embed',
  'instagram.com/embed',
  
  // Other noise
  'newrelic.com',
  'nr-data.net',
  'pingdom.net',
  'datadoghq.com',
  'launchdarkly.com'
];

const NOISE_PATH_PATTERNS = [
  /\/analytics/i,
  /\/tracking/i,
  /\/pixel/i,
  /\/beacon/i,
  /\/collect/i,
  /\/log/i,
  /\/metric/i,
  /\/telemetry/i,
  /\/event/i,
  /\/impression/i,
  /\/click/i,
  /\/view/i,
  /\/heartbeat/i,
  /\/ping/i,
  /\/health/i,
  /\/status/i,
  /\/favicon\.ico/i,
  /\/robots\.txt/i,
  /\/sitemap\.xml/i,
  /\/_next\//i,  // Next.js internals
  /\/__webpack/i, // Webpack HMR
  /\/hot-update/i // HMR
];

/**
 * VALUABLE SIGNAL PATTERNS
 * These indicate high-value API calls
 */
const VALUABLE_PATTERNS = {
  paths: [
    /\/api\//i,
    /\/v\d+\//i,  // /v1/, /v2/, etc.
    /\/rest\//i,
    /\/graphql/i,
    /\/rpc/i,
    /\/service\//i,
    /\/endpoint/i,
    /\/data/i,
    /\/query/i,
    /\/mutation/i,
    /\/quote/i,    // User's specific case
    /\/calculate/i, // User's specific case
    /\/submit/i,
    /\/create/i,
    /\/update/i,
    /\/delete/i,
    /\/get/i,
    /\/fetch/i,
    /\/search/i,
    /\/login/i,
    /\/auth/i,
    /\/token/i
  ],
  contentTypes: [
    'application/json',
    'application/graphql',
    'application/x-protobuf',
    'application/grpc'
  ],
  methods: ['POST', 'PUT', 'PATCH', 'DELETE'] // Mutations are valuable
};

/**
 * Check if URL is from a noise domain
 */
function isNoiseDomain(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    return NOISE_DOMAINS.some(noiseDomain => 
      hostname.includes(noiseDomain.toLowerCase())
    );
  } catch {
    return false;
  }
}

/**
 * Check if path matches noise patterns
 */
function isNoisePath(path: string): boolean {
  return NOISE_PATH_PATTERNS.some(pattern => pattern.test(path));
}

/**
 * Calculate signal score (0-100)
 * Higher score = more valuable API call
 */
function calculateSignalScore(event: NetworkEvent): { score: number; reasons: string[] } {
  let score = 50; // Start neutral
  const reasons: string[] = [];

  const url = event.url.toLowerCase();
  const path = event.path.toLowerCase();
  const contentType = event.reqHeaders?.['content-type']?.toLowerCase() || '';
  const accept = event.reqHeaders?.['accept']?.toLowerCase() || '';

  // === POSITIVE SIGNALS (increase score) ===

  // Path matches valuable patterns
  for (const pattern of VALUABLE_PATTERNS.paths) {
    if (pattern.test(path)) {
      score += 15;
      reasons.push(`Path matches valuable pattern: ${pattern}`);
      break;
    }
  }

  // Content-Type is JSON/GraphQL
  if (contentType.includes('application/json')) {
    score += 20;
    reasons.push('JSON content-type');
  } else if (contentType.includes('application/graphql')) {
    score += 25;
    reasons.push('GraphQL content-type');
  }

  // Accepts JSON
  if (accept.includes('application/json')) {
    score += 15;
    reasons.push('Accepts JSON response');
  }

  // Mutation methods (POST, PUT, DELETE)
  if (VALUABLE_PATTERNS.methods.includes(event.method)) {
    score += 10;
    reasons.push(`Mutation method: ${event.method}`);
  }

  // Has authentication
  const hasAuth = event.reqHeaders?.['authorization'] || 
                  event.reqHeaders?.['x-api-key'] ||
                  event.reqHeaders?.['cookie'];
  if (hasAuth) {
    score += 15;
    reasons.push('Has authentication headers');
  }

  // Request/response bodies suggest data exchange
  if (event.reqBodyText && event.reqBodyText.length > 50) {
    score += 10;
    reasons.push('Has substantial request body');
  }

  if (event.resBodyText && event.resBodyText.length > 100) {
    try {
      JSON.parse(event.resBodyText);
      score += 10;
      reasons.push('Response is JSON data');
    } catch {
      // Not JSON
    }
  }

  // === NEGATIVE SIGNALS (decrease score) ===

  // Static asset extensions
  if (path.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|ico|webp|mp4|mp3|pdf|zip)$/)) {
    score -= 50;
    reasons.push('Static asset extension');
  }

  // Noise domain
  if (isNoiseDomain(url)) {
    score -= 40;
    reasons.push('Known noise domain (analytics/ads)');
  }

  // Noise path
  if (isNoisePath(path)) {
    score -= 30;
    reasons.push('Noise path pattern (tracking/logging)');
  }

  // GET requests with no query params (less valuable)
  if (event.method === 'GET' && !url.includes('?')) {
    score -= 5;
    reasons.push('Simple GET with no parameters');
  }

  // 404 / 5xx errors (likely broken)
  if (event.status && (event.status >= 400)) {
    score -= 20;
    reasons.push(`Error status: ${event.status}`);
  }

  // Very fast response (likely cached/trivial)
  if (event.responseTime && event.responseTime < 10) {
    score -= 5;
    reasons.push('Very fast response (cached?)');
  }

  // Cap score
  score = Math.max(0, Math.min(100, score));

  return { score, reasons };
}

/**
 * Categorize request based on signal score and characteristics
 */
function categorizeRequest(event: NetworkEvent, score: number): FilteredEvent['category'] {
  const path = event.path.toLowerCase();
  const contentType = event.reqHeaders?.['content-type']?.toLowerCase() || '';

  // Noise (score < 30)
  if (score < 30) {
    if (isNoiseDomain(event.url)) return 'analytics';
    if (path.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|ico|webp)$/)) return 'asset';
    if (isNoisePath(path)) return 'analytics';
    return 'noise';
  }

  // Form submission (score 30-60, specific characteristics)
  if (score >= 30 && score < 60) {
    if (contentType.includes('form-urlencoded') || contentType.includes('multipart/form-data')) {
      return 'form_submission';
    }
    if (path.match(/\.(aspx|php|jsp)$/)) {
      return 'form_submission';
    }
  }

  // Valuable API (score >= 60)
  if (score >= 60) {
    return 'valuable_api';
  }

  // Default
  return score >= 40 ? 'form_submission' : 'noise';
}

/**
 * Extract tokens from request
 * CRITICAL: Captures auth tokens, API keys, sessions, CSRF tokens
 */
function extractTokens(event: NetworkEvent): ExtractedToken[] {
  const tokens: ExtractedToken[] = [];

  // === HEADER TOKENS ===

  // Bearer tokens
  const authHeader = event.reqHeaders?.['authorization'];
  if (authHeader) {
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.substring(7);
      tokens.push({
        type: isJWT(token) ? 'jwt' : 'bearer',
        location: 'header',
        name: 'Authorization',
        value: token
      });
    } else if (authHeader.toLowerCase().startsWith('basic ')) {
      tokens.push({
        type: 'bearer', // Basic auth
        location: 'header',
        name: 'Authorization',
        value: authHeader.substring(6)
      });
    }
  }

  // API Keys in headers
  const apiKeyHeaders = ['x-api-key', 'api-key', 'apikey', 'x-auth-token', 'x-access-token'];
  apiKeyHeaders.forEach(headerName => {
    const value = event.reqHeaders?.[headerName.toLowerCase()];
    if (value) {
      tokens.push({
        type: 'api_key',
        location: 'header',
        name: headerName,
        value
      });
    }
  });

  // CSRF tokens
  const csrfHeaders = ['x-csrf-token', 'x-xsrf-token', 'csrf-token'];
  csrfHeaders.forEach(headerName => {
    const value = event.reqHeaders?.[headerName.toLowerCase()];
    if (value) {
      tokens.push({
        type: 'csrf',
        location: 'header',
        name: headerName,
        value
      });
    }
  });

  // === COOKIE TOKENS ===

  const cookieHeader = event.reqHeaders?.['cookie'];
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map(c => c.trim());
    
    cookies.forEach(cookie => {
      const [name, value] = cookie.split('=');
      if (!name || !value) return;

      const nameLower = name.toLowerCase();

      // Session cookies
      if (nameLower.includes('session') || 
          nameLower.includes('sess') ||
          nameLower.includes('sid') ||
          nameLower === 'asp.net_sessionid' ||
          nameLower === 'phpsessid' ||
          nameLower === 'jsessionid') {
        tokens.push({
          type: 'session',
          location: 'cookie',
          name,
          value
        });
      }

      // Auth cookies
      if (nameLower.includes('auth') || 
          nameLower.includes('token') ||
          nameLower.includes('jwt') ||
          nameLower.includes('access')) {
        tokens.push({
          type: isJWT(value) ? 'jwt' : 'bearer',
          location: 'cookie',
          name,
          value
        });
      }

      // OAuth cookies
      if (nameLower.includes('oauth') || nameLower.includes('access_token')) {
        tokens.push({
          type: 'oauth',
          location: 'cookie',
          name,
          value
        });
      }
    });
  }

  // === BODY TOKENS ===

  if (event.reqBodyText) {
    try {
      const body = JSON.parse(event.reqBodyText);
      
      // Look for token fields
      const tokenFields = ['token', 'access_token', 'api_key', 'apiKey', 'auth_token', 'bearer', 'jwt'];
      tokenFields.forEach(field => {
        if (body[field]) {
          tokens.push({
            type: field.includes('jwt') || isJWT(body[field]) ? 'jwt' : 'api_key',
            location: 'body',
            name: field,
            value: body[field]
          });
        }
      });

      // CSRF in body
      const csrfFields = ['csrf_token', 'csrfToken', '_csrf', 'csrf'];
      csrfFields.forEach(field => {
        if (body[field]) {
          tokens.push({
            type: 'csrf',
            location: 'body',
            name: field,
            value: body[field]
          });
        }
      });

    } catch {
      // Not JSON - check form data
      if (event.reqBodyText.includes('=')) {
        const pairs = event.reqBodyText.split('&');
        pairs.forEach(pair => {
          const [name, value] = pair.split('=');
          if (!name || !value) return;

          const nameLower = name.toLowerCase();
          if (nameLower.includes('token') || nameLower.includes('csrf') || nameLower.includes('auth')) {
            tokens.push({
              type: 'csrf',
              location: 'body',
              name: decodeURIComponent(name),
              value: decodeURIComponent(value)
            });
          }
        });
      }
    }
  }

  // === QUERY TOKENS ===

  try {
    const urlObj = new URL(event.url);
    const tokenParams = ['token', 'access_token', 'api_key', 'apiKey', 'auth'];
    
    tokenParams.forEach(param => {
      const value = urlObj.searchParams.get(param);
      if (value) {
        tokens.push({
          type: 'api_key',
          location: 'query',
          name: param,
          value
        });
      }
    });
  } catch {
    // Invalid URL
  }

  return tokens;
}

/**
 * Check if string is a JWT token
 */
function isJWT(str: string): boolean {
  const jwtPattern = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
  return jwtPattern.test(str);
}

/**
 * Extract dynamic variables from request
 * CRITICAL: Identifies IDs, UUIDs, timestamps that need to be parameterized
 */
function extractVariables(event: NetworkEvent): ExtractedVariable[] {
  const variables: ExtractedVariable[] = [];
  const seen = new Set<string>();

  // === URL VARIABLES ===

  // Extract path segments that look like IDs
  const pathSegments = event.path.split('/').filter(s => s);
  pathSegments.forEach(segment => {
    if (seen.has(segment)) return;

    // UUID pattern
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
      variables.push({
        name: 'uuid',
        value: segment,
        type: 'uuid',
        pattern: '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
        locations: ['url']
      });
      seen.add(segment);
    }
    // Numeric ID
    else if (/^\d+$/.test(segment) && segment.length > 3) {
      variables.push({
        name: 'id',
        value: segment,
        type: 'id',
        pattern: '\\d+',
        locations: ['url']
      });
      seen.add(segment);
    }
    // Hash (alphanumeric, 20+ chars)
    else if (/^[a-z0-9]{20,}$/i.test(segment)) {
      variables.push({
        name: 'hash',
        value: segment,
        type: 'hash',
        pattern: '[a-z0-9]{20,}',
        locations: ['url']
      });
      seen.add(segment);
    }
  });

  // === QUERY PARAMETERS ===

  try {
    const urlObj = new URL(event.url);
    urlObj.searchParams.forEach((value, name) => {
      if (seen.has(value)) return;

      const nameLower = name.toLowerCase();

      // ID parameters
      if (nameLower.includes('id') && /^\d+$/.test(value)) {
        variables.push({
          name: name,
          value: value,
          type: 'id',
          locations: ['url']
        });
        seen.add(value);
      }

      // Timestamp parameters
      if ((nameLower.includes('time') || nameLower.includes('date') || nameLower === 'ts') && 
          /^\d{10,13}$/.test(value)) {
        variables.push({
          name: name,
          value: value,
          type: 'timestamp',
          locations: ['url']
        });
        seen.add(value);
      }

      // UUID parameters
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        variables.push({
          name: name,
          value: value,
          type: 'uuid',
          locations: ['url']
        });
        seen.add(value);
      }
    });
  } catch {
    // Invalid URL
  }

  // === BODY VARIABLES ===

  if (event.reqBodyText) {
    try {
      const body = JSON.parse(event.reqBodyText);
      extractVariablesFromObject(body, variables, seen, 'body');
    } catch {
      // Not JSON
    }
  }

  return variables;
}

/**
 * Recursively extract variables from object
 */
function extractVariablesFromObject(
  obj: any, 
  variables: ExtractedVariable[], 
  seen: Set<string>, 
  location: 'body' | 'url' | 'header',
  prefix = ''
): void {
  if (typeof obj !== 'object' || obj === null) return;

  Object.entries(obj).forEach(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string' || typeof value === 'number') {
      const strValue = String(value);
      if (seen.has(strValue)) return;

      const keyLower = key.toLowerCase();

      // ID fields
      if (keyLower.includes('id') && /^\d+$/.test(strValue)) {
        variables.push({
          name: fullKey,
          value: value,
          type: 'id',
          locations: [location]
        });
        seen.add(strValue);
      }

      // Timestamp fields
      if ((keyLower.includes('time') || keyLower.includes('date') || keyLower === 'ts') && 
          /^\d{10,13}$/.test(strValue)) {
        variables.push({
          name: fullKey,
          value: value,
          type: 'timestamp',
          locations: [location]
        });
        seen.add(strValue);
      }

      // UUID fields
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(strValue)) {
        variables.push({
          name: fullKey,
          value: value,
          type: 'uuid',
          locations: [location]
        });
        seen.add(strValue);
      }
    } else if (typeof value === 'object') {
      // Recurse
      extractVariablesFromObject(value, variables, seen, location, fullKey);
    }
  });
}

/**
 * MAIN FUNCTION: Filter network traffic
 * Separates valuable API calls from noise
 * 
 * @param events - All captured network events
 * @returns Filtered events with valuable APIs separated from noise
 */
export function filterNetworkTraffic(events: NetworkEvent[]): TrafficFilterResult {
  const valuableAPIs: FilteredEvent[] = [];
  const formSubmissions: FilteredEvent[] = [];
  const noise: FilteredEvent[] = [];
  const allTokens: ExtractedToken[] = [];
  const allVariables: ExtractedVariable[] = [];

  // Process each event
  events.forEach(event => {
    const { score, reasons } = calculateSignalScore(event);
    const category = categorizeRequest(event, score);
    const isValuable = category === 'valuable_api' || category === 'form_submission';

    // Extract tokens and variables from valuable events
    let extractedTokens: ExtractedToken[] = [];
    let extractedVariables: ExtractedVariable[] = [];
    
    if (isValuable) {
      extractedTokens = extractTokens(event);
      extractedVariables = extractVariables(event);
      
      allTokens.push(...extractedTokens);
      allVariables.push(...extractedVariables);
    }

    const filteredEvent: FilteredEvent = {
      ...event,
      isValuable,
      noiseReasons: reasons,
      signalScore: score,
      category,
      extractedTokens: extractedTokens.length > 0 ? extractedTokens : undefined,
      extractedVariables: extractedVariables.length > 0 ? extractedVariables : undefined
    };

    // Bucket by category
    if (category === 'valuable_api') {
      valuableAPIs.push(filteredEvent);
    } else if (category === 'form_submission') {
      formSubmissions.push(filteredEvent);
    } else {
      noise.push(filteredEvent);
    }
  });

  // Sort by signal score (highest first)
  valuableAPIs.sort((a, b) => b.signalScore - a.signalScore);
  formSubmissions.sort((a, b) => b.signalScore - a.signalScore);

  // Calculate stats
  const noiseCount = noise.length;
  const noiseReasonCounts = new Map<string, number>();
  
  noise.forEach(n => {
    n.noiseReasons.forEach(reason => {
      noiseReasonCounts.set(reason, (noiseReasonCounts.get(reason) || 0) + 1);
    });
  });

  const topNoiseReasons = Array.from(noiseReasonCounts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Deduplicate tokens
  const uniqueTokens = deduplicateTokens(allTokens);

  return {
    valuableAPIs,
    formSubmissions,
    noise,
    stats: {
      total: events.length,
      valuable: valuableAPIs.length + formSubmissions.length,
      noise: noiseCount,
      noisePercentage: Math.round((noiseCount / events.length) * 100),
      topNoiseReasons
    },
    extractedTokens: uniqueTokens,
    extractedVariables: allVariables
  };
}

/**
 * Deduplicate tokens (keep first occurrence)
 */
function deduplicateTokens(tokens: ExtractedToken[]): ExtractedToken[] {
  const seen = new Set<string>();
  const unique: ExtractedToken[] = [];

  tokens.forEach(token => {
    const key = `${token.type}:${token.name}:${token.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(token);
    }
  });

  return unique;
}
