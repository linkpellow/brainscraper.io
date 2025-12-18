/**
 * Extract Refresh Token from USHA Console
 * 
 * Run this in browser console to find refresh token endpoints and tokens
 */

(function() {
  'use strict';
  
  const refreshData = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    refreshToken: null,
    refreshEndpoints: [],
    tokenInfo: {}
  };

  console.log('🔍 Extracting Refresh Token Information...\n');

  // 1. Check localStorage for refresh token
  try {
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        if (parsed.refresh_token) {
          refreshData.refreshToken = parsed.refresh_token;
          refreshData.tokenInfo = {
            access_token: parsed.access_token,
            token_type: parsed.token_type,
            expires_in: parsed.expires_in,
            refresh_token: parsed.refresh_token
          };
          console.log('✅ Refresh token found in localStorage!');
        }
      } catch (e) {
        // Not JSON
      }
    }
  } catch (e) {
    console.warn('⚠️ localStorage access denied');
  }

  // 2. Intercept refresh token requests
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    const options = args[1] || {};
    
    if (url.toLowerCase().includes('refresh') || 
        url.toLowerCase().includes('token') ||
        (options.body && typeof options.body === 'string' && options.body.includes('refresh_token'))) {
      
      let body = null;
      if (options.body) {
        try {
          body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        } catch (e) {
          body = options.body.toString();
        }
      }
      
      refreshData.refreshEndpoints.push({
        url: url,
        method: options.method || 'POST',
        headers: options.headers || {},
        body: body,
        timestamp: new Date().toISOString()
      });
      
      // If this is a refresh request, capture the response
      return originalFetch.apply(this, args).then(async (response) => {
        if (response.ok) {
          try {
            const data = await response.clone().json();
            if (data.access_token || data.refresh_token) {
              refreshData.tokenInfo = {
                ...refreshData.tokenInfo,
                ...data
              };
              if (data.refresh_token) {
                refreshData.refreshToken = data.refresh_token;
              }
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

  // 3. Monitor for token refresh in XHR
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(data) {
    const url = (this._url || '').toLowerCase();
    if (url.includes('refresh') || url.includes('token')) {
      let body = null;
      if (data) {
        try {
          body = typeof data === 'string' ? JSON.parse(data) : data;
        } catch (e) {
          body = data.toString();
        }
      }
      
      refreshData.refreshEndpoints.push({
        url: this._url,
        method: this._method || 'POST',
        body: body,
        timestamp: new Date().toISOString()
      });
    }
    return originalSend.apply(this, arguments);
  };

  // Save to window
  window.__ushaRefreshData = refreshData;

  // Display results
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 REFRESH TOKEN EXTRACTION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (refreshData.refreshToken) {
    console.log('✅ Refresh Token Found:');
    console.log(`   Token: ${refreshData.refreshToken.substring(0, 50)}...`);
    console.log(`   Full Token: ${refreshData.refreshToken}\n`);
  } else {
    console.log('⚠️  No refresh token found in localStorage');
    console.log('   The script will monitor for refresh token requests...\n');
  }

  if (refreshData.refreshEndpoints.length > 0) {
    console.log(`📡 Refresh Endpoints Captured: ${refreshData.refreshEndpoints.length}`);
    refreshData.refreshEndpoints.forEach((endpoint, i) => {
      console.log(`\n${i + 1}. ${endpoint.method} ${endpoint.url}`);
      if (endpoint.body) {
        console.log(`   Body:`, JSON.stringify(endpoint.body, null, 2).substring(0, 200));
      }
    });
  }

  if (Object.keys(refreshData.tokenInfo).length > 0) {
    console.log('\n📋 Token Information:');
    console.log(JSON.stringify(refreshData.tokenInfo, null, 2));
  }

  // Copy to clipboard (with error handling)
  try {
    const jsonString = JSON.stringify(refreshData, null, 2);
    if (document.hasFocus()) {
      navigator.clipboard.writeText(jsonString).then(() => {
        console.log('\n✅ Refresh token data copied to clipboard!');
      }).catch(() => {
        console.log('\n📋 Refresh token data (click to focus window, then copy):');
        console.log(jsonString);
      });
    } else {
      console.log('\n📋 Refresh token data (click window to focus, then copy):');
      console.log(jsonString);
    }
  } catch (e) {
    console.log('\n📋 Refresh token data:');
    console.log(JSON.stringify(refreshData, null, 2));
  }

  console.log('\n💡 Access data via: window.__ushaRefreshData');
  console.log('\n⚠️  IMPORTANT: If no refresh token found, trigger a token refresh');
  console.log('   in the application to capture the refresh endpoint and token.\n');

  return refreshData;
})();
