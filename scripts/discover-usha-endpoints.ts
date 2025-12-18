/**
 * Discover USHA Authentication Endpoints
 * 
 * This script analyzes the HAR file and extracted credentials to discover
 * the actual USHA authentication endpoints for direct integration.
 */

import * as fs from 'fs';
import * as path from 'path';

interface AuthEndpoint {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
  response?: any;
}

interface DiscoveryResults {
  timestamp: string;
  loginEndpoints: AuthEndpoint[];
  tokenEndpoints: AuthEndpoint[];
  refreshEndpoints: AuthEndpoint[];
  recommendedAuthMethod: string;
  recommendedEndpoint: string;
  credentialsFound: {
    hasUsernamePassword: boolean;
    hasClientCredentials: boolean;
    hasRefreshToken: boolean;
  };
}

function discoverEndpoints(harPath?: string): DiscoveryResults {
  const harFile = harPath || path.join(process.cwd(), 'utils/brainscraper.io.har');
  
  const results: DiscoveryResults = {
    timestamp: new Date().toISOString(),
    loginEndpoints: [],
    tokenEndpoints: [],
    refreshEndpoints: [],
    recommendedAuthMethod: 'unknown',
    recommendedEndpoint: '',
    credentialsFound: {
      hasUsernamePassword: false,
      hasClientCredentials: false,
      hasRefreshToken: false
    }
  };

  // Check environment variables
  if (process.env.USHA_USERNAME && process.env.USHA_PASSWORD) {
    results.credentialsFound.hasUsernamePassword = true;
  }
  
  if (process.env.USHA_CLIENT_ID && process.env.USHA_CLIENT_SECRET) {
    results.credentialsFound.hasClientCredentials = true;
  }

  // Analyze HAR file if it exists
  if (fs.existsSync(harFile)) {
    try {
      const harContent = fs.readFileSync(harFile, 'utf-8');
      const har = JSON.parse(harContent);

      har.log.entries.forEach((entry: any) => {
        const url = entry.request.url.toLowerCase();
        const method = entry.request.method;

        // Find login endpoints
        if (url.includes('login') || url.includes('signin') || url.includes('account/login')) {
          const headers: Record<string, string> = {};
          entry.request.headers?.forEach((h: any) => {
            headers[h.name] = h.value;
          });

          let body = null;
          if (entry.request.postData?.text) {
            try {
              body = JSON.parse(entry.request.postData.text);
            } catch (e) {
              body = entry.request.postData.text;
            }
          }

          results.loginEndpoints.push({
            url: entry.request.url,
            method: method,
            headers: headers,
            body: body
          });
        }

        // Find token endpoints
        if (url.includes('token') || url.includes('oauth') || url.includes('connect/token')) {
          const headers: Record<string, string> = {};
          entry.request.headers?.forEach((h: any) => {
            headers[h.name] = h.value;
          });

          let body = null;
          if (entry.request.postData?.text) {
            try {
              body = JSON.parse(entry.request.postData.text);
            } catch (e) {
              body = entry.request.postData.text;
            }
          }

          // Check response for token structure
          let response = null;
          if (entry.response.content?.text) {
            try {
              response = JSON.parse(entry.response.content.text);
              if (response.refresh_token) {
                results.credentialsFound.hasRefreshToken = true;
              }
            } catch (e) {
              // Not JSON
            }
          }

          results.tokenEndpoints.push({
            url: entry.request.url,
            method: method,
            headers: headers,
            body: body,
            response: response
          });
        }

        // Find refresh endpoints
        if (url.includes('refresh') || url.includes('token/refresh')) {
          const headers: Record<string, string> = {};
          entry.request.headers?.forEach((h: any) => {
            headers[h.name] = h.value;
          });

          let body = null;
          if (entry.request.postData?.text) {
            try {
              body = JSON.parse(entry.request.postData.text);
            } catch (e) {
              body = entry.request.postData.text;
            }
          }

          results.refreshEndpoints.push({
            url: entry.request.url,
            method: method,
            headers: headers,
            body: body
          });
        }
      });
    } catch (e) {
      console.error('Error parsing HAR file:', e);
    }
  }

  // Determine recommended auth method
  if (results.credentialsFound.hasClientCredentials) {
    results.recommendedAuthMethod = 'client_credentials';
    const tokenEndpoint = results.tokenEndpoints.find(e => 
      e.url.includes('connect/token') || e.url.includes('api/token')
    );
    if (tokenEndpoint) {
      results.recommendedEndpoint = tokenEndpoint.url;
    }
  } else if (results.credentialsFound.hasUsernamePassword) {
    results.recommendedAuthMethod = 'password';
    const loginEndpoint = results.loginEndpoints[0];
    if (loginEndpoint) {
      results.recommendedEndpoint = loginEndpoint.url;
    }
  } else if (results.credentialsFound.hasRefreshToken) {
    results.recommendedAuthMethod = 'refresh_token';
    const refreshEndpoint = results.refreshEndpoints[0];
    if (refreshEndpoint) {
      results.recommendedEndpoint = refreshEndpoint.url;
    }
  }

  return results;
}

function displayResults(results: DiscoveryResults): void {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 USHA AUTHENTICATION ENDPOINT DISCOVERY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('📋 Credentials Available:');
  console.log(`   Username/Password: ${results.credentialsFound.hasUsernamePassword ? '✅' : '❌'}`);
  console.log(`   Client Credentials: ${results.credentialsFound.hasClientCredentials ? '✅' : '❌'}`);
  console.log(`   Refresh Token: ${results.credentialsFound.hasRefreshToken ? '✅' : '❌'}\n`);

  console.log(`🔐 Login Endpoints Found: ${results.loginEndpoints.length}`);
  results.loginEndpoints.forEach((endpoint, i) => {
    console.log(`\n${i + 1}. ${endpoint.method} ${endpoint.url}`);
    if (endpoint.body) {
      console.log(`   Body:`, JSON.stringify(endpoint.body, null, 2).substring(0, 200));
    }
  });

  console.log(`\n🎫 Token Endpoints Found: ${results.tokenEndpoints.length}`);
  results.tokenEndpoints.forEach((endpoint, i) => {
    console.log(`\n${i + 1}. ${endpoint.method} ${endpoint.url}`);
    if (endpoint.body) {
      console.log(`   Body:`, JSON.stringify(endpoint.body, null, 2).substring(0, 200));
    }
    if (endpoint.response?.access_token) {
      console.log(`   ✅ Response contains access_token`);
    }
    if (endpoint.response?.refresh_token) {
      console.log(`   ✅ Response contains refresh_token`);
    }
  });

  console.log(`\n🔄 Refresh Endpoints Found: ${results.refreshEndpoints.length}`);
  results.refreshEndpoints.forEach((endpoint, i) => {
    console.log(`\n${i + 1}. ${endpoint.method} ${endpoint.url}`);
    if (endpoint.body) {
      console.log(`   Body:`, JSON.stringify(endpoint.body, null, 2).substring(0, 200));
    }
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 RECOMMENDATIONS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (results.recommendedAuthMethod !== 'unknown') {
    console.log(`Recommended Auth Method: ${results.recommendedAuthMethod}`);
    if (results.recommendedEndpoint) {
      console.log(`Recommended Endpoint: ${results.recommendedEndpoint}\n`);
    }
  } else {
    console.log('⚠️  No authentication method could be determined automatically.');
    console.log('   Please run the browser extraction script to capture auth flow.\n');
  }

  console.log('📝 Next Steps:');
  if (!results.credentialsFound.hasClientCredentials && !results.credentialsFound.hasUsernamePassword) {
    console.log('  1. Extract credentials from browser console using:');
    console.log('     scripts/extract-usha-auth-flow.js');
    console.log('  2. Set environment variables:');
    console.log('     USHA_USERNAME and USHA_PASSWORD');
    console.log('     OR');
    console.log('     USHA_CLIENT_ID and USHA_CLIENT_SECRET');
  } else {
    console.log('  ✅ Credentials found! Direct authentication is ready.');
    console.log('  The system will automatically use direct authentication.');
  }
}

// Main execution
const harPath = process.argv[2];
const results = discoverEndpoints(harPath);
displayResults(results);

// Save results
const outputPath = path.join(process.cwd(), 'usha-auth-discovery.json');
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
console.log(`\n💾 Discovery results saved to: ${outputPath}\n`);
