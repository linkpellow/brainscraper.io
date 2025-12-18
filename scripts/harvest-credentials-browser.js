/**
 * Browser Console Credential Harvester
 * 
 * Copy and paste this entire script into the browser console on tampausha/ushadvisors.com
 * to extract all tokens, secrets, and credentials from:
 * - localStorage
 * - sessionStorage
 * - Cookies
 * - Network requests (via Performance API)
 * - Window objects
 * 
 * Usage:
 * 1. Open tampausha console (F12 or Cmd+Option+I)
 * 2. Go to Console tab
 * 3. Paste this entire script
 * 4. Press Enter
 * 5. Results will be displayed and copied to clipboard
 */

(function() {
  'use strict';
  
  const results = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    localStorage: {},
    sessionStorage: {},
    cookies: {},
    networkRequests: [],
    windowSecrets: {},
    headers: {},
    tokens: []
  };

  console.log('🔍 Starting credential harvest...\n');

  // 1. Extract from localStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      if (key && value) {
        results.localStorage[key] = value;
        
        // Check if it's a token/credential
        if (key.toLowerCase().includes('token') || 
            key.toLowerCase().includes('auth') ||
            key.toLowerCase().includes('jwt') ||
            key.toLowerCase().includes('secret') ||
            key.toLowerCase().includes('key') ||
            key.toLowerCase().includes('credential')) {
          results.tokens.push({
            source: 'localStorage',
            key: key,
            value: value,
            type: 'localStorage'
          });
        }
      }
    }
    console.log(`✅ localStorage: ${Object.keys(results.localStorage).length} items`);
  } catch (e) {
    console.warn('⚠️ localStorage access denied:', e);
  }

  // 2. Extract from sessionStorage
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      const value = sessionStorage.getItem(key);
      if (key && value) {
        results.sessionStorage[key] = value;
        
        // Check if it's a token/credential
        if (key.toLowerCase().includes('token') || 
            key.toLowerCase().includes('auth') ||
            key.toLowerCase().includes('jwt') ||
            key.toLowerCase().includes('secret') ||
            key.toLowerCase().includes('key') ||
            key.toLowerCase().includes('credential')) {
          results.tokens.push({
            source: 'sessionStorage',
            key: key,
            value: value,
            type: 'sessionStorage'
          });
        }
      }
    }
    console.log(`✅ sessionStorage: ${Object.keys(results.sessionStorage).length} items`);
  } catch (e) {
    console.warn('⚠️ sessionStorage access denied:', e);
  }

  // 3. Extract cookies
  try {
    const cookies = document.cookie.split(';');
    cookies.forEach(cookie => {
      const [key, ...valueParts] = cookie.trim().split('=');
      const value = valueParts.join('=');
      if (key && value) {
        results.cookies[key] = value;
        
        // Check if it's a token/credential
        if (key.toLowerCase().includes('token') || 
            key.toLowerCase().includes('auth') ||
            key.toLowerCase().includes('jwt') ||
            key.toLowerCase().includes('session') ||
            key.toLowerCase().includes('secret')) {
          results.tokens.push({
            source: 'cookie',
            key: key,
            value: value,
            type: 'cookie'
          });
        }
      }
    });
    console.log(`✅ Cookies: ${Object.keys(results.cookies).length} items`);
  } catch (e) {
    console.warn('⚠️ Cookie access denied:', e);
  }

  // 4. Extract from window objects (common patterns)
  const windowPatterns = [
    'token', 'auth', 'jwt', 'secret', 'key', 'apiKey', 'api_key',
    'accessToken', 'access_token', 'bearer', 'authorization'
  ];
  
  try {
    windowPatterns.forEach(pattern => {
      const keys = Object.keys(window).filter(k => 
        k.toLowerCase().includes(pattern)
      );
      keys.forEach(key => {
        const value = window[key];
        if (value && typeof value === 'string') {
          results.windowSecrets[key] = value;
          results.tokens.push({
            source: 'window',
            key: key,
            value: value,
            type: 'window'
          });
        }
      });
    });
    if (Object.keys(results.windowSecrets).length > 0) {
      console.log(`✅ Window objects: ${Object.keys(results.windowSecrets).length} items`);
    }
  } catch (e) {
    console.warn('⚠️ Window object access error:', e);
  }

  // 5. Intercept fetch requests to capture tokens
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    const options = args[1] || {};
    
    // Extract Authorization header
    if (options.headers) {
      const headers = options.headers;
      if (headers instanceof Headers) {
        const authHeader = headers.get('Authorization');
        if (authHeader) {
          const token = authHeader.replace(/^Bearer\s+/i, '');
          if (token && !results.tokens.some(t => t.value === token)) {
            results.tokens.push({
              source: 'fetch_request',
              key: 'Authorization',
              value: token,
              url: url,
              type: 'bearer_token'
            });
          }
        }
        
        // Extract all headers
        headers.forEach((value, key) => {
          if (key.toLowerCase().includes('token') || 
              key.toLowerCase().includes('auth') ||
              key.toLowerCase().includes('key') ||
              key.toLowerCase().includes('secret')) {
            results.headers[key] = value;
          }
        });
      } else if (typeof headers === 'object') {
        Object.keys(headers).forEach(key => {
          const value = headers[key];
          if (key.toLowerCase().includes('token') || 
              key.toLowerCase().includes('auth') ||
              key.toLowerCase().includes('key') ||
              key.toLowerCase().includes('secret')) {
            results.headers[key] = value;
            if (key === 'Authorization' || key === 'authorization') {
              const token = value.replace(/^Bearer\s+/i, '');
              if (token && !results.tokens.some(t => t.value === token)) {
                results.tokens.push({
                  source: 'fetch_request',
                  key: key,
                  value: token,
                  url: url,
                  type: 'bearer_token'
                });
              }
            }
          }
        });
      }
    }
    
    return originalFetch.apply(this, args);
  };

  // 6. Intercept XMLHttpRequest to capture tokens
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const xhrHeaders = new Map();
  
  XMLHttpRequest.prototype.open = function(method, url) {
    this._url = url;
    return originalOpen.apply(this, arguments);
  };
  
  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    if (name.toLowerCase().includes('token') || 
        name.toLowerCase().includes('auth') ||
        name.toLowerCase().includes('key') ||
        name.toLowerCase().includes('secret')) {
      xhrHeaders.set(name, value);
      results.headers[name] = value;
      
      if (name === 'Authorization' || name === 'authorization') {
        const token = value.replace(/^Bearer\s+/i, '');
        if (token && !results.tokens.some(t => t.value === token)) {
          results.tokens.push({
            source: 'xhr_request',
            key: name,
            value: token,
            url: this._url,
            type: 'bearer_token'
          });
        }
      }
    }
    return originalSetRequestHeader.apply(this, arguments);
  };

  // 7. Monitor network requests via Performance API
  try {
    const performanceEntries = performance.getEntriesByType('resource');
    performanceEntries.forEach(entry => {
      if (entry.name.includes('api') || entry.name.includes('ushadvisors')) {
        results.networkRequests.push({
          url: entry.name,
          type: entry.initiatorType,
          duration: entry.duration
        });
      }
    });
    if (results.networkRequests.length > 0) {
      console.log(`✅ Network requests: ${results.networkRequests.length} tracked`);
    }
  } catch (e) {
    console.warn('⚠️ Performance API access error:', e);
  }

  // 8. Try to extract from common authentication libraries
  try {
    // Check for axios interceptors
    if (window.axios && window.axios.defaults && window.axios.defaults.headers) {
      const authHeader = window.axios.defaults.headers.common['Authorization'] || 
                        window.axios.defaults.headers['Authorization'];
      if (authHeader) {
        const token = authHeader.replace(/^Bearer\s+/i, '');
        results.tokens.push({
          source: 'axios_config',
          key: 'Authorization',
          value: token,
          type: 'bearer_token'
        });
      }
    }
  } catch (e) {
    // Ignore
  }

  // Display results
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 HARVEST SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (results.tokens.length > 0) {
    console.log(`🔑 TOKENS FOUND: ${results.tokens.length}\n`);
    results.tokens.forEach((token, index) => {
      console.log(`Token ${index + 1}:`);
      console.log(`  Source: ${token.source}`);
      console.log(`  Key: ${token.key}`);
      console.log(`  Type: ${token.type}`);
      if (token.url) console.log(`  URL: ${token.url}`);
      console.log(`  Value: ${token.value.substring(0, 100)}${token.value.length > 100 ? '...' : ''}`);
      console.log('');
    });
  } else {
    console.log('⚠️  No tokens found in standard locations');
  }

  // Create JSON output
  const output = {
    timestamp: results.timestamp,
    url: results.url,
    summary: {
      totalTokens: results.tokens.length,
      localStorageItems: Object.keys(results.localStorage).length,
      sessionStorageItems: Object.keys(results.sessionStorage).length,
      cookies: Object.keys(results.cookies).length,
      networkRequests: results.networkRequests.length,
      headers: Object.keys(results.headers).length
    },
    tokens: results.tokens,
    localStorage: results.localStorage,
    sessionStorage: results.sessionStorage,
    cookies: results.cookies,
    headers: results.headers,
    networkRequests: results.networkRequests,
    windowSecrets: results.windowSecrets
  };

  // Copy to clipboard
  try {
    const jsonString = JSON.stringify(output, null, 2);
    navigator.clipboard.writeText(jsonString).then(() => {
      console.log('✅ Results copied to clipboard!');
      console.log('\n💾 Full JSON output saved to clipboard');
    }).catch(() => {
      console.log('\n📋 Full JSON output (copy manually):');
      console.log(jsonString);
    });
  } catch (e) {
    console.log('\n📋 Full JSON output:');
    console.log(JSON.stringify(output, null, 2));
  }

  // Also save to window for easy access
  window.__harvestedCredentials = output;

  console.log('\n✅ Harvest complete!');
  console.log('💡 Access full results via: window.__harvestedCredentials');
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  return output;
})();
