/**
 * API Discovery - Identifies real backend APIs vs form submissions
 * 
 * @module api-discovery
 * @description Analyzes network traffic to find direct API endpoints that bypass UI.
 * Priority 1: Find the API calls to automate quotes without form interaction.
 * 
 * @example
 * ```typescript
 * const apis = await discoverAPIs(networkEvents);
 * if (apis.directAPIs.length > 0) {
 *   // Use direct API calls (no form needed)
 * } else {
 *   // Fallback to form automation
 * }
 * ```
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
};

export type APIEndpoint = {
  url: string;
  path: string;
  method: string;
  type: 'api' | 'form' | 'asset' | 'unknown';
  confidence: number; // 0-1
  evidence: string[];
  parameters: Array<{
    name: string;
    type: 'query' | 'body' | 'header';
    required: boolean;
    exampleValue?: any;
  }>;
  authentication?: {
    type: 'cookie' | 'bearer' | 'basic' | 'none';
    headerName?: string;
    cookieNames?: string[];
  };
  response?: {
    contentType?: string;
    structure?: any;
    exampleResponse?: string;
  };
};

export type APIDiscoveryResult = {
  directAPIs: APIEndpoint[];        // Real backend APIs (can call directly)
  formEndpoints: APIEndpoint[];     // Form submission endpoints (need UI)
  assetRequests: APIEndpoint[];     // Static assets (ignore)
  totalRequests: number;
  apiCallProbability: number;       // 0-1 (confidence that direct APIs exist)
  recommendation: 'use_direct_api' | 'use_form_automation' | 'hybrid';
};

/**
 * Classify a network request as API, form, or asset
 */
function classifyRequest(event: NetworkEvent): { type: APIEndpoint['type']; confidence: number; evidence: string[] } {
  const evidence: string[] = [];
  let type: APIEndpoint['type'] = 'unknown';
  let confidence = 0;

  const url = event.url.toLowerCase();
  const path = event.path.toLowerCase();
  const contentType = event.reqHeaders?.['content-type']?.toLowerCase() || '';
  const accept = event.reqHeaders?.['accept']?.toLowerCase() || '';

  // === CHECK FOR ASSETS (Lowest priority) ===
  if (path.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|ico|webp)$/)) {
    return { type: 'asset', confidence: 1.0, evidence: ['File extension indicates static asset'] };
  }

  // === CHECK FOR REAL API CALLS (Highest priority) ===
  
  // 1. Content-Type indicates API
  if (contentType.includes('application/json')) {
    confidence += 0.4;
    evidence.push('JSON content-type');
    type = 'api';
  }
  
  // 2. Accept header requests JSON
  if (accept.includes('application/json')) {
    confidence += 0.3;
    evidence.push('Accepts JSON response');
    type = 'api';
  }

  // 3. Path contains API indicators
  const apiPathPatterns = ['/api/', '/v1/', '/v2/', '/rest/', '/graphql', '/json', '/ajax/', '/service/'];
  for (const pattern of apiPathPatterns) {
    if (path.includes(pattern)) {
      confidence += 0.4;
      evidence.push(`Path contains '${pattern}'`);
      type = 'api';
      break;
    }
  }

  // 4. Response is JSON
  if (event.resBodyText) {
    try {
      JSON.parse(event.resBodyText);
      confidence += 0.3;
      evidence.push('Response is valid JSON');
      type = 'api';
    } catch {
      // Not JSON
    }
  }

  // 5. Request body is JSON
  if (event.reqBodyText) {
    try {
      JSON.parse(event.reqBodyText);
      confidence += 0.2;
      evidence.push('Request body is JSON');
      if (type === 'unknown') type = 'api';
    } catch {
      // Not JSON - might be form data
    }
  }

  // === CHECK FOR FORM SUBMISSIONS ===
  
  // 1. Content-Type is form data
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    evidence.push('Form data content-type');
    if (type === 'unknown') {
      type = 'form';
      confidence = 0.7;
    } else {
      // Conflict: has JSON headers but form content-type (unusual)
      confidence = 0.5;
    }
  }

  // 2. Contains form state indicators (ASP.NET)
  if (event.reqBodyText) {
    if (event.reqBodyText.includes('__VIEWSTATE') || 
        event.reqBodyText.includes('__EVENTVALIDATION') ||
        event.reqBodyText.includes('__EVENTTARGET')) {
      evidence.push('Contains ASP.NET form state');
      type = 'form';
      confidence = Math.max(confidence, 0.9); // High confidence for form
    }
  }

  // 3. Path ends with .aspx, .php, .jsp (server-side pages)
  if (path.match(/\.(aspx|php|jsp|asp)$/)) {
    evidence.push('Server-side page extension');
    if (type === 'unknown') {
      type = 'form';
      confidence = 0.6;
    }
  }

  // 4. Accept header requests HTML
  if (accept.includes('text/html')) {
    evidence.push('Accepts HTML response');
    if (type === 'unknown') {
      type = 'form';
      confidence = 0.5;
    }
  }

  // === FINAL CLASSIFICATION ===
  
  // If still unknown but has some confidence, default to API
  if (type === 'unknown' && confidence > 0.3) {
    type = 'api';
  }

  // Cap confidence
  confidence = Math.min(confidence, 1.0);

  return { type, confidence, evidence };
}

/**
 * Extract parameters from a network request
 */
function extractParameters(event: NetworkEvent): APIEndpoint['parameters'] {
  const parameters: APIEndpoint['parameters'] = [];

  // Extract query parameters
  try {
    const urlObj = new URL(event.url);
    urlObj.searchParams.forEach((value, name) => {
      parameters.push({
        name,
        type: 'query',
        required: false, // Can't determine from single request
        exampleValue: value
      });
    });
  } catch {
    // Invalid URL
  }

  // Extract body parameters (if JSON)
  if (event.reqBodyText) {
    try {
      const body = JSON.parse(event.reqBodyText);
      if (typeof body === 'object' && body !== null) {
        Object.entries(body).forEach(([name, value]) => {
          parameters.push({
            name,
            type: 'body',
            required: false, // Can't determine from single request
            exampleValue: value
          });
        });
      }
    } catch {
      // Not JSON - try form data
      if (event.reqBodyText.includes('=')) {
        const pairs = event.reqBodyText.split('&');
        pairs.forEach(pair => {
          const [name, value] = pair.split('=');
          if (name && name !== '__VIEWSTATE' && name !== '__EVENTVALIDATION') {
            parameters.push({
              name: decodeURIComponent(name),
              type: 'body',
              required: false,
              exampleValue: value ? decodeURIComponent(value) : undefined
            });
          }
        });
      }
    }
  }

  // Extract important headers
  const importantHeaders = ['authorization', 'x-api-key', 'x-auth-token'];
  if (event.reqHeaders) {
    importantHeaders.forEach(headerName => {
      const value = event.reqHeaders![headerName.toLowerCase()];
      if (value) {
        parameters.push({
          name: headerName,
          type: 'header',
          required: true,
          exampleValue: value.substring(0, 20) + '...' // Truncate for security
        });
      }
    });
  }

  return parameters;
}

/**
 * Detect authentication method
 */
function detectAuthentication(event: NetworkEvent): APIEndpoint['authentication'] {
  const headers = event.reqHeaders || {};
  
  // Check for Bearer token
  const authHeader = headers['authorization'];
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return {
      type: 'bearer',
      headerName: 'Authorization'
    };
  }

  // Check for Basic auth
  if (authHeader && authHeader.toLowerCase().startsWith('basic ')) {
    return {
      type: 'basic',
      headerName: 'Authorization'
    };
  }

  // Check for API key header
  const apiKeyHeaders = ['x-api-key', 'api-key', 'apikey', 'x-auth-token'];
  for (const keyHeader of apiKeyHeaders) {
    if (headers[keyHeader.toLowerCase()]) {
      return {
        type: 'bearer',
        headerName: keyHeader
      };
    }
  }

  // Check for cookies
  const cookieHeader = headers['cookie'];
  if (cookieHeader) {
    const cookieNames = cookieHeader.split(';')
      .map(c => c.trim().split('=')[0])
      .filter(name => {
        const lower = name.toLowerCase();
        return lower.includes('session') || 
               lower.includes('auth') || 
               lower.includes('token') ||
               lower.includes('jwt');
      });
    
    if (cookieNames.length > 0) {
      return {
        type: 'cookie',
        cookieNames
      };
    }
  }

  return { type: 'none' };
}

/**
 * Extract response structure
 */
function extractResponseStructure(event: NetworkEvent): APIEndpoint['response'] {
  const contentType = event.resBodyText ? 
    (event.reqHeaders?.['content-type'] || 'unknown') : 
    undefined;

  let structure: any = undefined;
  let exampleResponse: string | undefined = undefined;

  if (event.resBodyText) {
    try {
      const parsed = JSON.parse(event.resBodyText);
      structure = getJSONStructure(parsed);
      exampleResponse = event.resBodyText.substring(0, 500); // First 500 chars
    } catch {
      // Not JSON
      if (event.resBodyText.length < 500) {
        exampleResponse = event.resBodyText;
      } else {
        exampleResponse = event.resBodyText.substring(0, 500) + '...';
      }
    }
  }

  return {
    contentType,
    structure,
    exampleResponse
  };
}

/**
 * Get JSON structure (types of fields)
 */
function getJSONStructure(obj: any, maxDepth = 3, currentDepth = 0): any {
  if (currentDepth >= maxDepth) return '...';
  
  if (obj === null) return 'null';
  if (Array.isArray(obj)) {
    if (obj.length === 0) return [];
    return [getJSONStructure(obj[0], maxDepth, currentDepth + 1)];
  }
  if (typeof obj === 'object') {
    const structure: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        structure[key] = getJSONStructure(value, maxDepth, currentDepth + 1);
      } else {
        structure[key] = typeof value;
      }
    }
    return structure;
  }
  return typeof obj;
}

/**
 * Discover APIs from network events
 * 
 * @param events - Captured network events
 * @returns Classification of requests into APIs vs forms
 * 
 * @example
 * ```typescript
 * const discovery = await discoverAPIs(capturedEvents);
 * 
 * if (discovery.recommendation === 'use_direct_api') {
 *   console.log('Found direct APIs:', discovery.directAPIs);
 *   // Use API calls directly
 * } else {
 *   console.log('No direct APIs found, use form automation');
 * }
 * ```
 */
export function discoverAPIs(events: NetworkEvent[]): APIDiscoveryResult {
  const directAPIs: APIEndpoint[] = [];
  const formEndpoints: APIEndpoint[] = [];
  const assetRequests: APIEndpoint[] = [];

  // Classify each request
  events.forEach(event => {
    const classification = classifyRequest(event);
    
    const endpoint: APIEndpoint = {
      url: event.url,
      path: event.path,
      method: event.method,
      type: classification.type,
      confidence: classification.confidence,
      evidence: classification.evidence,
      parameters: extractParameters(event),
      authentication: detectAuthentication(event),
      response: extractResponseStructure(event)
    };

    // Sort into buckets
    if (classification.type === 'api') {
      directAPIs.push(endpoint);
    } else if (classification.type === 'form') {
      formEndpoints.push(endpoint);
    } else if (classification.type === 'asset') {
      assetRequests.push(endpoint);
    }
  });

  // Sort by confidence
  directAPIs.sort((a, b) => b.confidence - a.confidence);
  formEndpoints.sort((a, b) => b.confidence - a.confidence);

  // Calculate probability of direct API usage
  const totalRelevantRequests = directAPIs.length + formEndpoints.length;
  const apiCallProbability = totalRelevantRequests > 0 
    ? directAPIs.length / totalRelevantRequests 
    : 0;

  // Determine recommendation
  let recommendation: APIDiscoveryResult['recommendation'];
  
  if (directAPIs.length > 0 && directAPIs[0].confidence >= 0.7) {
    recommendation = 'use_direct_api';
  } else if (directAPIs.length > 0 && formEndpoints.length > 0) {
    recommendation = 'hybrid';
  } else {
    recommendation = 'use_form_automation';
  }

  return {
    directAPIs,
    formEndpoints,
    assetRequests,
    totalRequests: events.length,
    apiCallProbability,
    recommendation
  };
}

/**
 * Generate curl command for an API endpoint
 */
export function generateAPICall(endpoint: APIEndpoint): string {
  let curl = `curl -X ${endpoint.method} '${endpoint.url}'`;

  // Add headers
  if (endpoint.authentication?.type === 'bearer' && endpoint.authentication.headerName) {
    curl += ` \\\n  -H '${endpoint.authentication.headerName}: Bearer YOUR_TOKEN'`;
  }

  if (endpoint.authentication?.type === 'cookie' && endpoint.authentication.cookieNames) {
    curl += ` \\\n  -H 'Cookie: ${endpoint.authentication.cookieNames.join('=YOUR_VALUE; ')}=YOUR_VALUE'`;
  }

  // Add content-type if JSON
  const hasJSONBody = endpoint.parameters.some(p => p.type === 'body');
  if (hasJSONBody) {
    curl += ` \\\n  -H 'Content-Type: application/json'`;
  }

  // Add body parameters
  const bodyParams = endpoint.parameters.filter(p => p.type === 'body');
  if (bodyParams.length > 0) {
    const bodyObj: any = {};
    bodyParams.forEach(param => {
      bodyObj[param.name] = param.exampleValue || 'YOUR_VALUE';
    });
    curl += ` \\\n  -d '${JSON.stringify(bodyObj, null, 2)}'`;
  }

  return curl;
}
