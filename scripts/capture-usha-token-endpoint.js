/**
 * Capture the endpoint that returns USHA JWT token after Cognito auth
 * 
 * Run this in browser console on agent.ushadvisors.com
 * Then perform a login/refresh action
 */

(function() {
  'use strict';
  
  const capturedRequests = [];
  const tokenEndpoints = [];

  console.log('🔍 Starting USHA Token Endpoint Capture...');
  console.log('   Perform a login or token refresh action now...\n');

  // Intercept fetch requests
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    const options = args[1] || {};
    
    // Capture all requests to USHA domains
    if (typeof url === 'string' && (
      url.includes('ushadvisors.com') || 
      url.includes('tampausha.com') ||
      url.includes('localhost:51370')
    )) {
      const requestInfo = {
        url: url,
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body || null,
        timestamp: new Date().toISOString()
      };
      
      capturedRequests.push(requestInfo);
      
      // If this looks like a token request, capture the response
      if (url.includes('token') || url.includes('auth') || url.includes('login') || 
          (options.body && typeof options.body === 'string' && (options.body.includes('token') || options.body.includes('cognito')))) {
        
        return originalFetch.apply(this, args).then(async (response) => {
          if (response.ok) {
            try {
              const clonedResponse = response.clone();
              const data = await clonedResponse.json();
              
              // Check if response contains a token
              if (data.token || data.access_token || data.jwt_token || data.accessToken || data.jwtToken) {
                const token = data.token || data.access_token || data.jwt_token || data.accessToken || data.jwtToken;
                
                // Check if it's a USHA JWT (has the localhost:51370 issuer)
                try {
                  const parts = token.split('.');
                  if (parts.length === 3) {
                    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                    if (payload.iss && payload.iss.includes('localhost:51370')) {
                      tokenEndpoints.push({
                        endpoint: url,
                        method: requestInfo.method,
                        headers: requestInfo.headers,
                        body: requestInfo.body,
                        response: {
                          token: token,
                          tokenPreview: token.substring(0, 50) + '...',
                          payload: payload
                        },
                        timestamp: requestInfo.timestamp
                      });
                      
                      console.log('\n✅ USHA JWT TOKEN ENDPOINT FOUND!');
                      console.log(`   Endpoint: ${requestInfo.method} ${url}`);
                      console.log(`   Token: ${token.substring(0, 50)}...`);
                      console.log(`   Issuer: ${payload.iss}`);
                    }
                  }
                } catch (e) {
                  // Not a JWT or couldn't decode
                }
              }
            } catch (e) {
              // Not JSON
            }
          }
          return response;
        });
      }
    }
    
    return originalFetch.apply(this, args);
  };

  // Save to window
  window.__ushaTokenCapture = {
    requests: capturedRequests,
    tokenEndpoints: tokenEndpoints,
    getResults: function() {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📊 CAPTURE RESULTS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      if (tokenEndpoints.length > 0) {
        console.log('✅ USHA JWT Token Endpoints Found:');
        tokenEndpoints.forEach((endpoint, i) => {
          console.log(`\n${i + 1}. ${endpoint.method} ${endpoint.endpoint}`);
          console.log(`   Headers:`, JSON.stringify(endpoint.headers, null, 2));
          if (endpoint.body) {
            console.log(`   Body:`, typeof endpoint.body === 'string' ? endpoint.body.substring(0, 200) : JSON.stringify(endpoint.body, null, 2));
          }
          console.log(`   Token Issuer: ${endpoint.response.payload.iss}`);
        });
      } else {
        console.log('⚠️  No USHA JWT token endpoints found yet.');
        console.log('   Try logging in or refreshing the page.');
      }
      
      console.log(`\n📋 Total requests captured: ${capturedRequests.length}`);
      console.log('\n💡 Access data via: window.__ushaTokenCapture');
      
      return { tokenEndpoints, totalRequests: capturedRequests.length };
    }
  };

  console.log('✅ Capture script active. Now:');
  console.log('   1. Refresh the page or log in');
  console.log('   2. Run: window.__ushaTokenCapture.getResults()');
  console.log('   3. Share the endpoint URL that returns the USHA JWT token\n');
})();

