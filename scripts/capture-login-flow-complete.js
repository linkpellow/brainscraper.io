/**
 * Complete Login Flow Capture
 * 
 * Run this BEFORE logging in to capture the entire authentication flow.
 * This will capture ALL network requests including the login POST request.
 */

(function() {
  'use strict';
  
  const capturedData = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    loginRequests: [],
    tokenRequests: [],
    allRequests: [],
    credentials: {
      clientCredentials: {},
      tokens: {},
      endpoints: []
    }
  };

  console.log('🔍 Login Flow Capture Active - NOW LOG IN to capture credentials\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  IMPORTANT: Perform login NOW while this script is running');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Helper to extract credentials from any object
  function extractCredentials(obj, source = '') {
    if (!obj || typeof obj !== 'object') return;
    
    Object.keys(obj).forEach(key => {
      const value = obj[key];
      const keyLower = key.toLowerCase();
      
      // Check for client credentials
      if (keyLower.includes('client_id') || keyLower.includes('clientid')) {
        capturedData.credentials.clientCredentials[`${source}.client_id`] = value;
        console.log(`🔑 Found client_id: ${value.substring(0, 30)}...`);
      }
      if (keyLower.includes('client_secret') || keyLower.includes('clientsecret')) {
        capturedData.credentials.clientCredentials[`${source}.client_secret`] = value;
        console.log(`🔑 Found client_secret: ${value.substring(0, 30)}...`);
      }
      
      // Check for tokens
      if (keyLower.includes('access_token') || keyLower.includes('accesstoken')) {
        capturedData.credentials.tokens[`${source}.access_token`] = value;
      }
      if (keyLower.includes('refresh_token') || keyLower.includes('refreshtoken')) {
        capturedData.credentials.tokens[`${source}.refresh_token`] = value;
        console.log(`🔄 Found refresh_token: ${value.substring(0, 30)}...`);
      }
      
      // Recursive for nested objects
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        extractCredentials(value, `${source}.${key}`);
      }
    });
  }

  // Intercept ALL fetch requests
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = args[0];
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

    // Capture headers
    if (options.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          requestData.headers[key] = value;
        });
      } else {
        Object.assign(requestData.headers, options.headers);
      }
    }

    // Capture and parse body
    if (options.body) {
      requestData.body = options.body;
      
      // Try JSON
      try {
        if (typeof options.body === 'string') {
          requestData.bodyParsed = JSON.parse(options.body);
        } else {
          requestData.bodyParsed = options.body;
        }
      } catch (e) {
        // Try URL-encoded
        try {
          if (typeof options.body === 'string') {
            const params = new URLSearchParams(options.body);
            requestData.bodyParsed = {};
            params.forEach((value, key) => {
              requestData.bodyParsed[key] = value;
            });
          }
        } catch (e2) {
          // Keep as string
          requestData.bodyParsed = options.body;
        }
      }
      
      // Extract credentials from body
      if (requestData.bodyParsed && typeof requestData.bodyParsed === 'object') {
        extractCredentials(requestData.bodyParsed, `request.${url}`);
      }
    }

    // Check for login/token endpoints
    const urlLower = url.toLowerCase();
    if (urlLower.includes('login') || urlLower.includes('auth') || urlLower.includes('token') || urlLower.includes('connect')) {
      if (method === 'POST') {
        capturedData.loginRequests.push(requestData);
        console.log(`\n🔐 LOGIN REQUEST CAPTURED:`);
        console.log(`   URL: ${url}`);
        console.log(`   Method: ${method}`);
        if (requestData.bodyParsed) {
          console.log(`   Body:`, requestData.bodyParsed);
        }
      }
    }

    // Make the actual request
    const response = await originalFetch.apply(this, args);
    
    // Clone response to read body without consuming it
    const responseClone = response.clone();
    
    // Capture response
    try {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        requestData.responseBody = await responseClone.json();
        
        // Extract credentials from response
        if (requestData.responseBody && typeof requestData.responseBody === 'object') {
          extractCredentials(requestData.responseBody, `response.${url}`);
          
          // Check for token response
          if (requestData.responseBody.access_token || requestData.responseBody.token) {
            capturedData.tokenRequests.push(requestData);
            console.log(`\n🎫 TOKEN RESPONSE CAPTURED:`);
            console.log(`   URL: ${url}`);
            if (requestData.responseBody.access_token) {
              console.log(`   Access Token: ${requestData.responseBody.access_token.substring(0, 50)}...`);
            }
            if (requestData.responseBody.refresh_token) {
              console.log(`   Refresh Token: ${requestData.responseBody.refresh_token.substring(0, 50)}...`);
            }
          }
        }
      } else if (contentType.includes('text/')) {
        requestData.responseBody = await responseClone.text();
      }
    } catch (e) {
      // Response already consumed or not readable
    }
    
    requestData.response = {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries())
    };

    // Store all requests
    capturedData.allRequests.push(requestData);
    
    // Check for auth endpoints
    if (urlLower.includes('token') || urlLower.includes('auth') || urlLower.includes('connect')) {
      if (!capturedData.credentials.endpoints.includes(url)) {
        capturedData.credentials.endpoints.push(url);
      }
    }

    return response;
  };

  // Intercept XHR requests
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
      
      // Try to parse
      try {
        if (typeof data === 'string') {
          xhrInfo.bodyParsed = JSON.parse(data);
        }
      } catch (e) {
        try {
          if (typeof data === 'string') {
            const params = new URLSearchParams(data);
            xhrInfo.bodyParsed = {};
            params.forEach((value, key) => {
              xhrInfo.bodyParsed[key] = value;
            });
          }
        } catch (e2) {
          xhrInfo.bodyParsed = data;
        }
      }
      
      // Extract credentials
      if (xhrInfo.bodyParsed && typeof xhrInfo.bodyParsed === 'object') {
        extractCredentials(xhrInfo.bodyParsed, `xhr.${xhrInfo.url}`);
      }
      
      // Check for login
      const urlLower = xhrInfo.url.toLowerCase();
      if (urlLower.includes('login') || urlLower.includes('auth') || urlLower.includes('token')) {
        if (xhrInfo.method === 'POST') {
          capturedData.loginRequests.push(xhrInfo);
          console.log(`\n🔐 XHR LOGIN REQUEST:`);
          console.log(`   URL: ${xhrInfo.url}`);
          if (xhrInfo.bodyParsed) {
            console.log(`   Body:`, xhrInfo.bodyParsed);
          }
        }
      }
    }
    
    // Capture response
    this.addEventListener('load', function() {
      if (xhrInfo) {
        try {
          if (this.responseType === '' || this.responseType === 'text') {
            const responseText = this.responseText;
            try {
              xhrInfo.responseBody = JSON.parse(responseText);
              extractCredentials(xhrInfo.responseBody, `xhr.response.${xhrInfo.url}`);
            } catch (e) {
              xhrInfo.responseBody = responseText;
            }
          } else if (this.responseType === 'json') {
            xhrInfo.responseBody = this.response;
            extractCredentials(xhrInfo.responseBody, `xhr.response.${xhrInfo.url}`);
          }
        } catch (e) {
          // Ignore
        }
        xhrInfo.response = {
          status: this.status,
          statusText: this.statusText
        };
      }
    });
    
    return originalSend.apply(this, arguments);
  };

  // Save to window
  window.__ushaLoginFlowCapture = capturedData;

  // Display summary function
  window.showLoginCaptureSummary = function() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 LOGIN FLOW CAPTURE SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log(`Total Requests Captured: ${capturedData.allRequests.length}`);
    console.log(`Login Requests: ${capturedData.loginRequests.length}`);
    console.log(`Token Requests: ${capturedData.tokenRequests.length}`);
    console.log(`Auth Endpoints Found: ${capturedData.credentials.endpoints.length}\n`);
    
    if (Object.keys(capturedData.credentials.clientCredentials).length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔑 CLIENT CREDENTIALS FOUND:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      Object.keys(capturedData.credentials.clientCredentials).forEach(key => {
        const value = capturedData.credentials.clientCredentials[key];
        console.log(`${key}: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`);
      });
      console.log('');
    }
    
    if (Object.keys(capturedData.credentials.tokens).length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎫 TOKENS FOUND:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      Object.keys(capturedData.credentials.tokens).forEach(key => {
        const value = capturedData.credentials.tokens[key];
        console.log(`${key}: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`);
      });
      console.log('');
    }
    
    if (capturedData.loginRequests.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔐 LOGIN REQUESTS:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      capturedData.loginRequests.forEach((req, i) => {
        console.log(`${i + 1}. ${req.method} ${req.url}`);
        if (req.bodyParsed) {
          console.log(`   Body:`, req.bodyParsed);
        }
        console.log('');
      });
    }
    
    if (capturedData.credentials.endpoints.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🌐 AUTH ENDPOINTS:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      capturedData.credentials.endpoints.forEach((endpoint, i) => {
        console.log(`${i + 1}. ${endpoint}`);
      });
      console.log('');
    }
    
    // Setup instructions
    const clientIdKeys = Object.keys(capturedData.credentials.clientCredentials).filter(k => 
      k.toLowerCase().includes('client_id')
    );
    const clientSecretKeys = Object.keys(capturedData.credentials.clientCredentials).filter(k => 
      k.toLowerCase().includes('client_secret')
    );
    
    if (clientIdKeys.length > 0 && clientSecretKeys.length > 0) {
      const clientId = capturedData.credentials.clientCredentials[clientIdKeys[0]];
      const clientSecret = capturedData.credentials.clientCredentials[clientSecretKeys[0]];
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🚀 SETUP INSTRUCTIONS:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('Add to .env.local:');
      console.log(`\nUSHA_CLIENT_ID=${clientId}`);
      console.log(`USHA_CLIENT_SECRET=${clientSecret}\n`);
    }
    
    console.log('\n💡 Access full data via: window.__ushaLoginFlowCapture');
    console.log('💡 Run showLoginCaptureSummary() anytime to see results\n');
  };

  console.log('✅ Capture script active!');
  console.log('💡 After logging in, run: showLoginCaptureSummary()');
  console.log('💡 Or check: window.__ushaLoginFlowCapture\n');

  return capturedData;
})();
