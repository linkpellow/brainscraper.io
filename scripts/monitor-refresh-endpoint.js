/**
 * Browser Console Script to Monitor Refresh Endpoint
 * 
 * Instructions:
 * 1. Log into https://agent.ushadvisors.com
 * 2. Open DevTools (F12) → Console tab
 * 3. Copy and paste this entire script
 * 4. Press Enter
 * 5. The script will monitor and log all refresh endpoint calls
 */

(function() {
  console.log('🔍 [REFRESH_MONITOR] Starting refresh endpoint monitoring...\n');
  
  let refreshCallCount = 0;
  
  // Method 1: Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    const options = args[1] || {};
    
    if (typeof url === 'string' && (url.includes('refresh') || url.includes('/account/refresh'))) {
      refreshCallCount++;
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`✅ [REFRESH_MONITOR] Refresh call #${refreshCallCount} detected (fetch)`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('📍 URL:', url);
      console.log('🔧 Method:', options.method || 'GET');
      console.log('📋 All Headers:');
      if (options.headers) {
        if (options.headers instanceof Headers) {
          options.headers.forEach((value, key) => {
            console.log(`   ${key}: ${value}`);
          });
        } else {
          Object.entries(options.headers).forEach(([key, value]) => {
            console.log(`   ${key}: ${value}`);
          });
        }
      } else {
        console.log('   (no headers)');
      }
      console.log('📦 Body:', options.body || '(none)');
      if (options.body) {
        try {
          const bodyObj = JSON.parse(options.body);
          console.log('📦 Body (parsed):', JSON.stringify(bodyObj, null, 2));
        } catch (e) {
          console.log('📦 Body (raw):', options.body);
        }
      }
      
      // Monitor response
      const promise = originalFetch.apply(this, args);
      promise.then(response => {
        console.log('\n📥 Response Status:', response.status, response.statusText);
        console.log('📥 Response Headers:');
        response.headers.forEach((value, key) => {
          console.log(`   ${key}: ${value}`);
        });
        
        response.clone().json().then(data => {
          console.log('📥 Response Body:', JSON.stringify(data, null, 2));
          if (data.tokenResult?.access_token) {
            console.log('\n✅ [REFRESH_MONITOR] New Token Obtained!');
            console.log('📋 Token:', data.tokenResult.access_token);
            console.log('📋 Token Type:', data.tokenResult.token_type);
            if (data.tokenResult.expires_in) {
              console.log('📋 Expires In:', data.tokenResult.expires_in, 'seconds');
            }
          }
        }).catch(e => {
          response.clone().text().then(text => {
            console.log('📥 Response Body (text):', text);
          }).catch(() => {});
        });
      }).catch(error => {
        console.error('❌ [REFRESH_MONITOR] Request failed:', error);
      });
      
      console.log('\n');
      return promise;
    }
    
    return originalFetch.apply(this, args);
  };
  
  // Method 2: Intercept XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalSend = XMLHttpRequest.prototype.send;
  
  const requestHeaders = new WeakMap();
  
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._method = method;
    this._url = url;
    this._headers = {};
    return originalOpen.apply(this, [method, url, ...rest]);
  };
  
  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    if (!this._headers) this._headers = {};
    this._headers[name] = value;
    return originalSetRequestHeader.apply(this, [name, value]);
  };
  
  XMLHttpRequest.prototype.send = function(body) {
    if (this._url && (this._url.includes('refresh') || this._url.includes('/account/refresh'))) {
      refreshCallCount++;
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`✅ [REFRESH_MONITOR] Refresh call #${refreshCallCount} detected (XHR)`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('📍 URL:', this._url);
      console.log('🔧 Method:', this._method);
      console.log('📋 Headers:');
      if (this._headers && Object.keys(this._headers).length > 0) {
        Object.entries(this._headers).forEach(([key, value]) => {
          console.log(`   ${key}: ${value}`);
        });
      } else {
        console.log('   (no custom headers)');
      }
      console.log('📦 Body:', body || '(none)');
      if (body) {
        try {
          const bodyObj = JSON.parse(body);
          console.log('📦 Body (parsed):', JSON.stringify(bodyObj, null, 2));
        } catch (e) {
          console.log('📦 Body (raw):', body);
        }
      }
      
      // Monitor response
      this.addEventListener('load', function() {
        console.log('\n📥 Response Status:', this.status, this.statusText);
        console.log('📥 Response Headers:', this.getAllResponseHeaders());
        try {
          const responseData = JSON.parse(this.responseText);
          console.log('📥 Response Body:', JSON.stringify(responseData, null, 2));
          if (responseData.tokenResult?.access_token) {
            console.log('\n✅ [REFRESH_MONITOR] New Token Obtained!');
            console.log('📋 Token:', responseData.tokenResult.access_token);
          }
        } catch (e) {
          console.log('📥 Response Body (text):', this.responseText);
        }
        console.log('\n');
      });
      
      this.addEventListener('error', function() {
        console.error('❌ [REFRESH_MONITOR] Request failed');
      });
    }
    
    return originalSend.apply(this, [body]);
  };
  
  // Method 3: Monitor all network requests via Performance API
  if (window.PerformanceObserver) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name && entry.name.includes('refresh')) {
          console.log('📊 [REFRESH_MONITOR] Performance entry:', entry.name);
        }
      }
    });
    observer.observe({ entryTypes: ['resource'] });
  }
  
  console.log('✅ [REFRESH_MONITOR] Monitoring enabled!');
  console.log('\n📝 What to do:');
  console.log('   1. Navigate to different pages in the portal');
  console.log('   2. Wait for automatic token refresh (might happen on page load)');
  console.log('   3. Or manually trigger refresh if the portal has a refresh button');
  console.log('\n💡 The refresh endpoint is: https://api-identity-agent.ushadvisors.com/account/refresh');
  console.log('💡 It should be called with POST method and Authorization header\n');
  
  // Store reference for manual testing
  window._refreshMonitor = {
    test: async function() {
      console.log('🧪 [REFRESH_MONITOR] Testing refresh endpoint manually...\n');
      try {
        // Try to get current token from localStorage
        let token = null;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          const value = localStorage.getItem(key);
          if (value && value.startsWith('eyJ')) {
            const parts = value.split('.');
            if (parts.length === 3) {
              try {
                const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                if (payload.iss && payload.iss.includes('ushadvisors') && !payload.iss.includes('cognito')) {
                  token = value;
                  break;
                }
              } catch (e) {}
            }
          }
        }
        
        if (!token) {
          console.log('❌ Could not find token in localStorage. Please log in first.');
          return;
        }
        
        console.log('🔑 Found token, attempting refresh...');
        const response = await fetch('https://api-identity-agent.ushadvisors.com/account/refresh', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({})
        });
        
        console.log('📥 Response Status:', response.status);
        const data = await response.json();
        console.log('📥 Response:', JSON.stringify(data, null, 2));
        
        if (data.tokenResult?.access_token) {
          console.log('\n✅ Refresh successful!');
          console.log('📋 New Token:', data.tokenResult.access_token);
        }
      } catch (error) {
        console.error('❌ Test failed:', error);
      }
    }
  };
  
  console.log('💡 You can also manually test by running: _refreshMonitor.test()\n');
})();

