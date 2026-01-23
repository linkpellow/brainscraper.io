/**
 * Test Runner (Step 3D)
 * 
 * Executes endpoints with dependency-aware prerequisite resolution
 */

import type { EndpointCatalogEntry } from './endpointCatalog';
import type { DependencyGraph } from './dependencyResolver';
import type { AuthContext } from './authContext';
import { resolveExecutionOrder, canRunEndpoint } from './dependencyResolver';

/**
 * Test result
 */
export type TestResult = {
  endpointId: string;
  success: boolean;
  status?: number;
  statusText?: string;
  duration?: number;
  response?: any;
  responseHeaders?: Record<string, string>;
  request?: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: any;
  };
  error?: string;
  errorType?: 'network' | 'cors' | 'auth' | 'server' | 'unknown';
  artifactsExtracted?: number;
  isPrerequisite?: boolean;
};

/**
 * Test execution context
 */
export type TestExecutionContext = {
  authContext: AuthContext;
  dependencyGraph: DependencyGraph;
  results: Map<string, TestResult>;
  mockData?: Record<string, string | number | boolean>; // Mock data for query params/body
};

/**
 * Execute endpoint test with prerequisites
 */
export async function executeTest(
  endpointId: string,
  context: TestExecutionContext
): Promise<TestResult[]> {
  const { dependencyGraph, authContext } = context;
  
  // Resolve execution order
  const executionOrder = resolveExecutionOrder(dependencyGraph, endpointId);
  
  const results: TestResult[] = [];
  
  // Execute in order
  for (const currentEndpointId of executionOrder) {
    const node = dependencyGraph.nodes.get(currentEndpointId);
    if (!node) continue;
    
    // Check if we can run
    const { canRun, missing } = canRunEndpoint(node, authContext);
    
    if (!canRun && currentEndpointId !== endpointId) {
      // Prerequisite failed - skip
      results.push({
        endpointId: currentEndpointId,
        success: false,
        error: `Missing required artifacts: ${missing.join(', ')}`,
      });
      continue;
    }
    
      // Execute endpoint
      try {
        const result = await executeEndpoint(node.endpoint, authContext, context.mockData);
        result.isPrerequisite = currentEndpointId !== endpointId;
        results.push(result);
        
        // Store result
        context.results.set(currentEndpointId, result);
        
        // If this is a prerequisite and it failed, we might not be able to continue
        if (!result.success && currentEndpointId !== endpointId) {
          console.warn(`[TestRunner] Prerequisite ${currentEndpointId} failed, stopping chain`);
          // Add a note about the failure
          results.push({
            endpointId: endpointId,
            success: false,
            error: `Cannot execute: prerequisite ${node.endpoint.method} ${node.endpoint.path} failed`,
            errorType: 'auth',
            isPrerequisite: false,
          });
          break;
        }
      } catch (error) {
        const errorResult: TestResult = {
          endpointId: currentEndpointId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          errorType: 'unknown',
          isPrerequisite: currentEndpointId !== endpointId,
        };
        
        // Classify error
        if (error instanceof TypeError && error.message.includes('fetch')) {
          errorResult.errorType = 'network';
        } else if (error instanceof Error && error.message.includes('CORS')) {
          errorResult.errorType = 'cors';
        }
        
        results.push(errorResult);
        
        // If prerequisite failed, stop
        if (currentEndpointId !== endpointId) {
          break;
        }
      }
  }
  
  return results;
}

/**
 * Execute a single endpoint
 */
async function executeEndpoint(
  entry: EndpointCatalogEntry,
  authContext: AuthContext,
  mockData?: Record<string, string | number | boolean>
): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    // Build URL with query params from mock data
    let url = `https://${entry.host}${entry.path}`;
    
    // Add query params if mock data provided
    if (mockData && entry.requestSchema.queryParams && entry.requestSchema.queryParams.length > 0) {
      const urlObj = new URL(url);
      entry.requestSchema.queryParams.forEach((param: string) => {
        if (mockData[param] !== undefined && mockData[param] !== '') {
          urlObj.searchParams.set(param, String(mockData[param]));
        }
      });
      url = urlObj.toString();
    }
    
    // Build headers
    const headers: Record<string, string> = {};
    
    // Authorization
    if (entry.requiredAuth.tokens && entry.requiredAuth.tokens.length > 0) {
      const token = authContext.getBearerToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token.value}`;
      }
    }
    
    // CSRF
    if (entry.requiredAuth.csrf) {
      const csrf = authContext.getCSRFToken(entry.host);
      if (csrf) {
        headers[entry.requiredAuth.csrf.header] = csrf.value;
      }
    }
    
    // Other required headers
    for (const headerName of entry.requiredAuth.headers) {
      if (!headers[headerName]) {
        headers[headerName] = '[REQUIRED]';
      }
    }
    
    // Content-Type
    if (entry.requestSchema.bodyExample) {
      headers['Content-Type'] = 'application/json';
    }
    
    // Accept
    if (entry.responseSchema.contentType?.includes('json')) {
      headers['Accept'] = 'application/json';
    }
    
    // Cookies
    const cookies: string[] = [];
    for (const cookieName of entry.requiredAuth.cookies) {
      const cookie = authContext.getArtifact('cookie', cookieName, entry.host);
      if (cookie) {
        cookies.push(`${cookie.name}=${cookie.value}`);
      }
    }
    if (cookies.length > 0) {
      headers['Cookie'] = cookies.join('; ');
    }
    
    // Build body (merge mock data if provided)
    let body: string | undefined;
    if (entry.requestSchema.bodyExample) {
      const bodyData = mockData && Object.keys(mockData).length > 0
        ? { ...entry.requestSchema.bodyExample, ...mockData }
        : entry.requestSchema.bodyExample;
      body = JSON.stringify(bodyData);
    }
    
    // Capture request details
    const requestDetails = {
      url,
      method: entry.method,
      headers: { ...headers },
      body: body ? (typeof body === 'string' ? JSON.parse(body) : body) : undefined,
    };
    
    // Execute fetch
    const response = await fetch(url, {
      method: entry.method,
      headers,
      body,
    });
    
    const duration = Date.now() - startTime;
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    
    // Capture response headers
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    
    const responseData = isJson 
      ? await response.json()
      : await response.text();
    
    // Extract artifacts
    const artifacts = authContext.extractFromResponse({
      headers: responseHeaders,
      body: responseData,
      url: response.url,
    });
    
    artifacts.forEach(artifact => authContext.setArtifact(artifact));
    
    const success = response.status >= 200 && response.status < 300;
    let errorType: 'network' | 'cors' | 'auth' | 'server' | 'unknown' | undefined;
    
    if (response.status === 401 || response.status === 403) {
      errorType = 'auth';
    } else if (response.status >= 500) {
      errorType = 'server';
    }
    
    return {
      endpointId: entry.id,
      success,
      status: response.status,
      statusText: response.statusText,
      duration,
      response: responseData,
      responseHeaders,
      request: requestDetails,
      artifactsExtracted: artifacts.length,
      errorType,
    };
  } catch (error) {
    let errorMessage = 'Unknown error';
    let errorType = 'unknown';
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      errorType = 'network';
      errorMessage = 'Network error: Unable to connect. This may be due to CORS restrictions or the endpoint not being accessible from the browser.';
    } else if (error instanceof Error) {
      errorMessage = error.message;
      if (error.message.includes('CORS')) {
        errorType = 'cors';
        errorMessage = 'CORS error: The endpoint blocks cross-origin requests from the browser. Use the cURL snippet or run from a server instead.';
      } else if (error.message.includes('Failed to fetch')) {
        errorType = 'network';
        errorMessage = 'Network error: Failed to fetch. The endpoint may be unreachable or blocked.';
      }
    } else {
      errorMessage = String(error);
    }
    
    return {
      endpointId: entry.id,
      success: false,
      error: errorMessage,
      errorType: errorType as 'network' | 'cors' | 'auth' | 'server' | 'unknown',
      duration: Date.now() - startTime,
    };
  }
}
