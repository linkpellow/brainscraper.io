/**
 * Extract tokens from captured Cognito data
 * 
 * Run this after showCognitoCapture() to extract tokens
 */

(function() {
  'use strict';
  
  const data = window.__cognitoAuthCapture;
  
  if (!data) {
    console.log('❌ No captured data found. Run capture-cognito-auth-flow.js first.\n');
    return;
  }
  
  console.log('🔍 Extracting tokens from captured data...\n');
  
  // Look through all Cognito requests for AuthenticationResult
  let refreshToken = null;
  let idToken = null;
  let accessToken = null;
  
  data.cognitoRequests.forEach((req, i) => {
    if (req.responseBody) {
      const resp = req.responseBody;
      
      // Check for AuthenticationResult
      if (resp.AuthenticationResult) {
        const authResult = resp.AuthenticationResult;
        if (authResult.RefreshToken && !refreshToken) {
          refreshToken = authResult.RefreshToken;
          console.log(`✅ Found Refresh Token in request ${i + 1}`);
        }
        if (authResult.IdToken && !idToken) {
          idToken = authResult.IdToken;
          console.log(`✅ Found ID Token in request ${i + 1}`);
        }
        if (authResult.AccessToken && !accessToken) {
          accessToken = authResult.AccessToken;
        }
      }
      
      // Also check direct properties (some responses might be structured differently)
      if (resp.RefreshToken && !refreshToken) {
        refreshToken = resp.RefreshToken;
        console.log(`✅ Found Refresh Token (direct) in request ${i + 1}`);
      }
      if (resp.IdToken && !idToken) {
        idToken = resp.IdToken;
        console.log(`✅ Found ID Token (direct) in request ${i + 1}`);
      }
    }
  });
  
  // Check stored tokens
  if (data.tokens.refreshToken) {
    refreshToken = data.tokens.refreshToken;
    console.log('✅ Found Refresh Token in stored tokens');
  }
  if (data.tokens.idToken) {
    idToken = data.tokens.idToken;
    console.log('✅ Found ID Token in stored tokens');
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 EXTRACTION RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (refreshToken) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ REFRESH TOKEN FOUND!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Add to .env.local:');
    console.log(`\nCOGNITO_REFRESH_TOKEN=${refreshToken}\n`);
    console.log('This enables permanent automation with automatic token refresh.\n');
  } else {
    console.log('⚠️  No refresh token found in captured data\n');
    console.log('💡 The refresh token might be in localStorage. Try:');
    console.log('   scripts/extract-cognito-refresh-token.js\n');
  }
  
  if (idToken) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎫 ID TOKEN FOUND:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Token: ${idToken.substring(0, 80)}...`);
    console.log('\n💡 This token expires in ~1 hour. Use refresh token for permanent automation.\n');
  }
  
  // Decode ID token to show expiration
  if (idToken) {
    try {
      const parts = idToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload.exp) {
          const expDate = new Date(payload.exp * 1000);
          const now = Date.now();
          const expiresIn = Math.floor((payload.exp * 1000 - now) / 1000 / 60);
          console.log(`Expires: ${expDate.toISOString()}`);
          console.log(`Expires in: ${expiresIn} minutes\n`);
        }
      }
    } catch (e) {
      // Ignore
    }
  }
  
  return {
    refreshToken,
    idToken,
    accessToken
  };
})();
