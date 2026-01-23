/**
 * Snippet Generator (Step 3A, 3B, 3C)
 * 
 * Generates Minimal and Fidelity cURL + executable code snippets
 */

import type { EndpointCatalogEntry } from './endpointCatalog';
import type { MinimalAuthRequirements } from './authRequirements';
import type { AuthContext } from './authContext';

/**
 * Options for snippet generation
 */
export type SnippetGenerationOptions = {
  sessionId?: string;
  apiKey?: string;
  domain?: string;
  baseUrl?: string; // Base URL for API calls (defaults to current origin)
  mockData?: Record<string, string | number | boolean>; // Mock data for query params/body (only phone numbers)
  agentNumber?: string; // Auto-extracted agent number from HAR data
};

/**
 * Snippet variant
 */
export type SnippetVariant = 'minimal' | 'fidelity';

/**
 * Generated snippet
 */
export type GeneratedSnippet = {
  variant: SnippetVariant;
  curl: string;
  executable: string; // Node/TS code
};

/**
 * Generate snippets for an endpoint
 */
export function generateSnippets(
  entry: EndpointCatalogEntry,
  authRequirements: MinimalAuthRequirements,
  authContext: AuthContext,
  variant: SnippetVariant = 'minimal',
  options?: SnippetGenerationOptions
): GeneratedSnippet {
  const curl = generateCurl(entry, authRequirements, authContext, variant, options);
  const executable = generateExecutableCode(entry, authRequirements, authContext, variant, options);
  
  return {
    variant,
    curl,
    executable,
  };
}

/**
 * Generate cURL command (3B)
 */
function generateCurl(
  entry: EndpointCatalogEntry,
  authRequirements: MinimalAuthRequirements,
  authContext: AuthContext,
  variant: SnippetVariant,
  options?: SnippetGenerationOptions
): string {
  // Build URL with query params from mock data
  let url = entry.exampleCurl.match(/curl -X \w+ "([^"]+)"/)?.[1] || entry.requestSchema.path;
  
  // Add query params (auto-fill agent number, use mock data for phone)
  if (entry.requestSchema.queryParams && entry.requestSchema.queryParams.length > 0) {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${entry.host}${url}`);
    entry.requestSchema.queryParams.forEach((param: string) => {
      const paramLower = param.toLowerCase();
      // Auto-fill agent number from HAR data
      if (paramLower.includes('agent') && (paramLower.includes('number') || paramLower.includes('context'))) {
        if (options?.agentNumber) {
          urlObj.searchParams.set(param, options.agentNumber);
        }
      } else if (paramLower.includes('phone')) {
        // Use mock data for phone numbers
        if (options?.mockData && options.mockData[param] !== undefined && options.mockData[param] !== '') {
          urlObj.searchParams.set(param, String(options.mockData[param]));
        }
      }
    });
    url = urlObj.toString();
  } else if (!url.startsWith('http')) {
    url = `https://${entry.host}${url}`;
  }
  
  const method = entry.method;
  const parts: string[] = [];
  
  // Base command
  parts.push(`curl -X ${method}`);
  
  // Headers
  const headers: string[] = [];
  
  // Filter out browser-only headers that shouldn't be in API snippets
  const browserOnlyHeaders = new Set([
    'accept-encoding',
    'connection',
    'host',
    'origin',
    'referer',
    'sec-fetch-dest',
    'sec-fetch-mode',
    'sec-fetch-site',
    'sec-fetch-user',
    'user-agent',
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
    'upgrade-insecure-requests',
    'cache-control',
    'pragma',
  ]);
  
  // Required headers from auth requirements (only essential ones)
  for (const header of authRequirements.requiredHeaders) {
    const headerLower = header.name.toLowerCase();
    
    // Skip browser-only headers
    if (browserOnlyHeaders.has(headerLower)) {
      continue;
    }
    
    let value: string | null = null;
    
    if (headerLower === 'authorization') {
      // Get actual token from auth context or use API call
      const token = authContext.getBearerToken();
      if (token) {
        value = `Bearer ${token.value}`;
      } else if (options?.sessionId && options?.apiKey) {
        // Use dynamic token fetch if session info available
        const baseUrl = options.baseUrl || 'YOUR_BASE_URL';
        value = `$(curl -s "${baseUrl}/api/auth-worker/token?sessionId=${options.sessionId}&apiKey=${options.apiKey}" | jq -r ".token")`;
      } else {
        // Skip if no token available
        continue;
      }
    } else if (headerLower.includes('csrf') || headerLower.includes('xsrf')) {
      const csrf = authContext.getCSRFToken(entry.host);
      if (csrf) {
        value = csrf.value;
      } else {
        // Skip CSRF if not available
        continue;
      }
    } else if (headerLower === 'accept') {
      // Use proper Accept header
      value = entry.responseSchema.contentType?.includes('json') ? 'application/json' : '*/*';
    } else if (headerLower === 'content-type') {
      // Will be set below if body exists
      continue;
    } else {
      // Try to get value from header source
      const headerSource = header.source;
      if (headerSource) {
        // For custom headers, we can't get them from auth context (only supports cookie/bearer/csrf/api_key)
        // Skip custom headers without explicit values - they should be provided by the user
        continue;
      } else {
        // Skip headers without source
        continue;
      }
    }
    
    if (value) {
      headers.push(`-H '${header.name}: ${value}'`);
    }
  }
  
  // Content-Type (only if body exists)
  if (entry.requestSchema.bodyShape || entry.requestSchema.bodyExample) {
    headers.push(`-H 'Content-Type: application/json'`);
  }
  
  // Accept (only if JSON response expected)
  if (entry.responseSchema.contentType?.includes('json')) {
    headers.push(`-H 'Accept: application/json'`);
  }
  
  // Fidelity variant: add minimal browser-like headers (but not browser-only ones)
  if (variant === 'fidelity') {
    headers.push(`-H 'Accept-Language: en-US,en;q=0.9'`);
    headers.push(`-H 'X-Requested-With: XMLHttpRequest'`);
  }
  
  // Cookies (only include if we have actual values)
  const cookieStrings: string[] = [];
  for (const cookie of authRequirements.requiredCookies) {
    const cookieArtifact = authContext.getArtifact('cookie', cookie.name, cookie.domain || entry.host);
    if (cookieArtifact && cookieArtifact.value) {
      cookieStrings.push(`${cookie.name}=${cookieArtifact.value}`);
    }
    // Skip cookies without values - don't add [REQUIRED] placeholders
  }
  
  if (cookieStrings.length > 0) {
    headers.push(`-H 'Cookie: ${cookieStrings.join('; ')}'`);
  }
  
  // Add headers to command
  if (headers.length > 0) {
    parts.push(headers.join(' \\\n  '));
  }
  
  // Body (merge mock data if provided)
  if (entry.requestSchema.bodyExample) {
    const bodyData = options?.mockData && Object.keys(options.mockData).length > 0
      ? { ...entry.requestSchema.bodyExample, ...options.mockData }
      : entry.requestSchema.bodyExample;
    const bodyStr = JSON.stringify(bodyData, null, 2);
    parts.push(`-d '${bodyStr.replace(/'/g, "'\\''")}'`);
  }
  
  // Compressed
  parts.push('--compressed');
  
  // URL (last)
  parts.push(`"${url}"`);
  
  return parts.join(' \\\n  ');
}

/**
 * Generate executable code snippet (3C)
 * Self-contained code that fetches token from auth worker API
 */
function generateExecutableCode(
  entry: EndpointCatalogEntry,
  authRequirements: MinimalAuthRequirements,
  authContext: AuthContext,
  variant: SnippetVariant,
  options?: SnippetGenerationOptions
): string {
  const baseUrl = options?.baseUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com');
  const sessionId = options?.sessionId || 'YOUR_SESSION_ID';
  const apiKey = options?.apiKey || 'YOUR_API_KEY';
  
  const url = entry.requestSchema.path;
  const method = entry.method;
  
  // Generate a better function name from the path
  const pathParts = entry.path.split('/').filter((p: string) => p && !p.startsWith(':'));
  const lastPart = pathParts[pathParts.length - 1] || 'endpoint';
  const functionName = `call${method}${lastPart
    .split(/[-_]/)
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')}`;
  
  // Build function parameters
  const params: string[] = [];
  if (entry.requestSchema.queryParams && entry.requestSchema.queryParams.length > 0) {
    // Create a proper TypeScript interface for query params
    const queryParamTypes = entry.requestSchema.queryParams.map(p => {
      const paramLower = p.toLowerCase();
      // Agent number and phone are strings, not numbers
      if (paramLower.includes('agent') || paramLower.includes('phone')) {
        return `${p}?: string`;
      }
      // Other numeric params
      if (paramLower.includes('number') || paramLower.includes('count') || paramLower.includes('id')) {
        return `${p}?: number`;
      }
      return `${p}?: string`;
    });
    params.push(`query?: { ${queryParamTypes.join('; ')} }`);
  }
  if (entry.requestSchema.bodyExample) {
    // Infer body type from example
    const bodyType = typeof entry.requestSchema.bodyExample === 'object' 
      ? 'Record<string, any>'
      : typeof entry.requestSchema.bodyExample;
    params.push(`body?: ${bodyType}`);
  }
  
  // Build headers
  const headerLines: string[] = [];
  headerLines.push('  const headers: Record<string, string> = {};');
  
  // Token fetching function (if authorization is required)
  // Check if bearer token is needed (from required headers or auth context)
  const needsTokenFetch = authRequirements.requiredHeaders.some(h => 
    h.name.toLowerCase() === 'authorization'
  ) || !!authContext.getBearerToken();
  
  if (needsTokenFetch) {
    headerLines.push('');
    headerLines.push(`  const tokenResponse = await fetch(\`\${baseUrl}/api/auth-worker/token?sessionId=\${sessionId}&apiKey=\${apiKey}\`);`);
    headerLines.push('  if (!tokenResponse.ok) {');
    headerLines.push('    throw new Error(`Failed to get token: ${tokenResponse.statusText}`);');
    headerLines.push('  }');
    headerLines.push('  const { token } = await tokenResponse.json();');
    headerLines.push('  if (!token) {');
    headerLines.push('    throw new Error("No token returned from auth worker");');
    headerLines.push('  }');
    headerLines.push('');
  }
  
  // Filter out browser-only headers that shouldn't be in code
  const browserOnlyHeaders = new Set([
    'accept-encoding',
    'connection',
    'host',
    'origin',
    'referer',
    'sec-fetch-dest',
    'sec-fetch-mode',
    'sec-fetch-site',
    'sec-fetch-user',
    'user-agent',
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
    'upgrade-insecure-requests',
    'cache-control',
    'pragma',
  ]);
  
  // Required headers (only essential ones)
  for (const header of authRequirements.requiredHeaders) {
    const headerLower = header.name.toLowerCase();
    
    // Skip browser-only headers
    if (browserOnlyHeaders.has(headerLower)) {
      continue;
    }
    
    if (headerLower === 'authorization') {
      headerLines.push(`  headers['Authorization'] = \`Bearer \${token}\`;`);
    } else if (headerLower.includes('csrf') || headerLower.includes('xsrf')) {
      // Skip CSRF - handled separately if needed
    } else if (headerLower === 'content-type') {
      // Will be set below if body exists
      continue;
    } else if (headerLower === 'accept') {
      // Will be set below if JSON response
      continue;
    } else {
      // Skip custom headers without known values
    }
  }
  
  // Content-Type (only if body exists)
  if (entry.requestSchema.bodyShape) {
    headerLines.push("  headers['Content-Type'] = 'application/json';");
  }
  
  // Accept (only if JSON response expected)
  if (entry.responseSchema.contentType?.includes('json')) {
    headerLines.push("  headers['Accept'] = 'application/json';");
  }
  
  // Cookies are handled automatically by the auth worker proxy
  
  // Build URL with proper host and mock data
  const fullUrl = url.startsWith('http') ? url : `https://${entry.host}${url.startsWith('/') ? url : '/' + url}`;
  let urlLine = '';
  if (entry.requestSchema.queryParams && entry.requestSchema.queryParams.length > 0) {
    urlLine = `  const url = new URL('${url}', 'https://${entry.host}');`;
    
    // Auto-fill agent number and phone from options
    const queryLines: string[] = [];
    entry.requestSchema.queryParams.forEach((param: string) => {
      const paramLower = param.toLowerCase();
      if (paramLower.includes('agent') && (paramLower.includes('number') || paramLower.includes('context'))) {
        // Auto-fill agent number
        if (options?.agentNumber) {
          queryLines.push(`  url.searchParams.set('${param}', '${options.agentNumber}');`);
        }
      } else if (paramLower.includes('phone')) {
        // Use mock data for phone
        if (options?.mockData && options.mockData[param] !== undefined && options.mockData[param] !== '') {
          const value = options.mockData[param];
          queryLines.push(`  url.searchParams.set('${param}', ${typeof value === 'string' ? `'${value}'` : value});`);
        } else if (params.some(p => p.includes('query'))) {
          // Fallback to query param if provided
          queryLines.push(`  if (query?.${param}) url.searchParams.set('${param}', String(query.${param}));`);
        }
      } else if (params.some(p => p.includes('query'))) {
        // Other params from query object
        queryLines.push(`  if (query?.${param}) url.searchParams.set('${param}', String(query.${param}));`);
      }
    });
    
    if (queryLines.length > 0) {
      urlLine += '\n' + queryLines.join('\n');
    } else {
      urlLine += '\n  if (query) {';
      urlLine += `\n    Object.entries(query).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });`;
      urlLine += '\n  }';
    }
  } else {
    urlLine = `  const url = '${fullUrl}';`;
  }
  
  // Build body
  let bodyLine = '';
  if (entry.requestSchema.bodyExample) {
    const exampleBody = JSON.stringify(entry.requestSchema.bodyExample, null, 2);
    bodyLine = `  const bodyStr = body ? JSON.stringify(body) : ${exampleBody};`;
  }
  
  // Build fetch call
  const urlVar = urlLine.includes('new URL') ? 'url.toString()' : 'url';
  const fetchCall = `
  const startTime = Date.now();
  const response = await fetch(${urlVar}, {
    method: '${method}',
    headers,
    ${bodyLine ? 'body: bodyStr,' : ''}
  });
  
  const duration = Date.now() - startTime;
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  
  const responseData = isJson 
    ? await response.json()
    : await response.text();
  
  if (!response.ok) {
    throw new Error(\`Request failed: \${response.status} \${response.statusText}\`);
  }
  
  console.log(\`[${method} ${entry.path}] \${response.status} \${response.statusText} (\${duration}ms)\`);
  
  return responseData;`;
  
  // Build complete self-contained function
  const functionParams = params.length > 0 ? `,\n  ${params.join(',\n  ')}` : '';
  
  // Build example usage with actual values (use mock data if provided)
  let exampleUsage = '';
  if (entry.requestSchema.queryParams && entry.requestSchema.queryParams.length > 0) {
    // Use mock data if provided, otherwise create example
    const exampleQuery: Record<string, string | number> = options?.mockData && Object.keys(options.mockData).length > 0
      ? options.mockData as Record<string, string | number>
      : {};
    
    // Fill in missing params (agent number auto-filled, phone from mock data)
    entry.requestSchema.queryParams.forEach((param: string) => {
      if (!exampleQuery[param]) {
        const paramLower = param.toLowerCase();
        if (paramLower.includes('phone')) {
          // Phone from mock data or default
          const phoneValue = options?.mockData?.[param];
          exampleQuery[param] = (typeof phoneValue === 'string' || typeof phoneValue === 'number') 
            ? phoneValue 
            : '2694621403';
        } else if (paramLower.includes('agent') && (paramLower.includes('number') || paramLower.includes('context'))) {
          // Agent number auto-filled from HAR data
          exampleQuery[param] = options?.agentNumber || '00044447';
        } else {
          // Skip other params - they're not needed
        }
      }
    });
    
    // Format query params properly (only include phone, agent number is auto-filled)
    const queryParams: Record<string, string> = {};
    entry.requestSchema.queryParams.forEach((param: string) => {
      const paramLower = param.toLowerCase();
      if (paramLower.includes('phone') && exampleQuery[param]) {
        queryParams[param] = String(exampleQuery[param]);
      }
      // Agent number is auto-filled, don't include in example
    });
    const queryStr = Object.keys(queryParams).length > 0 
      ? JSON.stringify(queryParams, null, 2).replace(/\n/g, '\n  ')
      : '{}';
    exampleUsage = `const result = await ${functionName}(
  '${baseUrl}',
  '${sessionId}',
  '${apiKey}',
  ${queryStr}
);`;
  } else if (entry.requestSchema.bodyExample) {
    const bodyData = options?.mockData && Object.keys(options.mockData).length > 0
      ? { ...entry.requestSchema.bodyExample, ...options.mockData }
      : entry.requestSchema.bodyExample;
    const bodyStr = JSON.stringify(bodyData, null, 2);
    exampleUsage = `const result = await ${functionName}(
  '${baseUrl}',
  '${sessionId}',
  '${apiKey}',
  ${bodyStr}
);`;
  } else {
    exampleUsage = `const result = await ${functionName}('${baseUrl}', '${sessionId}', '${apiKey}');`;
  }
  
  return `/**
 * ${entry.purposeGuess || `${entry.method} ${entry.path}`}
 * 
 * @param baseUrl - Your application base URL
 * @param sessionId - Auth worker session ID
 * @param apiKey - Auth worker API key${params.length > 0 ? `\n * @param ${params.map(p => p.split('?:')[0]).join(' - ')}` : ''}
 * @returns Response data from the endpoint
 */
async function ${functionName}(
  baseUrl: string = '${baseUrl}',
  sessionId: string = '${sessionId}',
  apiKey: string = '${apiKey}'${functionParams}
) {${headerLines.join('\n')}
${urlLine}
${bodyLine ? bodyLine + '\n' : ''}${fetchCall}
}

// Example usage - copy and paste:
${exampleUsage}
console.log(result);`;
}
