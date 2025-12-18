/**
 * HAR File Credential Harvester
 * 
 * Extracts all tokens, secrets, and credentials from HAR (HTTP Archive) files
 * captured from browser network traffic.
 * 
 * Usage:
 *   npx tsx scripts/harvest-credentials-har.ts [har-file-path]
 * 
 * Or with default path:
 *   npx tsx scripts/harvest-credentials-har.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface HarEntry {
  request: {
    method: string;
    url: string;
    headers: Array<{ name: string; value: string }>;
    cookies: Array<{ name: string; value: string }>;
    postData?: {
      text?: string;
      mimeType?: string;
    };
    queryString?: Array<{ name: string; value: string }>;
  };
  response: {
    status: number;
    headers: Array<{ name: string; value: string }>;
    content?: {
      text?: string;
      mimeType?: string;
    };
    cookies?: Array<{ name: string; value: string }>;
  };
}

interface HarFile {
  log: {
    entries: HarEntry[];
  };
}

interface Credential {
  source: string;
  type: string;
  key: string;
  value: string;
  url: string;
  method: string;
  timestamp?: string;
}

interface HarvestResults {
  timestamp: string;
  harFile: string;
  totalEntries: number;
  credentials: Credential[];
  tokens: Credential[];
  apiKeys: Credential[];
  cookies: Credential[];
  summary: {
    uniqueTokens: number;
    uniqueApiKeys: number;
    uniqueCookies: number;
    ushaApiCalls: number;
    rapidApiCalls: number;
  };
}

function extractCredentialsFromHAR(harPath: string): HarvestResults {
  console.log(`\n🔍 Parsing HAR file: ${harPath}\n`);

  if (!fs.existsSync(harPath)) {
    console.error(`❌ File not found: ${harPath}`);
    process.exit(1);
  }

  const harContent = fs.readFileSync(harPath, 'utf-8');
  const har: HarFile = JSON.parse(harContent);

  const credentials: Credential[] = [];
  const tokens: Credential[] = [];
  const apiKeys: Credential[] = [];
  const cookies: Credential[] = [];

  let ushaApiCalls = 0;
  let rapidApiCalls = 0;

  console.log(`📊 Total entries in HAR: ${har.log.entries.length}\n`);

  har.log.entries.forEach((entry, index) => {
    const url = entry.request.url;
    const method = entry.request.method;

    // Track API calls
    if (url.includes('ushadvisors.com')) ushaApiCalls++;
    if (url.includes('rapidapi.com')) rapidApiCalls++;

    // Extract from request headers
    entry.request.headers.forEach(header => {
      const name = header.name.toLowerCase();
      const value = header.value;

      // Authorization tokens
      if (name === 'authorization' || name === 'x-authorization') {
        const token = value.replace(/^Bearer\s+/i, '').replace(/^Token\s+/i, '');
        if (token && token.length > 10) {
          const cred: Credential = {
            source: 'request_header',
            type: 'bearer_token',
            key: header.name,
            value: token,
            url: url,
            method: method
          };
          credentials.push(cred);
          tokens.push(cred);
        }
      }

      // API Keys
      if (name.includes('api-key') || name.includes('apikey') || name === 'x-rapidapi-key' || name === 'x-api-key') {
        const cred: Credential = {
          source: 'request_header',
          type: 'api_key',
          key: header.name,
          value: value,
          url: url,
          method: method
        };
        credentials.push(cred);
        apiKeys.push(cred);
      }

      // Other token-like headers
      if ((name.includes('token') || name.includes('auth') || name.includes('secret')) && 
          value.length > 10) {
        const cred: Credential = {
          source: 'request_header',
          type: 'token',
          key: header.name,
          value: value,
          url: url,
          method: method
        };
        credentials.push(cred);
        if (!tokens.some(t => t.value === value)) {
          tokens.push(cred);
        }
      }
    });

    // Extract from request cookies
    if (entry.request.cookies) {
      entry.request.cookies.forEach(cookie => {
        const name = cookie.name.toLowerCase();
        if (name.includes('token') || name.includes('auth') || name.includes('session') || 
            name.includes('jwt') || name.includes('secret')) {
          const cred: Credential = {
            source: 'request_cookie',
            type: 'cookie',
            key: cookie.name,
            value: cookie.value,
            url: url,
            method: method
          };
          credentials.push(cred);
          cookies.push(cred);
        }
      });
    }

    // Extract from query parameters
    if (entry.request.queryString) {
      entry.request.queryString.forEach(param => {
        const name = param.name.toLowerCase();
        if ((name.includes('token') || name.includes('key') || name.includes('auth') || 
             name.includes('secret') || name === 'api_key') && param.value.length > 10) {
          const cred: Credential = {
            source: 'query_parameter',
            type: 'api_key',
            key: param.name,
            value: param.value,
            url: url,
            method: method
          };
          credentials.push(cred);
          apiKeys.push(cred);
        }
      });
    }

    // Extract from request body (JSON)
    if (entry.request.postData?.text) {
      try {
        const body = JSON.parse(entry.request.postData.text);
        Object.keys(body).forEach(key => {
          const keyLower = key.toLowerCase();
          if ((keyLower.includes('token') || keyLower.includes('key') || 
               keyLower.includes('auth') || keyLower.includes('secret') || 
               keyLower.includes('credential')) && 
              typeof body[key] === 'string' && body[key].length > 10) {
            const cred: Credential = {
              source: 'request_body',
              type: 'token',
              key: key,
              value: body[key],
              url: url,
              method: method
            };
            credentials.push(cred);
            if (!tokens.some(t => t.value === body[key])) {
              tokens.push(cred);
            }
          }
        });
      } catch (e) {
        // Not JSON, try to find tokens in text
        const text = entry.request.postData.text;
        const tokenPatterns = [
          /"token"\s*:\s*"([^"]+)"/gi,
          /"api[_-]?key"\s*:\s*"([^"]+)"/gi,
          /"authorization"\s*:\s*"([^"]+)"/gi,
          /Bearer\s+([A-Za-z0-9\-_\.]+)/gi
        ];
        
        tokenPatterns.forEach(pattern => {
          const matches = text.matchAll(pattern);
          for (const match of matches) {
            if (match[1] && match[1].length > 10) {
              const cred: Credential = {
                source: 'request_body',
                type: 'token',
                key: 'extracted',
                value: match[1],
                url: url,
                method: method
              };
              if (!tokens.some(t => t.value === match[1])) {
                credentials.push(cred);
                tokens.push(cred);
              }
            }
          }
        });
      }
    }

    // Extract from response headers
    entry.response.headers.forEach(header => {
      const name = header.name.toLowerCase();
      if ((name.includes('token') || name.includes('auth') || name.includes('set-cookie')) && 
          header.value.length > 10) {
        const cred: Credential = {
          source: 'response_header',
          type: 'token',
          key: header.name,
          value: header.value,
          url: url,
          method: method
        };
        credentials.push(cred);
        if (!tokens.some(t => t.value === header.value)) {
          tokens.push(cred);
        }
      }
    });

    // Extract from response body (JSON)
    if (entry.response.content?.text && entry.response.content.mimeType?.includes('json')) {
      try {
        const body = JSON.parse(entry.response.content.text);
        
        // Recursively search for tokens in response
        function searchForTokens(obj: any, path: string = ''): void {
          if (typeof obj === 'object' && obj !== null) {
            Object.keys(obj).forEach(key => {
              const keyLower = key.toLowerCase();
              const value = obj[key];
              const currentPath = path ? `${path}.${key}` : key;
              
              if (typeof value === 'string' && value.length > 10) {
                if (keyLower.includes('token') || keyLower.includes('jwt') || 
                    keyLower.includes('auth') || keyLower.includes('secret') ||
                    keyLower.includes('key') || keyLower === 'data') {
                  // Check if it looks like a JWT token
                  if (value.split('.').length === 3 || keyLower.includes('token')) {
                    const cred: Credential = {
                      source: 'response_body',
                      type: 'token',
                      key: currentPath,
                      value: value,
                      url: url,
                      method: method
                    };
                    if (!tokens.some(t => t.value === value)) {
                      credentials.push(cred);
                      tokens.push(cred);
                    }
                  }
                }
              } else if (typeof value === 'object') {
                searchForTokens(value, currentPath);
              }
            });
          }
        }
        
        searchForTokens(body);
      } catch (e) {
        // Not JSON or parse error
      }
    }
  });

  // Remove duplicates
  const uniqueTokens = Array.from(new Map(tokens.map(t => [t.value, t])).values());
  const uniqueApiKeys = Array.from(new Map(apiKeys.map(k => [k.value, k])).values());
  const uniqueCookies = Array.from(new Map(cookies.map(c => [c.value, c])).values());

  const results: HarvestResults = {
    timestamp: new Date().toISOString(),
    harFile: harPath,
    totalEntries: har.log.entries.length,
    credentials: credentials,
    tokens: uniqueTokens,
    apiKeys: uniqueApiKeys,
    cookies: uniqueCookies,
    summary: {
      uniqueTokens: uniqueTokens.length,
      uniqueApiKeys: uniqueApiKeys.length,
      uniqueCookies: uniqueCookies.length,
      ushaApiCalls: ushaApiCalls,
      rapidApiCalls: rapidApiCalls,
    }
  };

  return results;
}

function displayResults(results: HarvestResults): void {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 HARVEST SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`Total HAR entries: ${results.totalEntries}`);
  console.log(`USHA API calls: ${results.summary.ushaApiCalls}`);
  console.log(`RapidAPI calls: ${results.summary.rapidApiCalls}`);
  console.log(`\nTotal credentials found: ${results.credentials.length}`);
  console.log(`Unique tokens: ${results.summary.uniqueTokens}`);
  console.log(`Unique API keys: ${results.summary.uniqueApiKeys}`);
  console.log(`Unique cookies: ${results.summary.uniqueCookies}`);

  if (results.tokens.length > 0) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔑 TOKENS FOUND');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    results.tokens.forEach((token, index) => {
      console.log(`\nToken ${index + 1}:`);
      console.log(`  Source: ${token.source}`);
      console.log(`  Type: ${token.type}`);
      console.log(`  Key: ${token.key}`);
      console.log(`  Method: ${token.method}`);
      console.log(`  URL: ${token.url.substring(0, 80)}${token.url.length > 80 ? '...' : ''}`);
      console.log(`  Value: ${token.value.substring(0, 100)}${token.value.length > 100 ? '...' : ''}`);
      
      // Try to decode JWT if it looks like one
      if (token.value.split('.').length === 3) {
        try {
          const parts = token.value.split('.');
          const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
          console.log(`  JWT Header:`, JSON.stringify(header));
          console.log(`  JWT Payload (expires: ${payload.exp ? new Date(payload.exp * 1000).toISOString() : 'N/A'}):`, 
                     JSON.stringify(payload, null, 2).substring(0, 300));
        } catch (e) {
          // Not a valid JWT
        }
      }
    });
  }

  if (results.apiKeys.length > 0) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 API KEYS FOUND');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    results.apiKeys.forEach((key, index) => {
      console.log(`\nAPI Key ${index + 1}:`);
      console.log(`  Source: ${key.source}`);
      console.log(`  Key: ${key.key}`);
      console.log(`  Method: ${key.method}`);
      console.log(`  URL: ${key.url.substring(0, 80)}${key.url.length > 80 ? '...' : ''}`);
      console.log(`  Value: ${key.value.substring(0, 50)}...`);
    });
  }

  if (results.cookies.length > 0) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🍪 COOKIES FOUND');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    results.cookies.forEach((cookie, index) => {
      console.log(`\nCookie ${index + 1}:`);
      console.log(`  Name: ${cookie.key}`);
      console.log(`  Value: ${cookie.value.substring(0, 100)}${cookie.value.length > 100 ? '...' : ''}`);
      console.log(`  URL: ${cookie.url.substring(0, 80)}${cookie.url.length > 80 ? '...' : ''}`);
    });
  }
}

// Main execution
const harPath = process.argv[2] || path.join(process.cwd(), 'utils/brainscraper.io.har');

if (!harPath) {
  console.error('Usage: npx tsx scripts/harvest-credentials-har.ts [har-file-path]');
  process.exit(1);
}

const results = extractCredentialsFromHAR(harPath);
displayResults(results);

// Save results to file
const outputPath = path.join(process.cwd(), 'harvested-credentials.json');
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
console.log(`\n💾 Full results saved to: ${outputPath}`);

// Also save just tokens for easy access
const tokensPath = path.join(process.cwd(), 'harvested-tokens.json');
fs.writeFileSync(tokensPath, JSON.stringify({
  timestamp: results.timestamp,
  tokens: results.tokens.map(t => ({
    type: t.type,
    value: t.value,
    source: t.source,
    url: t.url
  }))
}, null, 2));
console.log(`💾 Tokens saved to: ${tokensPath}\n`);
