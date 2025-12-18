/**
 * Extract Cognito Refresh Token
 * 
 * Searches for Cognito refresh tokens in browser storage and network requests.
 * Run this after logging in to find the refresh token for permanent automation.
 */

(function() {
  'use strict';
  
  const results = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    refreshTokens: [],
    idTokens: [],
    accessTokens: [],
    localStorage: {},
    sessionStorage: {},
    recommendations: []
  };

  console.log('🔍 Searching for Cognito Refresh Token...\n');

  // 1. Search localStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      
      if (key && value) {
        results.localStorage[key] = value;
        
        // Check for refresh token
        if (key.toLowerCase().includes('refresh') || 
            key.toLowerCase().includes('cognito')) {
          try {
            const parsed = JSON.parse(value);
            if (parsed.refreshToken || parsed.RefreshToken || parsed.refresh_token) {
              const refreshToken = parsed.refreshToken || parsed.RefreshToken || parsed.refresh_token;
              results.refreshTokens.push({
                source: 'localStorage',
                key: key,
                value: refreshToken
              });
              console.log(`✅ Found refresh token in localStorage.${key}`);
            }
            if (parsed.idToken || parsed.IdToken || parsed.id_token) {
              results.idTokens.push({
                source: 'localStorage',
                key: key,
                value: parsed.idToken || parsed.IdToken || parsed.id_token
              });
            }
            if (parsed.accessToken || parsed.AccessToken || parsed.access_token) {
              results.accessTokens.push({
                source: 'localStorage',
                key: key,
                value: parsed.accessToken || parsed.AccessToken || parsed.access_token
              });
            }
          } catch (e) {
            // Not JSON, check if value itself is a token
            if (value.length > 100 && (key.toLowerCase().includes('refresh'))) {
              results.refreshTokens.push({
                source: 'localStorage',
                key: key,
                value: value
              });
              console.log(`✅ Found refresh token in localStorage.${key}`);
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('⚠️ localStorage access denied');
  }

  // 2. Search sessionStorage
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      const value = sessionStorage.getItem(key);
      
      if (key && value) {
        results.sessionStorage[key] = value;
        
        if (key.toLowerCase().includes('refresh') || 
            key.toLowerCase().includes('cognito')) {
          try {
            const parsed = JSON.parse(value);
            if (parsed.refreshToken || parsed.RefreshToken) {
              results.refreshTokens.push({
                source: 'sessionStorage',
                key: key,
                value: parsed.refreshToken || parsed.RefreshToken
              });
              console.log(`✅ Found refresh token in sessionStorage.${key}`);
            }
          } catch (e) {
            // Not JSON
          }
        }
      }
    }
  } catch (e) {
    console.warn('⚠️ sessionStorage access denied');
  }

  // 3. Intercept network requests for Cognito responses
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = args[0];
    const response = await originalFetch.apply(this, args);
    
    // Check if this is a Cognito API call
    if (url.includes('cognito-idp') || url.includes('amazonaws.com')) {
      try {
        const clone = response.clone();
        const data = await clone.json();
        
        if (data.AuthenticationResult) {
          const authResult = data.AuthenticationResult;
          
          if (authResult.RefreshToken) {
            results.refreshTokens.push({
              source: 'network',
              url: url,
              value: authResult.RefreshToken
            });
            console.log(`✅ Found refresh token in Cognito response: ${url}`);
          }
          
          if (authResult.IdToken) {
            results.idTokens.push({
              source: 'network',
              url: url,
              value: authResult.IdToken
            });
          }
        }
      } catch (e) {
        // Not JSON or already consumed
      }
    }
    
    return response;
  };

  // Save to window
  window.__cognitoRefreshToken = results;

  // Display results
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 COGNITO TOKEN EXTRACTION RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (results.refreshTokens.length > 0) {
    console.log('✅ REFRESH TOKENS FOUND:');
    results.refreshTokens.forEach((token, i) => {
      console.log(`\n${i + 1}. Source: ${token.source}`);
      if (token.key) console.log(`   Key: ${token.key}`);
      if (token.url) console.log(`   URL: ${token.url}`);
      console.log(`   Token: ${token.value.substring(0, 50)}...`);
    });
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 SETUP INSTRUCTIONS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const refreshToken = results.refreshTokens[0].value;
    console.log('Add to .env.local:');
    console.log(`\nCOGNITO_REFRESH_TOKEN=${refreshToken}\n`);
    console.log('This will enable permanent automation with automatic token refresh.\n');
  } else {
    console.log('⚠️  No refresh token found in storage\n');
    console.log('💡 NEXT STEPS:');
    console.log('   1. Log out and log back in');
    console.log('   2. Run this script again');
    console.log('   3. Or run: scripts/capture-cognito-auth-flow.js');
    console.log('      (Run it BEFORE logging in to capture the flow)\n');
  }

  if (results.idTokens.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎫 ID TOKENS FOUND:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    results.idTokens.forEach((token, i) => {
      console.log(`${i + 1}. ${token.source}: ${token.value.substring(0, 50)}...`);
    });
    console.log('');
  }

  console.log('💡 Access data via: window.__cognitoRefreshToken\n');

  return results;
})();
