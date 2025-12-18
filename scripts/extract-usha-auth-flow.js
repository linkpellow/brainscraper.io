/**
 * Extract USHA Authentication Flow
 * 
 * Run this in browser console on agent.ushadvisors.com to capture:
 * - Login endpoints
 * - Authentication requests
 * - Token refresh endpoints
 * - Client credentials
 * - OAuth flow
 * 
 * This will help us automate token handling without middleman
 */

(function() {
  'use strict';
  
  const authFlow = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    loginEndpoints: [],
    tokenEndpoints: [],
    refreshEndpoints: [],
    authRequests: [],
    credentials: {},
    cookies: {},
    localStorage: {},
    sessionStorage: {}
  };

  console.log('🔍 Starting USHA Authentication Flow Extraction...\n');

  // 1. Extract current credentials from storage
  try {
    const userData = localStorage.getItem('user');
    if (userData) {
      authFlow.localStorage.user = userData;
      try {
        const parsed = JSON.parse(userData);
        authFlow.credentials = {
          email: parsed.name,
          access_token: parsed.access_token,
          token_type: parsed.token_type,
          expires_in: parsed.expires_in
        };
      } catch (e) {
        // Not JSON
      }
    }
    
    // Get all localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      authFlow.localStorage[key] = localStorage.getItem(key);
    }
  } catch (e) {
    console.warn('⚠️ localStorage access denied');
  }

  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      authFlow.sessionStorage[key] = sessionStorage.getItem(key);
    }
  } catch (e) {
    // Ignore
  }

  // 2. Extract cookies
  try {
    document.cookie.split(';').forEach(cookie => {
      const [key, ...valueParts] = cookie.trim().split('=');
      if (key) authFlow.cookies[key] = valueParts.join('=');
    });
  } catch (e) {
    // Ignore
  }

  // 3. Intercept ALL network requests to find auth endpoints
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    const options = args[1] || {};
    
    // Check if this is an auth-related request
    const urlLower = url.toLowerCase();
    const isAuthRequest = 
      urlLower.includes('login') ||
      urlLower.includes('auth') ||
      urlLower.includes('token') ||
      urlLower.includes('oauth') ||
      urlLower.includes('connect') ||
      urlLower.includes('signin') ||
      urlLower.includes('account') ||
      urlLower.includes('ushadvisors.com/api') ||
      urlLower.includes('ushadvisors.com/account') ||
      urlLower.includes('ushadvisors.com/auth');
    
    if (isAuthRequest) {
      const requestData = {
        url: url,
        method: options.method || 'GET',
        headers: {},
        body: null,
        timestamp: new Date().toISOString()
      };
      
      // Extract headers
      if (options.headers) {
        if (options.headers instanceof Headers) {
          options.headers.forEach((value, key) => {
            requestData.headers[key] = value;
          });
        } else if (typeof options.headers === 'object') {
          Object.assign(requestData.headers, options.headers);
        }
      }
      
      // Extract body
      if (options.body) {
        try {
          requestData.body = typeof options.body === 'string' ? 
            JSON.parse(options.body) : options.body;
        } catch (e) {
          requestData.body = options.body.toString();
        }
      }
      
      authFlow.authRequests.push(requestData);
      
      // Categorize endpoints
      if (urlLower.includes('token') || urlLower.includes('oauth')) {
        authFlow.tokenEndpoints.push({
          url: url,
          method: requestData.method,
          body: requestData.body
        });
      }
      
      if (urlLower.includes('refresh')) {
        authFlow.refreshEndpoints.push({
          url: url,
          method: requestData.method,
          body: requestData.body
        });
      }
      
      if (urlLower.includes('login') || urlLower.includes('signin')) {
        authFlow.loginEndpoints.push({
          url: url,
          method: requestData.method,
          body: requestData.body
        });
      }
    }
    
    return originalFetch.apply(this, args);
  };

  // 4. Intercept XMLHttpRequest
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
    const isAuthRequest = 
      urlLower.includes('login') ||
      urlLower.includes('auth') ||
      urlLower.includes('token') ||
      urlLower.includes('oauth') ||
      urlLower.includes('connect') ||
      urlLower.includes('ushadvisors.com/api') ||
      urlLower.includes('ushadvisors.com/account');
    
    if (isAuthRequest) {
      let body = null;
      if (data) {
        try {
          body = typeof data === 'string' ? JSON.parse(data) : data;
        } catch (e) {
          body = data.toString();
        }
      }
      
      authFlow.authRequests.push({
        url: this._url,
        method: this._method,
        headers: this._headers,
        body: body,
        timestamp: new Date().toISOString()
      });
      
      // Categorize
      if (urlLower.includes('token') || urlLower.includes('oauth')) {
        authFlow.tokenEndpoints.push({
          url: this._url,
          method: this._method,
          body: body
        });
      }
      
      if (urlLower.includes('refresh')) {
        authFlow.refreshEndpoints.push({
          url: this._url,
          method: this._method,
          body: body
        });
      }
      
      if (urlLower.includes('login') || urlLower.includes('signin')) {
        authFlow.loginEndpoints.push({
          url: this._url,
          method: this._method,
          body: body
        });
      }
    }
    
    return originalSend.apply(this, arguments);
  };

  // 5. Monitor for form submissions (login forms)
  document.addEventListener('submit', function(e) {
    const form = e.target;
    if (form && form.tagName === 'FORM') {
      const formData = new FormData(form);
      const formObj = {};
      formData.forEach((value, key) => {
        formObj[key] = value;
      });
      
      authFlow.loginEndpoints.push({
        url: form.action || window.location.href,
        method: form.method || 'POST',
        body: formObj,
        timestamp: new Date().toISOString()
      });
    }
  }, true);

  // 6. Extract from URL (OAuth callbacks, etc.)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = window.location.hash ? 
      new URLSearchParams(window.location.hash.substring(1)) : null;
    
    if (urlParams.has('code') || urlParams.has('token') || urlParams.has('access_token')) {
      authFlow.credentials.oauthCode = urlParams.get('code');
      authFlow.credentials.oauthToken = urlParams.get('token') || urlParams.get('access_token');
      authFlow.credentials.state = urlParams.get('state');
    }
    
    if (hashParams) {
      if (hashParams.has('access_token') || hashParams.has('token')) {
        authFlow.credentials.oauthToken = hashParams.get('access_token') || hashParams.get('token');
      }
    }
  } catch (e) {
    // Ignore
  }

  // Save to window
  window.__ushaAuthFlow = authFlow;

  // Display results
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 AUTHENTICATION FLOW EXTRACTION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`Login Endpoints Found: ${authFlow.loginEndpoints.length}`);
  authFlow.loginEndpoints.forEach((endpoint, i) => {
    console.log(`\n${i + 1}. ${endpoint.method} ${endpoint.url}`);
    if (endpoint.body) {
      console.log(`   Body:`, JSON.stringify(endpoint.body, null, 2).substring(0, 200));
    }
  });

  console.log(`\nToken Endpoints Found: ${authFlow.tokenEndpoints.length}`);
  authFlow.tokenEndpoints.forEach((endpoint, i) => {
    console.log(`\n${i + 1}. ${endpoint.method} ${endpoint.url}`);
    if (endpoint.body) {
      console.log(`   Body:`, JSON.stringify(endpoint.body, null, 2).substring(0, 200));
    }
  });

  console.log(`\nRefresh Endpoints Found: ${authFlow.refreshEndpoints.length}`);
  authFlow.refreshEndpoints.forEach((endpoint, i) => {
    console.log(`\n${i + 1}. ${endpoint.method} ${endpoint.url}`);
    if (endpoint.body) {
      console.log(`   Body:`, JSON.stringify(endpoint.body, null, 2).substring(0, 200));
    }
  });

  console.log(`\nTotal Auth Requests Captured: ${authFlow.authRequests.length}`);
  console.log(`\nCredentials Found:`, Object.keys(authFlow.credentials).length > 0 ? 'Yes' : 'No');
  if (Object.keys(authFlow.credentials).length > 0) {
    console.log('Credentials:', JSON.stringify(authFlow.credentials, null, 2));
  }

  // Copy to clipboard
  try {
    const jsonString = JSON.stringify(authFlow, null, 2);
    navigator.clipboard.writeText(jsonString).then(() => {
      console.log('\n✅ Full auth flow data copied to clipboard!');
    });
  } catch (e) {
    console.log('\n📋 Full auth flow data:');
    console.log(JSON.stringify(authFlow, null, 2));
  }

  console.log('\n💡 Access full data via: window.__ushaAuthFlow');
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('⚠️  IMPORTANT: Now perform a login or token refresh action');
  console.log('   The script will capture the authentication flow automatically\n');

  return authFlow;
})();
