/**
 * Extract Refresh Token from Current Session
 * 
 * Sometimes refresh tokens are stored separately or can be obtained
 * by making a request with the current token.
 */

(function() {
  'use strict';
  
  console.log('🔍 Searching for Refresh Token in Current Session...\n');

  const results = {
    timestamp: new Date().toISOString(),
    refreshToken: null,
    tokenInfo: {},
    methods: []
  };

  // Method 1: Check localStorage thoroughly
  console.log('📋 Method 1: Checking localStorage...');
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      
      if (key && value) {
        // Check key name
        if (key.toLowerCase().includes('refresh')) {
          results.refreshToken = value;
          results.methods.push(`localStorage.${key}`);
          console.log(`✅ Found refresh token in: localStorage.${key}`);
        }
        
        // Check value content (might be JSON)
        try {
          const parsed = JSON.parse(value);
          if (typeof parsed === 'object') {
            // Search recursively
            function searchObject(obj, path = '') {
              Object.keys(obj).forEach(k => {
                const kLower = k.toLowerCase();
                const currentPath = path ? `${path}.${k}` : k;
                
                if (kLower.includes('refresh') && typeof obj[k] === 'string' && obj[k].length > 20) {
                  results.refreshToken = obj[k];
                  results.methods.push(`localStorage.${key}.${currentPath}`);
                  console.log(`✅ Found refresh token in: localStorage.${key}.${currentPath}`);
                } else if (typeof obj[k] === 'object' && obj[k] !== null) {
                  searchObject(obj[k], currentPath);
                }
              });
            }
            searchObject(parsed);
          }
        } catch (e) {
          // Not JSON, check if value itself looks like a refresh token
          if (value.length > 50 && (key.toLowerCase().includes('token') || key.toLowerCase().includes('refresh'))) {
            // Might be a token
            if (value.split('.').length !== 3) { // Not a JWT, might be refresh token
              results.refreshToken = value;
              results.methods.push(`localStorage.${key}`);
              console.log(`✅ Potential refresh token in: localStorage.${key}`);
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('⚠️ localStorage access denied');
  }

  // Method 2: Check sessionStorage
  console.log('\n📋 Method 2: Checking sessionStorage...');
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      const value = sessionStorage.getItem(key);
      
      if (key && value && key.toLowerCase().includes('refresh')) {
        results.refreshToken = value;
        results.methods.push(`sessionStorage.${key}`);
        console.log(`✅ Found refresh token in: sessionStorage.${key}`);
      }
    }
  } catch (e) {
    // Ignore
  }

  // Method 3: Try to get refresh token from API
  console.log('\n📋 Method 3: Attempting to get refresh token from API...');
  
  try {
    const userData = localStorage.getItem('user');
    if (userData) {
      const parsed = JSON.parse(userData);
      const currentToken = parsed.access_token;
      
      if (currentToken) {
        // Try common endpoints that might return refresh token
        const endpoints = [
          'https://agent.ushadvisors.com/api/account/token',
          'https://agent.ushadvisors.com/api/auth/token',
          'https://api-business-agent.ushadvisors.com/api/account/token'
        ];
        
        endpoints.forEach(async (endpoint) => {
          try {
            const response = await fetch(endpoint, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Accept': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              if (data.refresh_token) {
                results.refreshToken = data.refresh_token;
                results.methods.push(`api.${endpoint}`);
                console.log(`✅ Found refresh token from: ${endpoint}`);
              }
            }
          } catch (e) {
            // Ignore
          }
        });
      }
    }
  } catch (e) {
    // Ignore
  }

  // Method 4: Check cookies
  console.log('\n📋 Method 4: Checking cookies...');
  try {
    document.cookie.split(';').forEach(cookie => {
      const [key, ...valueParts] = cookie.trim().split('=');
      const value = valueParts.join('=');
      if (key && key.toLowerCase().includes('refresh') && value.length > 20) {
        results.refreshToken = value;
        results.methods.push(`cookie.${key}`);
        console.log(`✅ Found refresh token in: cookie.${key}`);
      }
    });
  } catch (e) {
    // Ignore
  }

  // Display results
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 REFRESH TOKEN SEARCH RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (results.refreshToken) {
    console.log('✅ REFRESH TOKEN FOUND!');
    console.log(`\nToken: ${results.refreshToken}`);
    console.log(`\nFound via: ${results.methods.join(', ')}\n`);
    
    // Save to window
    window.__refreshToken = results.refreshToken;
    
    console.log('💡 To use this token:');
    console.log(`   Add to .env.local: USHA_REFRESH_TOKEN=${results.refreshToken}\n`);
  } else {
    console.log('⚠️  No refresh token found in current session.');
    console.log('\n💡 Next Steps:');
    console.log('   1. Run scripts/trigger-token-refresh.js and perform actions');
    console.log('   2. Run scripts/extract-login-flow.js and perform fresh login');
    console.log('   3. Check if USHA API provides refresh tokens via different endpoint\n');
  }

  // Save full results
  window.__refreshTokenSearch = results;
  
  console.log('💡 Access results: window.__refreshTokenSearch');
  console.log('💡 If token found: window.__refreshToken\n');

  return results;
})();
