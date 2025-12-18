/**
 * Comprehensive User Data Analysis
 * 
 * Analyzes the user object and searches for all possible credentials
 */

(function() {
  'use strict';
  
  const analysis = {
    timestamp: new Date().toISOString(),
    userData: null,
    accessToken: null,
    refreshToken: null,
    tokenInfo: {},
    allCredentials: {},
    recommendations: []
  };

  console.log('🔍 Analyzing User Data and Searching for Credentials...\n');

  // Get user data
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      analysis.userData = JSON.parse(userStr);
      analysis.accessToken = analysis.userData.access_token;
      analysis.refreshToken = analysis.userData.refresh_token;
      
      console.log('✅ User Data Found in localStorage\n');
      console.log('📋 User Data Structure:');
      console.log(JSON.stringify(analysis.userData, null, 2));
      console.log('');
      
      // Extract all credentials
      Object.keys(analysis.userData).forEach(key => {
        const value = analysis.userData[key];
        if (value && typeof value === 'string' && value.length > 10) {
          const keyLower = key.toLowerCase();
          if (keyLower.includes('token') || keyLower.includes('key') || 
              keyLower.includes('secret') || keyLower.includes('credential')) {
            analysis.allCredentials[key] = value;
          }
        }
      });
    } else {
      console.log('⚠️  No user data found in localStorage\n');
    }
  } catch (e) {
    console.error('❌ Error parsing user data:', e);
  }

  // Decode access token
  if (analysis.accessToken) {
    try {
      const parts = analysis.accessToken.split('.');
      if (parts.length === 3) {
        const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        
        analysis.tokenInfo = {
          header: header,
          payload: payload,
          expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
          expiresIn: payload.exp ? Math.floor((payload.exp * 1000 - Date.now()) / 1000 / 60) : null,
          issuer: payload.iss,
          audience: payload.aud
        };
        
        console.log('📋 Access Token Decoded:');
        console.log(`   User: ${payload.Email || payload.unique_name}`);
        console.log(`   Agent Number: ${payload.AgentNumber}`);
        console.log(`   Expires: ${analysis.tokenInfo.expiresAt}`);
        console.log(`   Expires In: ${analysis.tokenInfo.expiresIn} minutes`);
        console.log(`   Issuer: ${payload.iss}`);
        console.log(`   Audience: ${payload.aud}\n`);
      }
    } catch (e) {
      console.warn('⚠️  Could not decode access token');
    }
  }

  // Search for refresh token in other locations
  console.log('🔍 Searching for Refresh Token in Other Locations...\n');
  
  const refreshTokenLocations = [];
  
  // Check all localStorage keys
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      
      if (key && value) {
        const keyLower = key.toLowerCase();
        if (keyLower.includes('refresh')) {
          refreshTokenLocations.push({
            location: `localStorage.${key}`,
            value: value
          });
        }
        
        // Check if value is JSON with refresh token
        try {
          const parsed = JSON.parse(value);
          if (typeof parsed === 'object') {
            Object.keys(parsed).forEach(k => {
              if (k.toLowerCase().includes('refresh') && parsed[k] && typeof parsed[k] === 'string') {
                refreshTokenLocations.push({
                  location: `localStorage.${key}.${k}`,
                  value: parsed[k]
                });
              }
            });
          }
        } catch (e) {
          // Not JSON
        }
      }
    }
  } catch (e) {
    console.warn('⚠️  localStorage access denied');
  }

  // Display results
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 ANALYSIS RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🔑 Access Token:');
  if (analysis.accessToken) {
    console.log(`   ✅ Found: ${analysis.accessToken.substring(0, 50)}...`);
    console.log(`   Expires In: ${analysis.tokenInfo.expiresIn || 'Unknown'} minutes`);
  } else {
    console.log('   ❌ Not found');
  }
  console.log('');

  console.log('🔄 Refresh Token:');
  if (analysis.refreshToken) {
    console.log(`   ✅ Found in user data: ${analysis.refreshToken.substring(0, 50)}...`);
    console.log(`   Full Token: ${analysis.refreshToken}\n`);
  } else if (refreshTokenLocations.length > 0) {
    console.log(`   ✅ Found in ${refreshTokenLocations.length} other location(s):`);
    refreshTokenLocations.forEach((loc, i) => {
      console.log(`\n   ${i + 1}. ${loc.location}`);
      console.log(`      Token: ${loc.value.substring(0, 50)}...`);
      console.log(`      Full: ${loc.value}`);
    });
    console.log('');
  } else {
    console.log('   ❌ Not found in user data or other locations\n');
  }

  if (Object.keys(analysis.allCredentials).length > 0) {
    console.log('🔐 All Credentials Found:');
    Object.keys(analysis.allCredentials).forEach(key => {
      const value = analysis.allCredentials[key];
      console.log(`   ${key}: ${value.substring(0, 30)}${value.length > 30 ? '...' : ''}`);
    });
    console.log('');
  }

  // Recommendations
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 RECOMMENDATIONS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (analysis.refreshToken || refreshTokenLocations.length > 0) {
    const refreshToken = analysis.refreshToken || refreshTokenLocations[0].value;
    console.log('✅ Refresh Token Available!');
    console.log('\nTo enable automatic token refresh, add to .env.local:');
    console.log(`USHA_REFRESH_TOKEN=${refreshToken}\n`);
    console.log('The system will automatically refresh tokens before expiration.\n');
  } else {
    console.log('⚠️  No refresh token found. Options:\n');
    console.log('1. **Find Client Credentials (BEST - Permanent)**');
    console.log('   Run: scripts/find-permanent-credentials.js');
    console.log('   Look for client_id/client_secret in OAuth requests\n');
    console.log('2. **Capture Login Flow**');
    console.log('   Run: scripts/extract-login-flow.js');
    console.log('   Then perform fresh login to capture credentials\n');
    console.log('3. **Monitor Token Refresh**');
    console.log('   Run: scripts/trigger-token-refresh.js');
    console.log('   Then perform actions that might trigger refresh\n');
  }

  // Save to window
  window.__userAnalysis = analysis;
  if (analysis.refreshToken || refreshTokenLocations.length > 0) {
    window.__refreshToken = analysis.refreshToken || refreshTokenLocations[0].value;
  }

  // Create setup command
  if (analysis.refreshToken || refreshTokenLocations.length > 0) {
    const refreshToken = analysis.refreshToken || refreshTokenLocations[0].value;
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 QUICK SETUP');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Copy this to add refresh token to .env.local:');
    console.log(`\nUSHA_REFRESH_TOKEN=${refreshToken}\n`);
    console.log('Or run:');
    console.log(`npx tsx scripts/setup-direct-auth.ts "${analysis.accessToken}" "${refreshToken}"\n`);
  }

  console.log('💡 Access full analysis: window.__userAnalysis');
  if (window.__refreshToken) {
    console.log('💡 Access refresh token: window.__refreshToken\n');
  }

  return analysis;
})();
