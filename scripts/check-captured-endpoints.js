/**
 * Check what endpoints were captured
 * Run this after capture to see all endpoints
 */

(function() {
  if (!window.__tampaushaDncCapture) {
    console.error('❌ No capture data found! Run capture-tampausha-dnc-flow.js first');
    return;
  }

  const data = window.__tampaushaDncCapture;
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 CAPTURED ENDPOINTS ANALYSIS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check for USHA DNC API endpoint
  const ushaDncRequests = data.dncRequests.filter(r => 
    r.url.includes('api-business-agent.ushadvisors.com') ||
    r.url.includes('scrubphonenumber') ||
    r.url.includes('scrub')
  );

  // Check for LeadArena API endpoints
  const leadArenaRequests = data.dncRequests.filter(r => 
    r.url.includes('optic-prod-api.leadarena.com')
  );

  console.log(`📊 USHA DNC API Requests: ${ushaDncRequests.length}`);
  console.log(`📊 LeadArena API Requests: ${leadArenaRequests.length}\n`);

  if (ushaDncRequests.length > 0) {
    console.log('✅ Found requests to USHA DNC API!');
    ushaDncRequests.forEach((req, i) => {
      console.log(`\n${i + 1}. ${req.method} ${req.url}`);
      console.log(`   Status: ${req.response?.status}`);
      if (req.headers.Authorization) {
        const token = req.headers.Authorization.substring(7);
        console.log(`   Token: ${token.substring(0, 50)}...`);
      }
    });
  } else {
    console.log('⚠️  No requests to api-business-agent.ushadvisors.com found');
    console.log('   This means TampaUSHA uses a different endpoint\n');
  }

  if (leadArenaRequests.length > 0) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📞 LEADARENA API REQUESTS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    leadArenaRequests.forEach((req, i) => {
      console.log(`${i + 1}. ${req.method} ${req.url}`);
      console.log(`   Status: ${req.response?.status}`);
      
      if (req.headers.Authorization || req.headers.authorization) {
        const token = (req.headers.Authorization || req.headers.authorization).substring(7);
        console.log(`   Token: ${token.substring(0, 50)}...`);
        
        // Decode token
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
            console.log(`   Token Type: ${payload.iss?.includes('cognito') ? 'Cognito ID Token' : 'USHA JWT Token'}`);
            console.log(`   Issuer: ${payload.iss}`);
          }
        } catch (e) {}
      }
      
      // Show all headers
      console.log(`   Headers:`);
      Object.keys(req.headers).forEach(key => {
        if (key.toLowerCase() !== 'authorization') {
          console.log(`     ${key}: ${req.headers[key]}`);
        }
      });
      
      if (req.responseBody) {
        console.log(`   Response: ${JSON.stringify(req.responseBody, null, 2).substring(0, 300)}...`);
      }
      console.log('');
    });
  }

  // Check if we need to use LeadArena API instead
  if (leadArenaRequests.length > 0 && ushaDncRequests.length === 0) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 KEY FINDING:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('TampaUSHA uses optic-prod-api.leadarena.com for DNC scrubbing!');
    console.log('This API accepts Cognito ID tokens directly.');
    console.log('\nWe should use this endpoint instead of api-business-agent.ushadvisors.com');
    console.log('OR we need to find how to exchange Cognito token for USHA JWT token.\n');
  }

  console.log('\n💡 Full data: window.__tampaushaDncCapture');
})();

