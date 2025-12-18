/**
 * Find Permanent Credentials for USHA Automation
 * 
 * Run this in browser console to find client_id, client_secret, or other
 * permanent credentials that can be used for automated authentication.
 */

(function() {
  'use strict';
  
  const credentials = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    clientCredentials: {},
    apiKeys: {},
    permanentTokens: {},
    recommendations: []
  };

  console.log('🔍 Searching for Permanent Credentials...\n');

  // 1. Search localStorage for client credentials
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      
      if (key && value) {
        // Check for client credentials
        if (key.toLowerCase().includes('client') || 
            key.toLowerCase().includes('credential') ||
            key.toLowerCase().includes('api_key') ||
            key.toLowerCase().includes('secret')) {
          credentials.clientCredentials[key] = value;
        }
        
        // Try to parse as JSON and search inside
        try {
          const parsed = JSON.parse(value);
          if (typeof parsed === 'object') {
            Object.keys(parsed).forEach(k => {
              const kLower = k.toLowerCase();
              if (kLower.includes('client_id') || kLower.includes('client_secret') ||
                  kLower.includes('api_key') || kLower.includes('secret')) {
                credentials.clientCredentials[`${key}.${k}`] = parsed[k];
              }
            });
          }
        } catch (e) {
          // Not JSON
        }
      }
    }
  } catch (e) {
    console.warn('⚠️ localStorage access denied');
  }

  // 2. Search window objects
  try {
    const windowKeys = Object.keys(window);
    windowKeys.forEach(key => {
      try {
        const value = window[key];
        if (value && typeof value === 'object') {
          // Check for common credential patterns
          if (value.clientId || value.client_id || value.clientID) {
            credentials.clientCredentials[`window.${key}.clientId`] = 
              value.clientId || value.client_id || value.clientID;
          }
          if (value.clientSecret || value.client_secret) {
            credentials.clientCredentials[`window.${key}.clientSecret`] = 
              value.clientSecret || value.client_secret;
          }
          if (value.apiKey || value.api_key) {
            credentials.apiKeys[`window.${key}.apiKey`] = 
              value.apiKey || value.api_key;
          }
        }
      } catch (e) {
        // Ignore
      }
    });
  } catch (e) {
    // Ignore
  }

  // 3. Intercept network requests to find credentials (COMPREHENSIVE)
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    const options = args[1] || {};
    
    // Check request body for credentials (JSON and form-urlencoded)
    if (options.body) {
      let body = null;
      
      // Try JSON first
      try {
        body = typeof options.body === 'string' ? 
          JSON.parse(options.body) : options.body;
      } catch (e) {
        // Try URL-encoded form data
        try {
          if (typeof options.body === 'string') {
            const params = new URLSearchParams(options.body);
            body = {};
            params.forEach((value, key) => {
              body[key] = value;
            });
          }
        } catch (e2) {
          // Not parseable
        }
      }
      
      if (body) {
        // Extract client credentials
        if (body.client_id || body.clientId || body.clientID) {
          const clientId = body.client_id || body.clientId || body.clientID;
          credentials.clientCredentials[`request.${url}.client_id`] = clientId;
          console.log(`🔑 Found client_id in request to ${url}`);
        }
        if (body.client_secret || body.clientSecret) {
          const clientSecret = body.client_secret || body.clientSecret;
          credentials.clientCredentials[`request.${url}.client_secret`] = clientSecret;
          console.log(`🔑 Found client_secret in request to ${url}`);
        }
        
        // Check for OAuth grant types
        if (body.grant_type === 'client_credentials') {
          credentials.recommendations.push({
            type: 'client_credentials',
            endpoint: url,
            method: options.method || 'POST',
            body: body,
            note: 'OAuth 2.0 client credentials flow detected - PERMANENT SOLUTION'
          });
          console.log(`✅ OAuth 2.0 client_credentials flow detected at ${url}`);
        }
        if (body.grant_type === 'password') {
          credentials.recommendations.push({
            type: 'password_grant',
            endpoint: url,
            method: options.method || 'POST',
            note: 'OAuth 2.0 password grant flow detected'
          });
        }
      }
    }
    
    // Check Authorization header for Basic Auth (client credentials)
    if (options.headers) {
      const headers = options.headers instanceof Headers ? 
        Object.fromEntries(options.headers.entries()) : options.headers;
      
      if (headers.Authorization || headers.authorization) {
        const authHeader = headers.Authorization || headers.authorization;
        if (authHeader.startsWith('Basic ')) {
          try {
            const decoded = atob(authHeader.substring(6));
            const [clientId, clientSecret] = decoded.split(':');
            if (clientId && clientSecret) {
              credentials.clientCredentials[`request.${url}.basic_auth.client_id`] = clientId;
              credentials.clientCredentials[`request.${url}.basic_auth.client_secret`] = clientSecret;
              console.log(`🔑 Found Basic Auth credentials in request to ${url}`);
            }
          } catch (e) {
            // Ignore
          }
        }
      }
    }
    
    // Capture response for credentials
    return originalFetch.apply(this, args).then(async (response) => {
      if (response.ok) {
        try {
          const data = await response.clone().json();
          
          // Check response for client credentials or tokens
          if (data.client_id || data.clientId) {
            credentials.clientCredentials[`response.${url}.client_id`] = 
              data.client_id || data.clientId;
          }
          if (data.refresh_token) {
            credentials.permanentTokens[`response.${url}.refresh_token`] = data.refresh_token;
          }
          if (data.access_token && data.refresh_token) {
            credentials.recommendations.push({
              type: 'token_response',
              endpoint: url,
              note: 'Token endpoint returns both access_token and refresh_token'
            });
          }
        } catch (e) {
          // Not JSON
        }
      }
      return response;
    });
  };

  // 4. Search page source for embedded credentials
  try {
    const scripts = document.querySelectorAll('script');
    scripts.forEach((script, index) => {
      const content = script.textContent || script.innerHTML;
      if (content) {
        // Look for client credentials in JavaScript (multiple patterns)
        const patterns = [
          /client[_-]?id['":\s]*[:=]\s*['"]([^'"]+)['"]/gi,
          /client[_-]?secret['":\s]*[:=]\s*['"]([^'"]+)['"]/gi,
          /clientId['":\s]*[:=]\s*['"]([^'"]+)['"]/gi,
          /clientSecret['":\s]*[:=]\s*['"]([^'"]+)['"]/gi
        ];
        
        patterns.forEach((pattern, pIndex) => {
          const matches = content.matchAll(pattern);
          for (const match of matches) {
            if (match[1] && match[1].length > 5) {
              const key = pIndex % 2 === 0 ? 'client_id' : 'client_secret';
              credentials.clientCredentials[`script.${index}.${key}`] = match[1];
            }
          }
        });
      }
    });
  } catch (e) {
    // Ignore
  }

  // 5. Check URL parameters for credentials
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = window.location.hash ? 
      new URLSearchParams(window.location.hash.substring(1)) : null;
    
    urlParams.forEach((value, key) => {
      const keyLower = key.toLowerCase();
      if (keyLower.includes('client') || keyLower.includes('secret') || keyLower.includes('key')) {
        credentials.clientCredentials[`url_param.${key}`] = value;
      }
    });
    
    if (hashParams) {
      hashParams.forEach((value, key) => {
        const keyLower = key.toLowerCase();
        if (keyLower.includes('client') || keyLower.includes('secret')) {
          credentials.clientCredentials[`url_hash.${key}`] = value;
        }
      });
    }
  } catch (e) {
    // Ignore
  }

  // 6. Monitor XHR requests
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  
  XMLHttpRequest.prototype.open = function(method, url) {
    this._method = method;
    this._url = url;
    this._headers = {};
    return originalOpen.apply(this, arguments);
  };
  
  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    this._headers[name] = value;
    
    // Check for Basic Auth
    if (name.toLowerCase() === 'authorization' && value.startsWith('Basic ')) {
      try {
        const decoded = atob(value.substring(6));
        const [clientId, clientSecret] = decoded.split(':');
        if (clientId && clientSecret) {
          credentials.clientCredentials[`xhr.${this._url}.basic_auth.client_id`] = clientId;
          credentials.clientCredentials[`xhr.${this._url}.basic_auth.client_secret`] = clientSecret;
        }
      } catch (e) {
        // Ignore
      }
    }
    
    return originalSetRequestHeader.apply(this, arguments);
  };
  
  XMLHttpRequest.prototype.send = function(data) {
    if (data) {
      let body = null;
      try {
        body = typeof data === 'string' ? JSON.parse(data) : data;
      } catch (e) {
        // Try URL-encoded
        try {
          if (typeof data === 'string') {
            const params = new URLSearchParams(data);
            body = {};
            params.forEach((value, key) => {
              body[key] = value;
            });
          }
        } catch (e2) {
          // Ignore
        }
      }
      
      if (body) {
        if (body.client_id || body.clientId) {
          credentials.clientCredentials[`xhr.${this._url}.client_id`] = 
            body.client_id || body.clientId;
        }
        if (body.client_secret || body.clientSecret) {
          credentials.clientCredentials[`xhr.${this._url}.client_secret`] = 
            body.client_secret || body.clientSecret;
        }
      }
    }
    return originalSend.apply(this, arguments);
  };

  // Save to window
  window.__ushaPermanentCredentials = credentials;

  // Display results
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔑 PERMANENT CREDENTIALS SEARCH');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (Object.keys(credentials.clientCredentials).length > 0) {
    console.log('✅ Client Credentials Found:');
    Object.keys(credentials.clientCredentials).forEach(key => {
      const value = credentials.clientCredentials[key];
      console.log(`\n   ${key}:`);
      console.log(`   Value: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`);
    });
    console.log('');
  } else {
    console.log('⚠️  No client credentials found in standard locations\n');
  }

  if (Object.keys(credentials.apiKeys).length > 0) {
    console.log('✅ API Keys Found:');
    Object.keys(credentials.apiKeys).forEach(key => {
      console.log(`   ${key}: ${credentials.apiKeys[key].substring(0, 30)}...`);
    });
    console.log('');
  }

  if (credentials.recommendations.length > 0) {
    console.log('💡 Recommendations:');
    credentials.recommendations.forEach((rec, i) => {
      console.log(`\n${i + 1}. ${rec.type}`);
      console.log(`   Endpoint: ${rec.endpoint}`);
      console.log(`   Method: ${rec.method}`);
      console.log(`   Note: ${rec.note}`);
    });
    console.log('');
  }

  // Copy to clipboard
  try {
    const jsonString = JSON.stringify(credentials, null, 2);
    navigator.clipboard.writeText(jsonString).then(() => {
      console.log('✅ Credentials data copied to clipboard!');
    });
  } catch (e) {
    console.log('\n📋 Credentials data:');
    console.log(JSON.stringify(credentials, null, 2));
  }

  // Display actionable recommendations
  if (Object.keys(credentials.clientCredentials).length > 0) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 SETUP INSTRUCTIONS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Find the best client credentials
    const clientIdKeys = Object.keys(credentials.clientCredentials).filter(k => 
      k.toLowerCase().includes('client_id') || k.toLowerCase().includes('clientid')
    );
    const clientSecretKeys = Object.keys(credentials.clientCredentials).filter(k => 
      k.toLowerCase().includes('client_secret') || k.toLowerCase().includes('clientsecret')
    );
    
    if (clientIdKeys.length > 0 && clientSecretKeys.length > 0) {
      const clientId = credentials.clientCredentials[clientIdKeys[0]];
      const clientSecret = credentials.clientCredentials[clientSecretKeys[0]];
      
      console.log('✅ PERMANENT CREDENTIALS FOUND!');
      console.log('\nAdd these to .env.local for permanent automation:');
      console.log(`\nUSHA_CLIENT_ID=${clientId}`);
      console.log(`USHA_CLIENT_SECRET=${clientSecret}\n`);
      console.log('This will enable permanent automation without token expiration.\n');
    }
  }

  console.log('\n💡 Access data via: window.__ushaPermanentCredentials');
  console.log('\n⚠️  IMPORTANT: Perform login or API actions to capture credentials');
  console.log('   in network requests. The script will monitor all requests.');
  console.log('   Check window.__ushaPermanentCredentials periodically for new findings.\n');

  return credentials;
})();
