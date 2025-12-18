/**
 * Trigger Token Refresh to Capture Refresh Endpoint
 * 
 * This script attempts to trigger a token refresh in the USHA application
 * so we can capture the refresh endpoint and refresh_token.
 */

(function() {
  'use strict';
  
  const refreshCapture = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    attempts: [],
    capturedRequests: [],
    refreshToken: null,
    refreshEndpoint: null
  };

  console.log('🔄 Attempting to Trigger Token Refresh...\n');

  // Intercept ALL fetch requests
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    const options = args[1] || {};
    
    // Capture any token-related requests
    const urlLower = url.toLowerCase();
    if (urlLower.includes('token') || urlLower.includes('refresh') || urlLower.includes('auth')) {
      let body = null;
      if (options.body) {
        try {
          body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        } catch (e) {
          body = options.body.toString();
        }
      }
      
      const requestData = {
        url: url,
        method: options.method || 'GET',
        headers: options.headers || {},
        body: body,
        timestamp: new Date().toISOString()
      };
      
      refreshCapture.capturedRequests.push(requestData);
      
      // Check if this is a refresh request
      if (body && (body.refresh_token || body.grant_type === 'refresh_token')) {
        refreshCapture.refreshEndpoint = url;
        if (body.refresh_token) {
          refreshCapture.refreshToken = body.refresh_token;
        }
      }
      
      // Capture response
      return originalFetch.apply(this, args).then(async (response) => {
        if (response.ok) {
          try {
            const data = await response.clone().json();
            if (data.refresh_token) {
              refreshCapture.refreshToken = data.refresh_token;
            }
            if (data.access_token) {
              requestData.response = {
                access_token: data.access_token ? data.access_token.substring(0, 50) + '...' : null,
                refresh_token: data.refresh_token ? 'Found' : null,
                expires_in: data.expires_in
              };
            }
          } catch (e) {
            // Not JSON
          }
        }
        return response;
      });
    }
    
    return originalFetch.apply(this, args);
  };

  // Method 1: Try to find and call refresh endpoint directly
  console.log('📋 Method 1: Searching for refresh endpoints in application code...');
  
  // Check if there's an API service or auth service
  try {
    if (window.api || window.auth || window.authService) {
      const services = [window.api, window.auth, window.authService].filter(Boolean);
      services.forEach(service => {
        if (service.refreshToken || service.refresh || service.refreshTokenAsync) {
          console.log('✅ Found refresh method in service');
          refreshCapture.attempts.push({
            method: 'service_method',
            service: service.constructor.name
          });
        }
      });
    }
  } catch (e) {
    // Ignore
  }

  // Method 2: Try common refresh endpoints
  console.log('📋 Method 2: Attempting common refresh endpoints...');
  
  const commonRefreshEndpoints = [
    'https://agent.ushadvisors.com/connect/token',
    'https://agent.ushadvisors.com/api/token/refresh',
    'https://agent.ushadvisors.com/api/token',
    'https://api-business-agent.ushadvisors.com/connect/token',
    'https://api-business-agent.ushadvisors.com/api/token/refresh'
  ];

  // Get current token
  let currentToken = null;
  try {
    const userData = localStorage.getItem('user');
    if (userData) {
      const parsed = JSON.parse(userData);
      currentToken = parsed.access_token;
    }
  } catch (e) {
    // Ignore
  }

  // Try to extract refresh_token from current session
  try {
    const userData = localStorage.getItem('user');
    if (userData) {
      const parsed = JSON.parse(userData);
      if (parsed.refresh_token) {
        refreshCapture.refreshToken = parsed.refresh_token;
        console.log('✅ Refresh token found in user data!');
      }
    }
  } catch (e) {
    // Ignore
  }

  // Method 3: Monitor for automatic refresh
  console.log('📋 Method 3: Monitoring for automatic token refresh...');
  console.log('   The application may automatically refresh tokens.');
  console.log('   Keep this script running and perform actions in the app.\n');

  // Method 4: Try to decode current token and check for refresh hints
  if (currentToken) {
    try {
      const parts = currentToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        console.log('📋 Current Token Info:');
        console.log(`   Issuer: ${payload.iss}`);
        console.log(`   Audience: ${payload.aud}`);
        console.log(`   Expires: ${new Date(payload.exp * 1000).toISOString()}`);
        console.log(`   User: ${payload.Email || payload.unique_name}\n`);
        
        // The issuer is localhost:51370 - this might be a local auth server
        // Try to construct potential refresh endpoint
        if (payload.iss && payload.iss.includes('localhost')) {
          const baseUrl = payload.iss.replace('http://', 'https://').replace(':51370', '');
          refreshCapture.attempts.push({
            method: 'deduced_from_token',
            potentialEndpoint: `${baseUrl}/connect/token`
          });
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  // Save to window
  window.__refreshCapture = refreshCapture;

  // Display results
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 TOKEN REFRESH CAPTURE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (refreshCapture.refreshToken) {
    console.log('✅ Refresh Token Found:');
    console.log(`   ${refreshCapture.refreshToken.substring(0, 80)}...\n`);
  } else {
    console.log('⚠️  No refresh token found yet.');
    console.log('   The script is monitoring network requests.\n');
  }

  if (refreshCapture.refreshEndpoint) {
    console.log('✅ Refresh Endpoint Found:');
    console.log(`   ${refreshCapture.refreshEndpoint}\n`);
  }

  if (refreshCapture.capturedRequests.length > 0) {
    console.log(`📡 Captured ${refreshCapture.capturedRequests.length} token-related requests`);
    refreshCapture.capturedRequests.forEach((req, i) => {
      console.log(`\n${i + 1}. ${req.method} ${req.url}`);
      if (req.body) {
        console.log(`   Body:`, JSON.stringify(req.body, null, 2).substring(0, 200));
      }
      if (req.response) {
        console.log(`   Response:`, JSON.stringify(req.response, null, 2));
      }
    });
  }

  console.log('\n💡 Next Steps:');
  console.log('   1. Perform actions in the app that might trigger token refresh');
  console.log('   2. Wait for automatic refresh (if app does it)');
  console.log('   3. Check window.__refreshCapture for captured data');
  console.log('   4. Access full data: JSON.stringify(window.__refreshCapture, null, 2)\n');

  return refreshCapture;
})();
