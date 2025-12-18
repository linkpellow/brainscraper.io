/**
 * Extract Complete Login Flow
 * 
 * Run this BEFORE logging in, then perform login to capture:
 * - Login endpoint
 * - Request format
 * - Response with tokens
 * - Client credentials (if used)
 */

(function() {
  'use strict';
  
  const loginFlow = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    loginRequests: [],
    tokenResponses: [],
    credentials: {},
    recommendations: []
  };

  console.log('🔍 Starting Login Flow Capture...\n');
  console.log('⚠️  IMPORTANT: Perform login NOW to capture the flow!\n');

  // Intercept ALL requests
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    const options = args[1] || {};
    
    const urlLower = url.toLowerCase();
    const isLoginRequest = 
      urlLower.includes('login') ||
      urlLower.includes('signin') ||
      urlLower.includes('auth') ||
      urlLower.includes('token') ||
      urlLower.includes('connect') ||
      urlLower.includes('account');
    
    if (isLoginRequest) {
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
        headers: {},
        body: body,
        timestamp: new Date().toISOString()
      };
      
      // Extract headers
      if (options.headers) {
        if (options.headers instanceof Headers) {
          options.headers.forEach((value, key) => {
            requestData.headers[key] = value;
          });
        } else {
          Object.assign(requestData.headers, options.headers);
        }
      }
      
      loginFlow.loginRequests.push(requestData);
      
      // Check for client credentials in body
      if (body) {
        if (body.client_id || body.clientId) {
          loginFlow.credentials.client_id = body.client_id || body.clientId;
        }
        if (body.client_secret || body.clientSecret) {
          loginFlow.credentials.client_secret = body.client_secret || body.clientSecret;
        }
        if (body.grant_type === 'client_credentials') {
          loginFlow.recommendations.push({
            type: 'client_credentials_flow',
            endpoint: url,
            note: 'OAuth 2.0 client credentials detected - PERMANENT SOLUTION'
          });
        }
        if (body.grant_type === 'password') {
          loginFlow.recommendations.push({
            type: 'password_flow',
            endpoint: url,
            note: 'Username/password flow detected'
          });
        }
      }
      
      // Capture response
      return originalFetch.apply(this, args).then(async (response) => {
        const responseData = {
          status: response.status,
          headers: {},
          body: null,
          timestamp: new Date().toISOString()
        };
        
        // Extract response headers
        response.headers.forEach((value, key) => {
          responseData.headers[key] = value;
        });
        
        // Extract response body
        try {
          const data = await response.clone().json();
          responseData.body = data;
          
          // Check for tokens in response
          if (data.access_token || data.token) {
            loginFlow.tokenResponses.push({
              ...requestData,
              response: responseData
            });
            
            if (data.refresh_token) {
              loginFlow.credentials.refresh_token = data.refresh_token;
            }
            if (data.access_token) {
              loginFlow.credentials.access_token = data.access_token;
            }
          }
        } catch (e) {
          // Not JSON
          try {
            responseData.body = await response.clone().text();
          } catch (e2) {
            // Ignore
          }
        }
        
        return response;
      });
    }
    
    return originalFetch.apply(this, args);
  };

  // Intercept XHR
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
    return originalSetRequestHeader.apply(this, arguments);
  };
  
  XMLHttpRequest.prototype.send = function(data) {
    const urlLower = (this._url || '').toLowerCase();
    if (urlLower.includes('login') || urlLower.includes('auth') || urlLower.includes('token')) {
      let body = null;
      if (data) {
        try {
          body = typeof data === 'string' ? JSON.parse(data) : data;
        } catch (e) {
          body = data.toString();
        }
      }
      
      loginFlow.loginRequests.push({
        url: this._url,
        method: this._method,
        headers: this._headers,
        body: body,
        timestamp: new Date().toISOString()
      });
    }
    return originalSend.apply(this, arguments);
  };

  // Save to window
  window.__loginFlow = loginFlow;

  // Display instructions
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 LOGIN FLOW CAPTURE ACTIVE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('✅ Script is monitoring all network requests');
  console.log('📝 NOW: Perform login in the application');
  console.log('📊 Results will be captured automatically\n');

  // Check results after a delay
  setTimeout(() => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 CAPTURED DATA');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    if (loginFlow.loginRequests.length > 0) {
      console.log(`✅ Captured ${loginFlow.loginRequests.length} login-related requests\n`);
      loginFlow.loginRequests.forEach((req, i) => {
        console.log(`${i + 1}. ${req.method} ${req.url}`);
        if (req.body) {
          console.log(`   Body:`, JSON.stringify(req.body, null, 2).substring(0, 300));
        }
        console.log('');
      });
    }
    
    if (Object.keys(loginFlow.credentials).length > 0) {
      console.log('🔑 Credentials Found:');
      Object.keys(loginFlow.credentials).forEach(key => {
        if (key !== 'access_token') { // Don't show full access token
          const value = loginFlow.credentials[key];
          console.log(`   ${key}: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`);
        }
      });
      console.log('');
    }
    
    if (loginFlow.recommendations.length > 0) {
      console.log('💡 Recommendations:');
      loginFlow.recommendations.forEach((rec, i) => {
        console.log(`\n${i + 1}. ${rec.type}`);
        console.log(`   Endpoint: ${rec.endpoint}`);
        console.log(`   Note: ${rec.note}`);
      });
    }
    
    console.log('\n💡 Access full data: window.__loginFlow');
    console.log('💡 Copy data: JSON.stringify(window.__loginFlow, null, 2)\n');
  }, 5000);

  return loginFlow;
})();
