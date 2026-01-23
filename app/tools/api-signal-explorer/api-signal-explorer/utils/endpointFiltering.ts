/**
 * Endpoint filtering utilities for standard mode
 * Identifies important callable API endpoints vs static assets, analytics, etc.
 */

import type { EndpointData } from '../types';

/**
 * Check if an endpoint is a static asset (images, fonts, CSS, JS bundles, etc.)
 */
export function isStaticAsset(endpoint: EndpointData): boolean {
  const pathLower = endpoint.path.toLowerCase();
  const urlLower = endpoint.sampleUrl.toLowerCase();
  
  // Static file extensions
  const staticExtensions = [
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp', // Images
    '.woff', '.woff2', '.ttf', '.eot', '.otf', // Fonts
    '.css', '.scss', '.sass', // Stylesheets
    '.js', '.mjs', '.cjs', // JavaScript (but exclude API routes)
    '.map', // Source maps
    '.pdf', '.zip', '.tar', '.gz', // Documents/archives
    '.mp4', '.mp3', '.webm', '.ogg', // Media
  ];
  
  // Check if path ends with static extension
  if (staticExtensions.some(ext => pathLower.endsWith(ext) || urlLower.endsWith(ext))) {
    return true;
  }
  
  // Common static asset paths
  const staticPaths = [
    '/static/', '/assets/', '/public/', '/_next/', '/build/',
    '/images/', '/img/', '/fonts/', '/css/', '/js/',
    '/favicon.ico', '/robots.txt', '/sitemap.xml',
  ];
  
  if (staticPaths.some(path => pathLower.includes(path))) {
    return true;
  }
  
  return false;
}

/**
 * Check if an endpoint is an analytics/tracking endpoint
 */
export function isAnalyticsEndpoint(endpoint: EndpointData): boolean {
  const hostLower = endpoint.host.toLowerCase();
  const pathLower = endpoint.path.toLowerCase();
  const urlLower = endpoint.sampleUrl.toLowerCase();
  
  // Common analytics/tracking services
  const analyticsHosts = [
    'google-analytics.com',
    'googletagmanager.com',
    'analytics.google.com',
    'doubleclick.net',
    'facebook.com/tr',
    'facebook.net',
    'segment.io',
    'segment.com',
    'mixpanel.com',
    'amplitude.com',
    'hotjar.com',
    'fullstory.com',
    'logrocket.com',
    'sentry.io',
    'newrelic.com',
    'datadoghq.com',
    'clarity.ms',
    'i.clarity.ms',
  ];
  
  // Analytics paths
  const analyticsPaths = [
    '/analytics',
    '/tracking',
    '/track',
    '/collect',
    '/beacon',
    '/pixel',
    '/analytics.js',
    '/gtm.js',
    '/telemetry',
  ];
  
  return analyticsHosts.some(host => hostLower.includes(host)) ||
         analyticsPaths.some(path => pathLower.includes(path) || urlLower.includes(path));
}

/**
 * Check if an endpoint is a health check or monitoring endpoint
 */
export function isHealthCheckEndpoint(endpoint: EndpointData): boolean {
  const pathLower = endpoint.path.toLowerCase();
  
  const healthPaths = [
    '/health', '/healthz', '/healthcheck', '/ping', '/status',
    '/ready', '/live', '/metrics', '/monitoring',
  ];
  
  return healthPaths.some(path => pathLower.includes(path));
}

/**
 * Check if an endpoint is likely a callable API endpoint
 * (excludes static assets, analytics, health checks, etc.)
 */
export function isCallableAPIEndpoint(endpoint: EndpointData): boolean {
  // Exclude static assets
  if (isStaticAsset(endpoint)) {
    return false;
  }
  
  // Exclude analytics
  if (isAnalyticsEndpoint(endpoint)) {
    return false;
  }
  
  // Exclude health checks (optional - can be included if needed)
  // if (isHealthCheckEndpoint(endpoint)) {
  //   return false;
  // }
  
  // Exclude GET requests to root paths (likely HTML pages)
  if (endpoint.method === 'GET' && (endpoint.path === '/' || endpoint.path === '')) {
    return false;
  }
  
  // Exclude very short paths that are likely not APIs (e.g., /, /a, /b)
  if (endpoint.path.length < 3 && endpoint.method === 'GET') {
    return false;
  }
  
  // Prefer endpoints that:
  // 1. Are not GET requests to static resources
  // 2. Have JSON responses (indicates API)
  // 3. Have request bodies (indicates mutation/API)
  // 4. Have auth headers (indicates protected API)
  // 5. Have status codes in 200-299 range (successful API calls)
  
  const hasJsonResponse = endpoint.resMime?.includes('json') || 
                         endpoint.sampleResBody?.includes('{') ||
                         endpoint.sampleResBody?.includes('[');
  
  const hasRequestBody = !!endpoint.sampleReqBody && endpoint.sampleReqBody.length > 0;
  
  const hasAuth = endpoint.hasAuth;
  
  const hasSuccessStatus = Object.keys(endpoint.statuses).some(
    status => parseInt(status) >= 200 && parseInt(status) < 300
  );
  
  // Prioritize endpoints that look like APIs
  // At least one of: JSON response, request body, auth, or non-GET method
  const looksLikeAPI = hasJsonResponse || hasRequestBody || hasAuth || endpoint.method !== 'GET';
  
  return looksLikeAPI && hasSuccessStatus;
}

/**
 * Filter endpoints to only show important callable API endpoints
 * Used in standard mode to focus on actionable endpoints
 */
export function filterImportantEndpoints(endpoints: EndpointData[]): EndpointData[] {
  return endpoints.filter(isCallableAPIEndpoint);
}

/**
 * Sort endpoints by importance (for standard mode display)
 * Priority: authenticated endpoints > mutations > GET with JSON > others
 */
export function sortEndpointsByImportance(endpoints: EndpointData[]): EndpointData[] {
  return [...endpoints].sort((a, b) => {
    // Priority 1: Has auth
    if (a.hasAuth && !b.hasAuth) return -1;
    if (!a.hasAuth && b.hasAuth) return 1;
    
    // Priority 2: Is mutation (POST, PUT, PATCH, DELETE)
    const aIsMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(a.method);
    const bIsMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(b.method);
    if (aIsMutation && !bIsMutation) return -1;
    if (!aIsMutation && bIsMutation) return 1;
    
    // Priority 3: Has JSON response
    const aHasJson = a.resMime?.includes('json') || a.sampleResBody?.includes('{');
    const bHasJson = b.resMime?.includes('json') || b.sampleResBody?.includes('{');
    if (aHasJson && !bHasJson) return -1;
    if (!aHasJson && bHasJson) return 1;
    
    // Priority 4: Request count (more requests = more important)
    if (a.count !== b.count) {
      return b.count - a.count;
    }
    
    // Priority 5: Alphabetical by path
    return a.path.localeCompare(b.path);
  });
}
