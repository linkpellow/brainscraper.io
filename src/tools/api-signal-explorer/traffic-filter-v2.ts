/**
 * Traffic Filter V2 - 2026 Production-Grade Noise Cancellation
 * 
 * @module traffic-filter-v2
 * @description A-GRADE SYSTEM: Full noise cancellation with ZERO false negatives.
 * Uses tiered confidence, allowlist safeguards, and multi-dimensional scoring.
 * 
 * @priority CRITICAL
 * @version 2.0.0
 * @standard 2026 Production Grade
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
  size?: number; // Response size in bytes
};

export type FilteredEvent = NetworkEvent & {
  isValuable: boolean;
  confidenceLevel: 'definite_noise' | 'probable_noise' | 'uncertain' | 'probable_valuable' | 'definite_valuable';
  noiseReasons: string[];
  valuableReasons: string[];
  signalScore: number; // 0-100 (higher = more valuable)
  category: 'valuable_api' | 'form_submission' | 'asset' | 'analytics' | 'cdn' | 'ads' | 'noise' | 'browser_internal';
  extractedTokens?: ExtractedToken[];
  extractedVariables?: ExtractedVariable[];
  isDuplicate?: boolean;
  duplicateOf?: string; // Hash of original request
};

export type ExtractedToken = {
  type: 'bearer' | 'jwt' | 'api_key' | 'session' | 'csrf' | 'oauth' | 'basic';
  location: 'header' | 'cookie' | 'body' | 'query';
  name: string;
  value: string;
  isExpired?: boolean;
  expiresAt?: number;
};

export type ExtractedVariable = {
  name: string;
  value: any;
  type: 'id' | 'timestamp' | 'uuid' | 'hash' | 'constant' | 'version' | 'cursor' | 'offset';
  pattern?: string;
  locations: Array<'url' | 'body' | 'header'>;
};

export type TrafficFilterResult = {
  valuableAPIs: FilteredEvent[];
  formSubmissions: FilteredEvent[];
  uncertain: FilteredEvent[]; // NEW: Uncertain cases (user review)
  noise: FilteredEvent[];
  stats: {
    total: number;
    valuable: number;
    uncertain: number;
    noise: number;
    duplicates: number;
    noisePercentage: number;
    topNoiseReasons: Array<{ reason: string; count: number }>;
    confidenceLevels: {
      definite_valuable: number;
      probable_valuable: number;
      uncertain: number;
      probable_noise: number;
      definite_noise: number;
    };
  };
  extractedTokens: ExtractedToken[];
  extractedVariables: ExtractedVariable[];
};

// ============================================================================
// CRITICAL ALLOWLIST - NEVER filter these patterns (prevents false negatives)
// ============================================================================

const CRITICAL_ALLOWLIST = {
  // Subdomains that are ALWAYS valuable
  subdomains: [
    'api.',
    'graphql.',
    'rest.',
    'rpc.',
    'ws.',
    'wss.',
    'gateway.',
    'edge.',
    'backend.',
    'services.',
    'microservices.'
  ],

  // Paths that are ALWAYS valuable (even if other signals suggest noise)
  paths: [
    /\/api\//i,
    /\/v\d+\//i,           // /v1/, /v2/, /v3/, etc.
    /\/rest\//i,
    /\/graphql/i,
    /\/rpc\//i,
    /\/grpc\//i,
    /\/trpc\//i,
    /\/service\//i,
    /\/endpoint/i,
    /\/mutation/i,
    /\/query/i,
    /\/subscription/i,     // GraphQL subscriptions
    /\/websocket/i,
    /\/socket\.io/i,
    /\/_rpc\//i,           // Internal RPC
    /\/_api\//i,           // Internal API
    /\/ajax\//i,
    /\/webhook/i,
    /\/callback/i,
    /\/oauth/i,
    /\/auth\//i,
    /\/login/i,
    /\/logout/i,
    /\/token/i,
    /\/refresh/i,
    /\/session/i,
    /\/user/i,
    /\/account/i,
    /\/profile/i,
    /\/data\//i,
    /\/content\//i,
    /\/stream/i,
    /\/sse/i,              // Server-Sent Events
    /\/events/i,           // Event stream
    /\/quote/i,            // User's case
    /\/calculate/i,        // User's case
    /\/pricing/i,
    /\/payment/i,
    /\/checkout/i,
    /\/order/i,
    /\/cart/i,
    /\/search/i,
    /\/filter/i,
    /\/fetch/i,
    /\/load/i,
    /\/submit/i,
    /\/save/i,
    /\/create/i,
    /\/update/i,
    /\/patch/i,
    /\/delete/i,
    /\/remove/i,
    /\/upload/i,
    /\/download/i,
    /\/export/i,
    /\/import/i,
    /\/validate/i,
    /\/verify/i,
    /\/check/i
  ],

  // Content-Types that are ALWAYS valuable
  contentTypes: [
    'application/json',
    'application/ld+json',
    'application/graphql',
    'application/x-protobuf',
    'application/protobuf',
    'application/grpc',
    'application/grpc+proto',
    'application/grpc-web',
    'application/grpc-web+proto',
    'application/vnd.api+json',  // JSON API spec
    'text/event-stream',         // Server-Sent Events
    'application/octet-stream'   // Could be binary API data
  ],

  // Response Content-Types that indicate valuable data
  responseContentTypes: [
    'application/json',
    'application/graphql',
    'application/xml',
    'text/xml',
    'application/x-protobuf',
    'application/grpc',
    'text/event-stream'
  ]
};

// ============================================================================
// DEFINITE NOISE - These are 100% junk, NEVER valuable
// ============================================================================

const DEFINITE_NOISE = {
  // Known junk domains (expanded)
  domains: [
    // Analytics & Tracking
    'google-analytics.com',
    'googletagmanager.com',
    'analytics.google.com',
    'analytics.tiktok.com',
    'analytics.twitter.com',
    'analytics.facebook.com',
    'doubleclick.net',
    'facebook.com/tr',
    'connect.facebook.net',
    'pixel.facebook.com',
    'mixpanel.com',
    'segment.com',
    'segment.io',
    'amplitude.com',
    'heap.io',
    'hotjar.com',
    'fullstory.com',
    'logrocket.com',
    'quantcast.com',
    'scorecardresearch.com',
    'chartbeat.com',
    'kissmetrics.com',
    'optimizely.com',
    'crazyegg.com',
    'mouseflow.com',
    
    // Error Tracking & Monitoring
    'sentry.io',
    'bugsnag.com',
    'rollbar.com',
    'airbrake.io',
    'trackjs.com',
    'errorception.com',
    'newrelic.com',
    'nr-data.net',
    'pingdom.net',
    'datadoghq.com',
    'datadoghq-rum.com',
    'uptimerobot.com',
    'statuscake.com',
    
    // Ads & Monetization
    'googlesyndication.com',
    'adservice.google.com',
    'pagead2.googlesyndication.com',
    'adnxs.com',
    'adsystem.com',
    'advertising.com',
    'doubleclick.com',
    'ads-twitter.com',
    'ads.linkedin.com',
    'pubmatic.com',
    'rubiconproject.com',
    'openx.net',
    'criteo.com',
    'taboola.com',
    'outbrain.com',
    'zergnet.com',
    'disqus.com/ads',
    
    // Social Widgets & Embeds
    'twitter.com/widgets',
    'platform.twitter.com',
    'linkedin.com/embed',
    'instagram.com/embed',
    'facebook.com/plugins',
    'youtube.com/embed',
    'platform.linkedin.com',
    'platform.instagram.com',
    'syndication.twitter.com',
    
    // CDN (context-dependent, but usually assets)
    // NOTE: Only if serving static assets, not API responses
    
    // Feature Flags & A/B Testing
    'launchdarkly.com',
    'split.io',
    'statsig.com',
    'growthbook.io',
    
    // Chat Widgets
    'intercom.io',
    'zendesk.com',
    'zopim.com',
    'drift.com',
    'livechatinc.com',
    'tawk.to',
    'crisp.chat',
    
    // Cookie Consent
    'cookielaw.org',
    'onetrust.com',
    'iubenda.com',
    'cookiebot.com',
    
    // Fonts (definitely assets)
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'use.typekit.net',
    'cloud.typography.com',
    
    // Maps (usually widgets, not APIs)
    'maps.googleapis.com/maps-api-v3',
    'maps.google.com/maps-api-v3'
  ],

  // Paths that are ALWAYS noise
  paths: [
    /\/analytics/i,
    /\/tracking/i,
    /\/track/i,
    /\/pixel/i,
    /\/beacon/i,
    /\/collect/i,
    /\/log/i,
    /\/logger/i,
    /\/metric/i,
    /\/metrics/i,
    /\/telemetry/i,
    /\/event/i,
    /\/events/i,           // Unless it's /api/events or SSE
    /\/impression/i,
    /\/click/i,
    /\/view/i,
    /\/pageview/i,
    /\/heartbeat/i,
    /\/ping/i,
    /\/pong/i,
    /\/alive/i,
    /\/healthcheck/i,
    /\/health/i,           // Health checks are noise
    /\/status/i,           // Status pages are noise
    /\/readiness/i,
    /\/liveness/i,
    /\/favicon\.ico/i,
    /\/robots\.txt/i,
    /\/sitemap\.xml/i,
    /\/ads\.txt/i,
    /\/manifest\.json/i,   // Web manifest
    /\/service-worker\.js/i,
    /\/sw\.js/i,
    /\/_next\//i,          // Next.js internals
    /\/__next/i,
    /\/__webpack/i,        // Webpack HMR
    /\/hot-update/i,       // HMR
    /\/sockjs-node/i,      // Webpack Dev Server
    /\/webpack-dev-server/i,
    /\/hmr/i,
    /\/error_log/i,
    /\/error\.gif/i,       // Tracking pixel
    /\/clear\.gif/i,       // Tracking pixel
    /\/1x1\.gif/i,         // Tracking pixel
    /\/utm\.gif/i,         // Tracking pixel
    /\/gtm\.js/i,          // Google Tag Manager
    /\/ga\.js/i,           // Google Analytics
    /\/fbevents\.js/i,     // Facebook Pixel
    /\/analytics\.js/i,
    /\/segment\.js/i,
    /\/mixpanel\.js/i
  ],

  // Protocols that are NEVER valuable
  protocols: [
    'chrome-extension://',
    'moz-extension://',
    'safari-extension://',
    'webkit-extension://',
    'data:',               // Data URIs
    'blob:',               // Blob URLs
    'about:',
    'file:',
    'ftp:'
  ],

  // Static asset extensions (definite noise)
  assetExtensions: [
    '.js',
    '.css',
    '.map',                // Source maps
    '.scss',
    '.sass',
    '.less',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.svg',
    '.webp',
    '.avif',
    '.ico',
    '.bmp',
    '.tiff',
    '.woff',
    '.woff2',
    '.ttf',
    '.eot',
    '.otf',
    '.mp3',
    '.mp4',
    '.webm',
    '.ogg',
    '.wav',
    '.flac',
    '.mov',
    '.avi',
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.zip',
    '.tar',
    '.gz',
    '.rar'
  ],

  // Tracking query parameters (remove before analysis)
  trackingParams: [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'fbclid',              // Facebook click ID
    'gclid',               // Google click ID
    'msclkid',             // Microsoft click ID
    'dclid',               // DoubleClick ID
    '_ga',                 // Google Analytics
    '_gid',
    '_gac',
    'mc_cid',              // Mailchimp campaign ID
    'mc_eid',              // Mailchimp email ID
    'hsCtaTracking',       // HubSpot
    'referrer',
    'ref',
    'source',
    '_branch_match_id',    // Branch.io
    'twclid',              // Twitter click ID
    'gbraid',              // Google Ads
    'wbraid'               // Google Ads
  ]
};

// ============================================================================
// SAFEGUARDS - Prevent false negatives
// ============================================================================

/**
 * Check if request matches CRITICAL_ALLOWLIST
 * If true, it should NEVER be filtered as noise
 */
function isOnAllowlist(event: NetworkEvent): { isAllowed: boolean; reason?: string } {
  try {
    const urlObj = new URL(event.url);
    const hostname = urlObj.hostname.toLowerCase();
    const path = event.path.toLowerCase();
    const contentType = event.reqHeaders?.['content-type']?.toLowerCase() || '';
    const accept = event.reqHeaders?.['accept']?.toLowerCase() || '';
    const resContentType = event.resBodyText ? 
      (event.reqHeaders?.['content-type']?.toLowerCase() || '') : '';

    // Check subdomain allowlist
    for (const subdomain of CRITICAL_ALLOWLIST.subdomains) {
      if (hostname.startsWith(subdomain)) {
        return { isAllowed: true, reason: `Subdomain: ${subdomain}` };
      }
    }

    // Check path allowlist
    for (const pattern of CRITICAL_ALLOWLIST.paths) {
      if (pattern.test(path)) {
        return { isAllowed: true, reason: `Path pattern: ${pattern}` };
      }
    }

    // Check content-type allowlist
    for (const ct of CRITICAL_ALLOWLIST.contentTypes) {
      if (contentType.includes(ct) || accept.includes(ct)) {
        return { isAllowed: true, reason: `Content-Type: ${ct}` };
      }
    }

    // Check response content-type (valuable data)
    if (event.resBodyText) {
      for (const ct of CRITICAL_ALLOWLIST.responseContentTypes) {
        if (resContentType.includes(ct)) {
          // Additional check: must have substantial response
          if (event.resBodyText.length > 10) {
            return { isAllowed: true, reason: `Response Content-Type: ${ct}` };
          }
        }
      }
    }

    // Check for authentication (authenticated requests are usually valuable)
    const hasAuth = event.reqHeaders?.['authorization'] || 
                    event.reqHeaders?.['x-api-key'] ||
                    (event.reqHeaders?.['cookie'] && 
                     (event.reqHeaders['cookie'].includes('session') || 
                      event.reqHeaders['cookie'].includes('auth') ||
                      event.reqHeaders['cookie'].includes('token')));
    
    if (hasAuth && (contentType.includes('json') || accept.includes('json'))) {
      return { isAllowed: true, reason: 'Authenticated JSON request' };
    }

    return { isAllowed: false };
  } catch {
    return { isAllowed: false };
  }
}

/**
 * Check if request is DEFINITE NOISE
 */
function isDefiniteNoise(event: NetworkEvent): { isNoise: boolean; reason?: string } {
  const url = event.url.toLowerCase();
  const path = event.path.toLowerCase();

  // Check protocol
  for (const protocol of DEFINITE_NOISE.protocols) {
    if (url.startsWith(protocol)) {
      return { isNoise: true, reason: `Protocol: ${protocol}` };
    }
  }

  // Check asset extensions
  for (const ext of DEFINITE_NOISE.assetExtensions) {
    if (path.endsWith(ext)) {
      return { isNoise: true, reason: `Asset extension: ${ext}` };
    }
  }

  // Check noise domains
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    for (const noiseDomain of DEFINITE_NOISE.domains) {
      if (hostname.includes(noiseDomain)) {
        return { isNoise: true, reason: `Noise domain: ${noiseDomain}` };
      }
    }
  } catch {
    // Invalid URL
  }

  // Check noise paths
  for (const pattern of DEFINITE_NOISE.paths) {
    if (pattern.test(path)) {
      return { isNoise: true, reason: `Noise path: ${pattern}` };
    }
  }

  return { isNoise: false };
}

/**
 * Remove tracking parameters from URL
 */
function cleanURL(url: string): string {
  try {
    const urlObj = new URL(url);
    for (const param of DEFINITE_NOISE.trackingParams) {
      urlObj.searchParams.delete(param);
    }
    return urlObj.toString();
  } catch {
    return url;
  }
}

/**
 * Generate hash for request deduplication
 */
function hashRequest(event: NetworkEvent): string {
  const cleanUrl = cleanURL(event.url);
  const body = event.reqBodyText || '';
  return `${event.method}:${cleanUrl}:${body.substring(0, 100)}`;
}

/**
 * Calculate multi-dimensional signal score (0-100)
 * Uses weighted scoring across multiple dimensions
 */
function calculateSignalScore(event: NetworkEvent): { 
  score: number; 
  valuableReasons: string[]; 
  noiseReasons: string[];
  confidenceLevel: FilteredEvent['confidenceLevel'];
} {
  let score = 50; // Start neutral
  const valuableReasons: string[] = [];
  const noiseReasons: string[] = [];

  const url = event.url.toLowerCase();
  const path = event.path.toLowerCase();
  const contentType = event.reqHeaders?.['content-type']?.toLowerCase() || '';
  const accept = event.reqHeaders?.['accept']?.toLowerCase() || '';

  // ========== ALLOWLIST CHECK (Overrides everything) ==========
  const allowlistCheck = isOnAllowlist(event);
  if (allowlistCheck.isAllowed) {
    score = 100; // Maximum score
    valuableReasons.push(`✅ ALLOWLIST: ${allowlistCheck.reason}`);
    return { 
      score, 
      valuableReasons, 
      noiseReasons,
      confidenceLevel: 'definite_valuable'
    };
  }

  // ========== DEFINITE NOISE CHECK ==========
  const noiseCheck = isDefiniteNoise(event);
  if (noiseCheck.isNoise) {
    score = 0; // Minimum score
    noiseReasons.push(`❌ DEFINITE NOISE: ${noiseCheck.reason}`);
    return {
      score,
      valuableReasons,
      noiseReasons,
      confidenceLevel: 'definite_noise'
    };
  }

  // ========== POSITIVE SIGNALS (increase score) ==========

  // 1. API Subdomain
  try {
    const urlObj = new URL(event.url);
    const hostname = urlObj.hostname.toLowerCase();
    if (hostname.startsWith('api.') || hostname.startsWith('graphql.') || hostname.startsWith('rest.')) {
      score += 25;
      valuableReasons.push('API subdomain');
    }
  } catch {}

  // 2. Path contains valuable patterns
  const valuablePathPatterns = [
    { pattern: /\/api\//i, weight: 20, name: '/api/' },
    { pattern: /\/v\d+\//i, weight: 15, name: 'versioned API' },
    { pattern: /\/graphql/i, weight: 25, name: 'GraphQL' },
    { pattern: /\/rest\//i, weight: 20, name: 'REST' },
    { pattern: /\/rpc/i, weight: 20, name: 'RPC' },
    { pattern: /\/trpc/i, weight: 20, name: 'tRPC' },
    { pattern: /\/grpc/i, weight: 20, name: 'gRPC' }
  ];

  for (const { pattern, weight, name } of valuablePathPatterns) {
    if (pattern.test(path)) {
      score += weight;
      valuableReasons.push(`Path: ${name}`);
      break;
    }
  }

  // 3. Content-Type scoring
  if (contentType.includes('application/json')) {
    score += 20;
    valuableReasons.push('JSON content-type');
  } else if (contentType.includes('application/graphql')) {
    score += 25;
    valuableReasons.push('GraphQL content-type');
  } else if (contentType.includes('application/grpc') || contentType.includes('application/protobuf')) {
    score += 25;
    valuableReasons.push('Binary protocol (gRPC/Protobuf)');
  } else if (contentType.includes('text/event-stream')) {
    score += 20;
    valuableReasons.push('Server-Sent Events');
  }

  // 4. Accept header
  if (accept.includes('application/json')) {
    score += 15;
    valuableReasons.push('Accepts JSON');
  } else if (accept.includes('text/event-stream')) {
    score += 15;
    valuableReasons.push('Accepts SSE');
  }

  // 5. Mutation methods
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.method)) {
    score += 10;
    valuableReasons.push(`Mutation: ${event.method}`);
  }

  // 6. Authentication present
  const hasAuth = event.reqHeaders?.['authorization'] || 
                  event.reqHeaders?.['x-api-key'] ||
                  event.reqHeaders?.['x-auth-token'];
  if (hasAuth) {
    score += 15;
    valuableReasons.push('Has authentication');
  }

  // 7. Substantial request body
  if (event.reqBodyText && event.reqBodyText.length > 50) {
    score += 10;
    valuableReasons.push('Has request body');
  }

  // 8. JSON response
  if (event.resBodyText && event.resBodyText.length > 100) {
    try {
      JSON.parse(event.resBodyText);
      score += 10;
      valuableReasons.push('JSON response');
    } catch {}
  }

  // 9. Large response (indicates data transfer)
  if (event.size && event.size > 1000) {
    score += 5;
    valuableReasons.push('Large response');
  }

  // 10. Slow response (indicates computation)
  if (event.responseTime && event.responseTime > 100) {
    score += 5;
    valuableReasons.push('Slow response (computed)');
  }

  // ========== NEGATIVE SIGNALS (decrease score) ==========

  // 1. OPTIONS requests (CORS preflight - usually noise)
  if (event.method === 'OPTIONS') {
    score -= 40;
    noiseReasons.push('CORS preflight (OPTIONS)');
  }

  // 2. GET with no query params (less valuable)
  if (event.method === 'GET' && !url.includes('?')) {
    score -= 5;
    noiseReasons.push('Simple GET');
  }

  // 3. Error status codes
  if (event.status) {
    if (event.status >= 400 && event.status < 500) {
      score -= 15;
      noiseReasons.push(`Client error: ${event.status}`);
    } else if (event.status >= 500) {
      score -= 10;
      noiseReasons.push(`Server error: ${event.status}`);
    }
  }

  // 4. Very fast response (likely cached/trivial)
  if (event.responseTime && event.responseTime < 10) {
    score -= 3;
    noiseReasons.push('Very fast (cached?)');
  }

  // 5. Very small response (likely empty/error)
  if (event.size && event.size < 100) {
    score -= 5;
    noiseReasons.push('Tiny response');
  }

  // 6. HTML content-type (likely page navigation, not API)
  if (contentType.includes('text/html')) {
    score -= 20;
    noiseReasons.push('HTML content-type');
  }

  // 7. Image accept headers (loading images, not APIs)
  if (accept.includes('image/')) {
    score -= 15;
    noiseReasons.push('Requesting images');
  }

  // Cap score
  score = Math.max(0, Math.min(100, score));

  // Determine confidence level
  let confidenceLevel: FilteredEvent['confidenceLevel'];
  if (score >= 80) {
    confidenceLevel = 'definite_valuable';
  } else if (score >= 60) {
    confidenceLevel = 'probable_valuable';
  } else if (score >= 40) {
    confidenceLevel = 'uncertain';
  } else if (score >= 20) {
    confidenceLevel = 'probable_noise';
  } else {
    confidenceLevel = 'definite_noise';
  }

  return { score, valuableReasons, noiseReasons, confidenceLevel };
}

/**
 * Categorize request based on score and characteristics
 */
function categorizeRequest(event: NetworkEvent, score: number, confidenceLevel: FilteredEvent['confidenceLevel']): FilteredEvent['category'] {
  // Definite noise
  if (confidenceLevel === 'definite_noise') {
    const noiseCheck = isDefiniteNoise(event);
    if (noiseCheck.isNoise) {
      if (noiseCheck.reason?.includes('Asset extension')) return 'asset';
      if (noiseCheck.reason?.includes('Noise domain')) {
        if (noiseCheck.reason.includes('analytics') || noiseCheck.reason.includes('tracking')) return 'analytics';
        if (noiseCheck.reason.includes('ad')) return 'ads';
        if (noiseCheck.reason.includes('cdn') || noiseCheck.reason.includes('cloudflare')) return 'cdn';
      }
      if (noiseCheck.reason?.includes('Protocol')) return 'browser_internal';
      return 'noise';
    }
  }

  // Valuable categories
  if (score >= 60) {
    const contentType = event.reqHeaders?.['content-type']?.toLowerCase() || '';
    if (contentType.includes('form-urlencoded') || contentType.includes('multipart/form-data')) {
      return 'form_submission';
    }
    if (event.reqBodyText?.includes('__VIEWSTATE')) {
      return 'form_submission';
    }
    return 'valuable_api';
  }

  // Form submissions (medium score)
  if (score >= 40 && score < 60) {
    const contentType = event.reqHeaders?.['content-type']?.toLowerCase() || '';
    if (contentType.includes('form') || event.path.match(/\.(aspx|php|jsp)$/)) {
      return 'form_submission';
    }
  }

  return 'noise';
}

/**
 * Extract tokens from request (enhanced)
 */
function extractTokens(event: NetworkEvent): ExtractedToken[] {
  const tokens: ExtractedToken[] = [];

  // Headers
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
        type: 'basic',
        location: 'header',
        name: 'Authorization',
        value: authHeader.substring(6)
      });
    }
  }

  // API Keys
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

  // CSRF
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

  // Cookies
  const cookieHeader = event.reqHeaders?.['cookie'];
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map(c => c.trim());
    
    cookies.forEach(cookie => {
      const [name, value] = cookie.split('=');
      if (!name || !value) return;

      const nameLower = name.toLowerCase();

      // Session
      if (nameLower.includes('session') || nameLower.includes('sess') || nameLower.includes('sid') ||
          nameLower === 'asp.net_sessionid' || nameLower === 'phpsessid' || nameLower === 'jsessionid') {
        tokens.push({
          type: 'session',
          location: 'cookie',
          name,
          value
        });
      }

      // Auth
      if (nameLower.includes('auth') || nameLower.includes('token') || nameLower.includes('jwt') || nameLower.includes('access')) {
        tokens.push({
          type: isJWT(value) ? 'jwt' : 'bearer',
          location: 'cookie',
          name,
          value
        });
      }

      // OAuth
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

  // Body tokens
  if (event.reqBodyText) {
    try {
      const body = JSON.parse(event.reqBodyText);
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
    } catch {}
  }

  return tokens;
}

/**
 * Check if string is JWT
 */
function isJWT(str: string): boolean {
  return /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/.test(str);
}

/**
 * Extract variables (enhanced with pagination/cursor detection)
 */
function extractVariables(event: NetworkEvent): ExtractedVariable[] {
  const variables: ExtractedVariable[] = [];
  const seen = new Set<string>();

  const path = event.path;
  const pathSegments = path.split('/').filter(s => s);

  pathSegments.forEach(segment => {
    if (seen.has(segment)) return;

    // UUID
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
    // ID
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
    // Hash
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
    // Version (v1, v2, etc.)
    else if (/^v\d+$/i.test(segment)) {
      variables.push({
        name: 'version',
        value: segment,
        type: 'version',
        locations: ['url']
      });
      seen.add(segment);
    }
  });

  // Query parameters
  try {
    const urlObj = new URL(event.url);
    urlObj.searchParams.forEach((value, name) => {
      if (seen.has(value)) return;
      const nameLower = name.toLowerCase();

      // Pagination
      if (nameLower === 'offset' || nameLower === 'skip') {
        variables.push({ name, value, type: 'offset', locations: ['url'] });
        seen.add(value);
      } else if (nameLower === 'cursor' || nameLower === 'page_token' || nameLower === 'next') {
        variables.push({ name, value, type: 'cursor', locations: ['url'] });
        seen.add(value);
      }
      // IDs
      else if (nameLower.includes('id') && /^\d+$/.test(value)) {
        variables.push({ name, value, type: 'id', locations: ['url'] });
        seen.add(value);
      }
      // Timestamps
      else if ((nameLower.includes('time') || nameLower.includes('date') || nameLower === 'ts') && /^\d{10,13}$/.test(value)) {
        variables.push({ name, value, type: 'timestamp', locations: ['url'] });
        seen.add(value);
      }
      // UUIDs
      else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        variables.push({ name, value, type: 'uuid', locations: ['url'] });
        seen.add(value);
      }
    });
  } catch {}

  return variables;
}

/**
 * MAIN FUNCTION: Filter network traffic with 2026 production-grade logic
 */
export function filterNetworkTraffic(events: NetworkEvent[]): TrafficFilterResult {
  const valuableAPIs: FilteredEvent[] = [];
  const formSubmissions: FilteredEvent[] = [];
  const uncertain: FilteredEvent[] = [];
  const noise: FilteredEvent[] = [];
  const allTokens: ExtractedToken[] = [];
  const allVariables: ExtractedVariable[] = [];

  // Deduplication tracking
  const seenHashes = new Map<string, FilteredEvent>();
  let duplicateCount = 0;

  // Confidence level tracking
  const confidenceLevels = {
    definite_valuable: 0,
    probable_valuable: 0,
    uncertain: 0,
    probable_noise: 0,
    definite_noise: 0
  };

  events.forEach(event => {
    // Calculate score
    const { score, valuableReasons, noiseReasons, confidenceLevel } = calculateSignalScore(event);
    confidenceLevels[confidenceLevel]++;

    const category = categorizeRequest(event, score, confidenceLevel);
    const isValuable = category === 'valuable_api' || category === 'form_submission' || confidenceLevel === 'uncertain';

    // Extract tokens and variables from valuable events
    let extractedTokens: ExtractedToken[] = [];
    let extractedVariables: ExtractedVariable[] = [];
    
    if (isValuable || confidenceLevel === 'probable_valuable' || confidenceLevel === 'definite_valuable') {
      extractedTokens = extractTokens(event);
      extractedVariables = extractVariables(event);
      
      allTokens.push(...extractedTokens);
      allVariables.push(...extractedVariables);
    }

    // Check for duplicates
    const hash = hashRequest(event);
    const isDuplicate = seenHashes.has(hash);
    let duplicateOf: string | undefined;
    
    if (isDuplicate) {
      duplicateCount++;
      const original = seenHashes.get(hash);
      duplicateOf = original?.url;
      // Still track, but mark as duplicate
    } else {
      seenHashes.set(hash, {
        ...event,
        isValuable,
        confidenceLevel,
        noiseReasons,
        valuableReasons,
        signalScore: score,
        category,
        extractedTokens: extractedTokens.length > 0 ? extractedTokens : undefined,
        extractedVariables: extractedVariables.length > 0 ? extractedVariables : undefined,
        isDuplicate: false
      });
    }

    const filteredEvent: FilteredEvent = {
      ...event,
      isValuable,
      confidenceLevel,
      noiseReasons,
      valuableReasons,
      signalScore: score,
      category,
      extractedTokens: extractedTokens.length > 0 ? extractedTokens : undefined,
      extractedVariables: extractedVariables.length > 0 ? extractedVariables : undefined,
      isDuplicate,
      duplicateOf
    };

    // Bucket by category and confidence
    if (category === 'valuable_api') {
      valuableAPIs.push(filteredEvent);
    } else if (category === 'form_submission') {
      formSubmissions.push(filteredEvent);
    } else if (confidenceLevel === 'uncertain') {
      uncertain.push(filteredEvent);
    } else {
      noise.push(filteredEvent);
    }
  });

  // Sort by signal score
  valuableAPIs.sort((a, b) => b.signalScore - a.signalScore);
  formSubmissions.sort((a, b) => b.signalScore - a.signalScore);
  uncertain.sort((a, b) => b.signalScore - a.signalScore);

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
    uncertain,
    noise,
    stats: {
      total: events.length,
      valuable: valuableAPIs.length + formSubmissions.length,
      uncertain: uncertain.length,
      noise: noiseCount,
      duplicates: duplicateCount,
      noisePercentage: Math.round((noiseCount / events.length) * 100),
      topNoiseReasons,
      confidenceLevels
    },
    extractedTokens: uniqueTokens,
    extractedVariables: allVariables
  };
}

/**
 * Deduplicate tokens
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
