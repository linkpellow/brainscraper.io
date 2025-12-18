/**
 * Capture TampaUSHA DNC Scrubbing Flow
 * 
 * Run this in browser console on app.tampausha.com to capture:
 * - How Cognito ID token is used for DNC scrubbing
 * - What endpoints are called
 * - Request/response format
 * - Headers used
 */

(function() {
  'use strict';
  
  const capturedData = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    dncRequests: [],
    tokenUsage: [],
    allRequests: [],
    cognitoTokens: {}
  };

  console.log('🔍 TampaUSHA DNC Flow Capture Active\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  IMPORTANT: Perform a DNC scrub action NOW');
  console.log('   (e.g., scrub a phone number, check DNC status)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Extract Cognito tokens from localStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes('CognitoIdentityServiceProvider')) {
        const value = localStorage.getItem(key);
        if (value && (key.includes('idToken') || key.includes('accessToken'))) {
          capturedData.cognitoTokens[key] = value;
        }
      }
    }
    console.log(`✅ Found ${Object.keys(capturedData.cognitoTokens).length} Cognito tokens in localStorage\n`);
  } catch (e) {
    console.warn('⚠️ Could not access localStorage:', e);
  }

  // Intercept fetch to capture all network requests
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const urlArg = args[0];
    const url = typeof urlArg === 'string' ? urlArg : (urlArg?.url || String(urlArg));
    const options = args[1] || {};
    const method = options.method || 'GET';
    
    const requestData = {
      timestamp: new Date().toISOString(),
      method: method,
      url: url,
      headers: {},
      body: null,
      bodyParsed: null,
      response: null,
      responseBody: null
    };

    // Check if this is a DNC/scrub related request
    const isDNC = typeof url === 'string' && (
      url.includes('scrub') ||
      url.includes('dnc') ||
      url.includes('doNotCall') ||
      url.includes('phone') ||
      url.includes('ushadvisors.com') ||
      url.includes('leadarena.com')
    );

    // Capture headers
    if (options.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          requestData.headers[key] = value;
          
          // Extract token from Authorization header
          if (key.toLowerCase() === 'authorization' && value.startsWith('Bearer ')) {
            const token = value.substring(7);
            capturedData.tokenUsage.push({
              timestamp: requestData.timestamp,
              url: url,
              token: token.substring(0, 50) + '...',
              fullToken: token
            });
          }
        });
      } else {
        Object.assign(requestData.headers, options.headers);
        
        // Extract token from Authorization header
        const authHeader = options.headers.Authorization || options.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          capturedData.tokenUsage.push({
            timestamp: requestData.timestamp,
            url: url,
            token: token.substring(0, 50) + '...',
            fullToken: token
          });
        }
      }
    }

    // Capture body
    if (options.body) {
      requestData.body = options.body;
      try {
        if (typeof options.body === 'string') {
          requestData.bodyParsed = JSON.parse(options.body);
        } else {
          requestData.bodyParsed = options.body;
        }
      } catch (e) {
        requestData.bodyParsed = options.body;
      }
    }

    // Make the request
    const response = await originalFetch.apply(this, args);
    const responseClone = response.clone();
    
    // Capture response
    try {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        requestData.responseBody = await responseClone.json();
      } else if (contentType.includes('text/')) {
        requestData.responseBody = await responseClone.text();
      }
    } catch (e) {
      // Response already consumed
    }
    
    requestData.response = {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries())
    };

    // Store all requests
    capturedData.allRequests.push(requestData);

    // Store DNC-related requests separately
    if (isDNC) {
      capturedData.dncRequests.push(requestData);
      console.log(`📞 [DNC_CAPTURE] ${method} ${url}`);
      console.log(`   Status: ${response.status} ${response.statusText}`);
      if (requestData.headers.Authorization || requestData.headers.authorization) {
        const token = (requestData.headers.Authorization || requestData.headers.authorization).substring(7);
        console.log(`   Token: ${token.substring(0, 30)}...`);
        
        // Try to decode token to see what type it is
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
            if (payload.iss) {
              console.log(`   Token Type: ${payload.iss.includes('cognito') ? 'Cognito ID Token' : 'USHA JWT Token'}`);
              console.log(`   Issuer: ${payload.iss}`);
            }
          }
        } catch (e) {
          // Couldn't decode
        }
      }
      console.log('');
    }

    return response;
  };

  // Intercept XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  
  const xhrData = new WeakMap();

  XMLHttpRequest.prototype.open = function(method, url) {
    this._method = method;
    this._url = url;
    this._headers = {};
    xhrData.set(this, {
      timestamp: new Date().toISOString(),
      method: method,
      url: url,
      headers: {},
      body: null
    });
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    this._headers[name] = value;
    const data = xhrData.get(this);
    if (data) {
      data.headers[name] = value;
    }
    return originalSetRequestHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(data) {
    const xhrInfo = xhrData.get(this);
    if (xhrInfo && data) {
      xhrInfo.body = data;
      try {
        xhrInfo.bodyParsed = JSON.parse(data);
      } catch (e) {
        xhrInfo.bodyParsed = data;
      }
    }

    this.addEventListener('load', function() {
      if (xhrInfo) {
        const isDNC = xhrInfo.url.includes('scrub') || 
                     xhrInfo.url.includes('dnc') ||
                     xhrInfo.url.includes('ushadvisors.com') ||
                     xhrInfo.url.includes('leadarena.com');
        
        const requestData = {
          ...xhrInfo,
          response: {
            status: this.status,
            statusText: this.statusText,
            headers: {}
          },
          responseBody: this.responseText
        };

        try {
          requestData.responseBody = JSON.parse(this.responseText);
        } catch (e) {
          // Not JSON
        }

        capturedData.allRequests.push(requestData);
        
        if (isDNC) {
          capturedData.dncRequests.push(requestData);
          console.log(`📞 [DNC_CAPTURE] ${xhrInfo.method} ${xhrInfo.url}`);
          console.log(`   Status: ${this.status} ${this.statusText}`);
        }
      }
    });

    return originalSend.apply(this, arguments);
  };

  // Save to window
  window.__tampaushaDncCapture = capturedData;

  // Summary function
  window.showDncCapture = function() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 TAMPAUSHA DNC CAPTURE SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log(`Total Requests: ${capturedData.allRequests.length}`);
    console.log(`DNC-Related Requests: ${capturedData.dncRequests.length}`);
    console.log(`Token Usage: ${capturedData.tokenUsage.length}\n`);

    if (capturedData.dncRequests.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📞 DNC SCRUB REQUESTS:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      capturedData.dncRequests.forEach((req, index) => {
        console.log(`${index + 1}. ${req.method} ${req.url}`);
        console.log(`   Status: ${req.response?.status || 'N/A'}`);
        
        if (req.headers.Authorization || req.headers.authorization) {
          const token = (req.headers.Authorization || req.headers.authorization).substring(7);
          console.log(`   Token: ${token.substring(0, 50)}...`);
          
          // Decode token
          try {
            const parts = token.split('.');
            if (parts.length === 3) {
              const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
              console.log(`   Token Type: ${payload.iss?.includes('cognito') ? 'Cognito ID Token' : 'USHA JWT Token'}`);
              console.log(`   Issuer: ${payload.iss || 'N/A'}`);
              if (payload.exp) {
                const exp = new Date(payload.exp * 1000);
                console.log(`   Expires: ${exp.toISOString()}`);
              }
            }
          } catch (e) {
            // Couldn't decode
          }
        }
        
        if (req.bodyParsed) {
          console.log(`   Body: ${JSON.stringify(req.bodyParsed, null, 2).substring(0, 200)}...`);
        }
        
        if (req.responseBody) {
          console.log(`   Response: ${JSON.stringify(req.responseBody, null, 2).substring(0, 200)}...`);
        }
        
        console.log('');
      });
    }

    if (capturedData.tokenUsage.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎫 TOKEN USAGE:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      capturedData.tokenUsage.forEach((usage, index) => {
        console.log(`${index + 1}. ${usage.url}`);
        console.log(`   Token: ${usage.token}`);
        
        // Decode to identify token type
        try {
          const parts = usage.fullToken.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
            console.log(`   Type: ${payload.iss?.includes('cognito') ? 'Cognito ID Token' : 'USHA JWT Token'}`);
            console.log(`   Issuer: ${payload.iss || 'N/A'}`);
          }
        } catch (e) {
          // Couldn't decode
        }
        console.log('');
      });
    }

    console.log('\n💡 Access full data via: window.__tampaushaDncCapture');
    console.log('💡 Run showDncCapture() to see this summary again\n');
  };

  console.log('✅ Capture active!');
  console.log('💡 After performing DNC scrub actions, run: showDncCapture()');
  console.log('💡 Access full data via: window.__tampaushaDncCapture\n');
})();
