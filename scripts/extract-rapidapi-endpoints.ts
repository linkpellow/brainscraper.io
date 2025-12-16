/**
 * Script to extract RapidAPI endpoint information from HAR file
 * Extracts target: node.js and client: fetch information
 */

import * as fs from 'fs';
import * as path from 'path';

interface RapidAPIEndpoint {
  name: string;
  url: string;
  method: string;
  host: string;
  path: string;
  target: string;
  client: string;
  codeSnippet?: string;
}

function extractEndpointsFromHAR(harFilePath: string): RapidAPIEndpoint[] {
  const harContent = fs.readFileSync(harFilePath, 'utf-8');
  const harData = JSON.parse(harContent);
  
  const endpoints: RapidAPIEndpoint[] = [];
  const seen = new Set<string>();
  
  // Extract from requests array
  const requests = harData.requests || [];
  
  // First, extract actual API endpoints from GraphQL responses
  const endpointMap = new Map<string, any>();
  
  requests.forEach((req: any) => {
    const url = req.url || '';
    
    // Look for GraphQL responses that contain endpoint data
    if (url.includes('/graphql')) {
      const responseBody = req.response?.body || req.responseBody;
      if (responseBody) {
        let bodyStr = '';
        if (typeof responseBody === 'string') {
          bodyStr = responseBody;
        } else if (responseBody.text) {
          bodyStr = responseBody.text;
        } else {
          bodyStr = JSON.stringify(responseBody);
        }
        
        try {
          const parsed = JSON.parse(bodyStr);
          if (parsed.data?.endpoint) {
            const endpoint = parsed.data.endpoint;
            const endpointId = endpoint.id;
            
            // Extract actual API endpoint URL from route
            let apiUrl = '';
            let apiHost = '';
            let apiMethod = endpoint.method || 'GET';
            
            if (endpoint.route) {
              // Route might be like "/search/person" or full URL
              if (endpoint.route.startsWith('http')) {
                apiUrl = endpoint.route;
                try {
                  const urlObj = new URL(apiUrl);
                  apiHost = urlObj.hostname;
                } catch {}
              } else {
                // Route is relative path like "/search-employees"
                // Need to find the API host from actual API requests
                apiMethod = endpoint.method || 'GET';
              }
            }
            
            // Try to find the actual API host by looking for requests to this endpoint
            // Look for requests that match this route pattern
            const matchingRequests = requests.filter((r: any) => {
              const rUrl = r.url || '';
              return rUrl.includes(endpoint.route) && 
                     rUrl.includes('.rapidapi.com') && 
                     !rUrl.includes('rapidapi.com/') && // Not main site
                     !rUrl.includes('/playground/'); // Not playground
            });
            
            if (matchingRequests.length > 0) {
              const apiReq = matchingRequests[0];
              try {
                const urlObj = new URL(apiReq.url);
                apiHost = urlObj.hostname;
                apiUrl = apiReq.url.split('?')[0]; // Remove query params
              } catch {}
            }
            
            endpointMap.set(endpointId, {
              id: endpointId,
              name: endpoint.name || 'Unknown',
              route: endpoint.route || '',
              method: apiMethod,
              url: apiUrl,
              host: apiHost,
              target: 'node.js', // Default, will try to extract
              client: 'fetch', // Default, will try to extract
              description: endpoint.description || '',
            });
          }
        } catch (e) {
          // Not JSON or parse error
        }
      }
    }
  });
  
  // Now extract from all requests and match with GraphQL data
  requests.forEach((req: any) => {
    const url = req.url || '';
    if (!url.includes('rapidapi.com')) return;
    
    // Skip playground URLs - we want actual API endpoints
    if (url.includes('/playground/')) {
      // But check if we can match it to a GraphQL endpoint
      const endpointIdMatch = url.match(/apiendpoint_([^\/\?]+)/);
      if (endpointIdMatch) {
        const endpointId = `apiendpoint_${endpointIdMatch[1]}`;
        const endpointData = endpointMap.get(endpointId);
        if (endpointData) {
          // We have GraphQL data for this endpoint
          const key = `${endpointData.method}:${endpointData.host}:${endpointData.route}`;
          if (!seen.has(key) && endpointData.route) {
            seen.add(key);
            endpoints.push({
              name: endpointData.name,
              url: endpointData.url || url,
              method: endpointData.method,
              host: endpointData.host || 'unknown.rapidapi.com',
              path: endpointData.route,
              target: endpointData.target,
              client: endpointData.client
            });
          }
        }
      }
      return;
    }
    
    // Extract actual API endpoints (not playground URLs)
    try {
      const urlObj = new URL(url);
      const host = urlObj.hostname;
      
      // Only process actual API hosts (not rapidapi.com main site)
      if (!host.includes('.rapidapi.com') || host === 'rapidapi.com') {
        // Check if it's a GraphQL endpoint
        if (url.includes('/graphql')) {
          return; // Already processed
        }
        return;
      }
      
      const method = req.method || 'GET';
      const endpointPath = urlObj.pathname;
      
      // Create unique key
      const key = `${method}:${host}:${endpointPath}`;
      if (seen.has(key)) return;
      seen.add(key);
      
      // Default values (RapidAPI typically uses these)
      let target = 'node.js';
      let client = 'fetch';
      
      // Try to extract from request body (GraphQL queries, code examples)
      const requestBody = req.request?.body || req.requestBody;
      if (requestBody) {
        let bodyStr = '';
        if (typeof requestBody === 'string') {
          bodyStr = requestBody;
        } else if (requestBody.text) {
          bodyStr = requestBody.text;
        } else {
          bodyStr = JSON.stringify(requestBody);
        }
        
        // Look for target and client in various formats
        const targetPatterns = [
          /target["\s:]+["']?([^"'\s,}]+)["']?/i,
          /"target"\s*:\s*["']([^"']+)["']/i,
          /target\s*=\s*["']([^"']+)["']/i,
        ];
        
        const clientPatterns = [
          /client["\s:]+["']?([^"'\s,}]+)["']?/i,
          /"client"\s*:\s*["']([^"']+)["']/i,
          /client\s*=\s*["']([^"']+)["']/i,
        ];
        
        for (const pattern of targetPatterns) {
          const match = bodyStr.match(pattern);
          if (match) {
            target = match[1];
            break;
          }
        }
        
        for (const pattern of clientPatterns) {
          const match = bodyStr.match(pattern);
          if (match) {
            client = match[1];
            break;
          }
        }
      }
      
      // Also check response body for endpoint configuration
      const responseBody = req.response?.body || req.responseBody;
      if (responseBody) {
        let bodyStr = '';
        if (typeof responseBody === 'string') {
          bodyStr = responseBody;
        } else if (responseBody.text) {
          bodyStr = responseBody.text;
        } else {
          bodyStr = JSON.stringify(responseBody);
        }
        
        // Try to parse as JSON and look for target/client
        try {
          const parsed = JSON.parse(bodyStr);
          if (parsed.data?.endpoint) {
            // GraphQL response structure
            const endpoint = parsed.data.endpoint;
            if (endpoint.target) target = endpoint.target;
            if (endpoint.client) client = endpoint.client;
          }
        } catch {
          // Not JSON, try regex patterns
          const targetMatch = bodyStr.match(/target["\s:]+["']?([^"'\s,}]+)["']?/i);
          if (targetMatch) target = targetMatch[1];
          
          const clientMatch = bodyStr.match(/client["\s:]+["']?([^"'\s,}]+)["']?/i);
          if (clientMatch) client = clientMatch[1];
        }
      }
      
      // Extract endpoint name from path
      const name = endpointPath.split('/').filter(Boolean).pop() || 
                   host.replace('.rapidapi.com', '') || 
                   'Unknown';
      
      endpoints.push({
        name,
        url,
        method,
        host,
        path: endpointPath,
        target,
        client
      });
    } catch (e) {
      console.error(`Error parsing URL ${url}:`, e);
    }
  });
  
  return endpoints;
}

function generateCodeSnippet(endpoint: RapidAPIEndpoint): string {
  const { method, url, host } = endpoint;
  
  if (method === 'GET') {
    return `const url = '${url}';

const options = {
  method: '${method}',
  headers: {
    'x-rapidapi-key': 'YOUR_RAPIDAPI_KEY',
    'x-rapidapi-host': '${host}'
  }
};

try {
  const response = await fetch(url, options);
  const result = await response.text();
  console.log(result);
} catch (error) {
  console.error(error);
}`;
  } else {
    return `const url = '${url}';

const options = {
  method: '${method}',
  headers: {
    'x-rapidapi-key': 'YOUR_RAPIDAPI_KEY',
    'x-rapidapi-host': '${host}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    // Add your request body here
  })
};

try {
  const response = await fetch(url, options);
  const result = await response.text();
  console.log(result);
} catch (error) {
  console.error(error);
}`;
  }
}

// Main execution
const harFilePath = process.argv[2] || '/Users/linkpellow/Documents/rapidapi.com-2025-12-15T03-05-29.json';

if (!fs.existsSync(harFilePath)) {
  console.error(`File not found: ${harFilePath}`);
  process.exit(1);
}

console.log(`📂 Reading HAR file: ${harFilePath}`);
const endpoints = extractEndpointsFromHAR(harFilePath);

console.log(`\n✅ Found ${endpoints.length} unique RapidAPI endpoints\n`);

// Generate code snippets
endpoints.forEach((endpoint, idx) => {
  endpoint.codeSnippet = generateCodeSnippet(endpoint);
});

// Save to JSON file
const outputPath = path.join(process.cwd(), 'data', 'rapidapi-endpoints.json');
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(outputPath, JSON.stringify(endpoints, null, 2));
console.log(`💾 Saved to: ${outputPath}\n`);

// Print summary
console.log('📋 Endpoints Summary:');
endpoints.forEach((endpoint, idx) => {
  console.log(`\n${idx + 1}. ${endpoint.name}`);
  console.log(`   Method: ${endpoint.method}`);
  console.log(`   Host: ${endpoint.host}`);
  console.log(`   Path: ${endpoint.path}`);
  console.log(`   Target: ${endpoint.target}`);
  console.log(`   Client: ${endpoint.client}`);
});

// Generate a consolidated code file
const codeOutputPath = path.join(process.cwd(), 'data', 'rapidapi-endpoints-code.ts');
const codeContent = endpoints.map((endpoint, idx) => {
  return `// ${endpoint.name}\n// ${endpoint.method} ${endpoint.path}\n${endpoint.codeSnippet}\n`;
}).join('\n\n');

fs.writeFileSync(codeOutputPath, codeContent);
console.log(`\n💾 Code snippets saved to: ${codeOutputPath}`);
