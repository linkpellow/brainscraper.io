/**
 * Analyze Captured Credentials
 * 
 * Run this to see what was captured by find-permanent-credentials.js
 */

(function() {
  'use strict';
  
  console.log('🔍 Analyzing Captured Credentials...\n');
  
  const data = window.__ushaPermanentCredentials;
  
  if (!data) {
    console.log('❌ No captured data found.');
    console.log('💡 Run find-permanent-credentials.js first, then perform actions in the app.\n');
    return;
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 CAPTURED DATA ANALYSIS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log(`Timestamp: ${data.timestamp}`);
  console.log(`URL: ${data.url}\n`);
  
  // Client Credentials
  if (Object.keys(data.clientCredentials || {}).length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔑 CLIENT CREDENTIALS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    Object.keys(data.clientCredentials).forEach(key => {
      const value = data.clientCredentials[key];
      console.log(`${key}:`);
      console.log(`  ${value.substring(0, 80)}${value.length > 80 ? '...' : ''}\n`);
    });
    
    // Find best pair
    const clientIdKeys = Object.keys(data.clientCredentials).filter(k => 
      k.toLowerCase().includes('client_id') || k.toLowerCase().includes('clientid')
    );
    const clientSecretKeys = Object.keys(data.clientCredentials).filter(k => 
      k.toLowerCase().includes('client_secret') || k.toLowerCase().includes('clientsecret')
    );
    
    if (clientIdKeys.length > 0 && clientSecretKeys.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ PERMANENT CREDENTIALS FOUND!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      const clientId = data.clientCredentials[clientIdKeys[0]];
      const clientSecret = data.clientCredentials[clientSecretKeys[0]];
      
      console.log('Add to .env.local:');
      console.log(`\nUSHA_CLIENT_ID=${clientId}`);
      console.log(`USHA_CLIENT_SECRET=${clientSecret}\n`);
    }
  } else {
    console.log('⚠️  No client credentials found\n');
  }
  
  // Recommendations
  if (data.recommendations && data.recommendations.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 RECOMMENDATIONS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    data.recommendations.forEach((rec, i) => {
      console.log(`${i + 1}. ${rec.type}`);
      console.log(`   Endpoint: ${rec.endpoint}`);
      if (rec.method) console.log(`   Method: ${rec.method}`);
      console.log(`   Note: ${rec.note}`);
      if (rec.body) {
        console.log(`   Body:`, rec.body);
      }
      console.log('');
    });
  }
  
  // API Keys
  if (Object.keys(data.apiKeys || {}).length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔑 API KEYS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    Object.keys(data.apiKeys).forEach(key => {
      console.log(`${key}: ${data.apiKeys[key].substring(0, 50)}...`);
    });
    console.log('');
  }
  
  // Next Steps
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 NEXT STEPS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (Object.keys(data.clientCredentials || {}).length === 0) {
    console.log('1. Open Network tab (F12 → Network)');
    console.log('2. Log out and log back in');
    console.log('3. Look for POST requests to:');
    console.log('   - /connect/token');
    console.log('   - /api/token');
    console.log('   - /api/auth/login');
    console.log('   - /Account/Login');
    console.log('4. Check the Request Payload for client_id/client_secret\n');
    console.log('OR run the complete capture script:');
    console.log('   scripts/capture-login-flow-complete.js');
    console.log('   (Run it BEFORE logging in)\n');
  } else {
    console.log('✅ Credentials found! Use the setup instructions above.\n');
  }
  
  return data;
})();
