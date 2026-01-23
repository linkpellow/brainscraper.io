/**
 * Endpoint Catalog (Step 2E)
 * 
 * Generates the final catalog structure for UI display
 */

import type { 
  RequestEvent, 
  EndpointGroup, 
  MinimalAuthRequirements,
  AuthSummary,
  AuthFlowGraph
} from './types';

/**
 * Request schema
 */
export type RequestSchema = {
  method: string;
  path: string;
  queryParams?: string[];
  bodyShape?: string;
  bodyExample?: any;
};

/**
 * Response schema
 */
export type ResponseSchema = {
  statusCodes: number[];
  contentType?: string;
  topLevelKeys?: string[];
  example?: any;
};

/**
 * Endpoint catalog entry
 */
export type EndpointCatalogEntry = {
  // Identity
  id: string;
  method: string;
  path: string;
  host: string;
  
  // Classification
  role: 'AUTH' | 'DATA' | 'MUTATION' | 'NOISE' | 'UNKNOWN';
  purposeGuess: string; // Inferred from path + response
  
  // Auth requirements
  requiredAuth: {
    cookies: string[];
    headers: string[];
    tokens?: string[];
    csrf?: {
      cookie: string;
      header: string;
    };
  };
  
  // Where to get auth values
  authSources: {
    cookies: Map<string, string>; // cookie name -> endpoint URL
    headers: Map<string, string>; // header name -> endpoint URL
  };
  
  // Request/Response schemas
  requestSchema: RequestSchema;
  responseSchema: ResponseSchema;
  
  // Example code
  exampleCurl: string;
  
  // Statistics
  callCount: number;
  successRate: number;
};

/**
 * Endpoint catalog
 */
export type EndpointCatalog = {
  entries: EndpointCatalogEntry[];
  authSummary: AuthSummary;
  authFlowGraph: AuthFlowGraph;
};

/**
 * Generate endpoint catalog
 */
export function generateEndpointCatalog(
  groups: EndpointGroup[],
  events: RequestEvent[],
  authRequirements: Map<string, MinimalAuthRequirements>,
  authSummary: AuthSummary,
  authFlowGraph: AuthFlowGraph
): EndpointCatalog {
  const entries: EndpointCatalogEntry[] = [];
  
  // Filter to important endpoints
  const importantGroups = groups.filter(g => 
    g.role === 'AUTH' || g.role === 'MUTATION' || g.role === 'DATA'
  );
  
  // Sort by importance (AUTH first, then by call count)
  importantGroups.sort((a, b) => {
    if (a.role === 'AUTH' && b.role !== 'AUTH') return -1;
    if (b.role === 'AUTH' && a.role !== 'AUTH') return 1;
    return b.callCount - a.callCount;
  });
  
  for (const group of importantGroups) {
    const groupEvents = events.filter(e => group.eventIds.includes(e.id));
    const reqs = authRequirements.get(group.keyString);
    
    // Infer purpose
    const purposeGuess = inferPurpose(group, groupEvents);
    
    // Build request schema
    const requestSchema = buildRequestSchema(group, groupEvents);
    
    // Build response schema
    const responseSchema = buildResponseSchema(group, groupEvents);
    
    // Build required auth
    const requiredAuth = {
      cookies: reqs?.requiredCookies.map(c => c.name) || [],
      headers: reqs?.requiredHeaders.map(h => h.name) || [],
      tokens: reqs?.requiredHeaders
        .filter(h => h.name.toLowerCase() === 'authorization')
        .map(h => 'Bearer token') || [],
      csrf: reqs?.csrfBinding ? {
        cookie: reqs.csrfBinding.cookieName || '',
        header: reqs.csrfBinding.headerName || '',
      } : undefined,
    };
    
    // Build auth sources
    const authSources = {
      cookies: reqs?.cookieSources || new Map(),
      headers: new Map<string, string>(),
    };
    
    // Find header sources
    for (const header of reqs?.requiredHeaders || []) {
      if (header.source) {
        authSources.headers.set(header.name, header.source);
      }
    }
    
    // Generate example cURL
    const exampleCurl = generateCurlExample(group, groupEvents[0], reqs);
    
    // Calculate success rate
    const successful = groupEvents.filter(e => e.status >= 200 && e.status < 300).length;
    const successRate = groupEvents.length > 0 ? successful / groupEvents.length : 0;
    
    entries.push({
      id: group.keyString,
      method: group.key.method,
      path: group.key.templatedPath,
      host: group.key.host,
      role: group.role!,
      purposeGuess,
      requiredAuth,
      authSources,
      requestSchema,
      responseSchema,
      exampleCurl,
      callCount: group.callCount,
      successRate,
    });
  }
  
  return {
    entries,
    authSummary,
    authFlowGraph,
  };
}

/**
 * Infer purpose from endpoint
 */
function inferPurpose(group: EndpointGroup, events: RequestEvent[]): string {
  const path = group.key.templatedPath.toLowerCase();
  
  // Check path patterns
  if (path.includes('login') || path.includes('auth')) return 'Authentication';
  if (path.includes('refresh') || path.includes('token')) return 'Token refresh';
  if (path.includes('user') || path.includes('profile')) return 'User profile';
  if (path.includes('search') || path.includes('query')) return 'Search/Query';
  if (path.includes('list') || path.includes('get')) return 'List/Retrieve';
  if (path.includes('create') || path.includes('add')) return 'Create resource';
  if (path.includes('update') || path.includes('edit')) return 'Update resource';
  if (path.includes('delete') || path.includes('remove')) return 'Delete resource';
  
  // Check response keys
  const firstEvent = events[0];
  if (firstEvent?.responseBody?.parsed && typeof firstEvent.responseBody.parsed === 'object') {
    const keys = Object.keys(firstEvent.responseBody.parsed);
    if (keys.includes('users') || keys.includes('items') || keys.includes('data')) {
      return 'Data retrieval';
    }
    if (keys.includes('access_token') || keys.includes('token')) {
      return 'Token issuance';
    }
  }
  
  return 'API endpoint';
}

/**
 * Build request schema
 */
function buildRequestSchema(group: EndpointGroup, events: RequestEvent[]): RequestSchema {
  const firstEvent = events[0];
  if (!firstEvent) {
    return {
      method: group.key.method,
      path: group.key.templatedPath,
    };
  }
  
  const queryParams = Object.keys(firstEvent.query);
  const bodyExample = firstEvent.requestBody?.parsed;
  const bodyShape = firstEvent.requestBody?.parsed 
    ? JSON.stringify(firstEvent.requestBody.parsed, null, 2).substring(0, 200)
    : undefined;
  
  return {
    method: group.key.method,
    path: group.key.templatedPath,
    queryParams: queryParams.length > 0 ? queryParams : undefined,
    bodyShape,
    bodyExample,
  };
}

/**
 * Build response schema
 */
function buildResponseSchema(group: EndpointGroup, events: RequestEvent[]): ResponseSchema {
  const statusCodes = Object.keys(group.statusDistribution).map(Number);
  const firstEvent = events.find(e => e.status >= 200 && e.status < 300) || events[0];
  
  let topLevelKeys: string[] | undefined;
  let example: any;
  
  if (firstEvent?.responseBody?.parsed && typeof firstEvent.responseBody.parsed === 'object') {
    topLevelKeys = Object.keys(firstEvent.responseBody.parsed);
    example = firstEvent.responseBody.parsed;
  }
  
  return {
    statusCodes,
    contentType: firstEvent?.contentType,
    topLevelKeys,
    example,
  };
}

/**
 * Generate cURL example
 */
function generateCurlExample(
  group: EndpointGroup,
  event: RequestEvent | undefined,
  reqs: MinimalAuthRequirements | undefined
): string {
  if (!event) {
    return `curl -X ${group.key.method} "${group.exampleUrls[0] || ''}"`;
  }
  
  const url = event.url;
  const method = event.method;
  const headers: string[] = [];
  
  // Add required headers
  if (reqs) {
    for (const header of reqs.requiredHeaders) {
      const value = event.requestHeaders[header.name.toLowerCase()] || '[REQUIRED]';
      headers.push(`-H "${header.name}: ${value}"`);
    }
  }
  
  // Add content-type if body exists
  if (event.requestBody?.text) {
    if (!headers.some(h => h.includes('Content-Type'))) {
      headers.push(`-H "Content-Type: ${event.requestBody.mimeType || 'application/json'}"`);
    }
  }
  
  let body = '';
  if (event.requestBody?.text) {
    body = `-d '${event.requestBody.text}'`;
  }
  
  const headersStr = headers.length > 0 ? `\n  ${headers.join('\n  ')}` : '';
  const bodyStr = body ? `\n  ${body}` : '';
  
  return `curl -X ${method} "${url}"${headersStr}${bodyStr}`;
}
