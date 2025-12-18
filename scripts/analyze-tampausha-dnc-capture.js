/**
 * Analyze TampaUSHA DNC Capture Data
 * 
 * Run this after capture-tampausha-dnc-flow.js to analyze the captured data
 * and identify:
 * - Which token type is used (Cognito ID token vs USHA JWT)
 * - What endpoints are called
 * - Request format
 * - How to automate the flow
 */

(function() {
  'use strict';
  
  if (!window.__tampaushaDncCapture) {
    console.error('❌ No capture data found!');
    console.error('   Run capture-tampausha-dnc-flow.js first, then perform DNC scrub actions');
    return;
  }

  const data = window.__tampaushaDncCapture;
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 TAMPAUSHA DNC FLOW ANALYSIS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Analyze token usage
  const tokenTypes = new Map();
  const endpoints = new Set();
  
  data.dncRequests.forEach(req => {
    endpoints.add(req.url);
    
    const authHeader = req.headers.Authorization || req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
          const tokenType = payload.iss?.includes('cognito') ? 'Cognito ID Token' : 'USHA JWT Token';
          tokenTypes.set(token, {
            type: tokenType,
            issuer: payload.iss,
            exp: payload.exp ? new Date(payload.exp * 1000).toISOString() : null
          });
        }
      } catch (e) {
        // Couldn't decode
      }
    }
  });

  console.log('📊 ANALYSIS RESULTS:\n');
  console.log(`DNC Requests Captured: ${data.dncRequests.length}`);
  console.log(`Unique Endpoints: ${endpoints.size}`);
  console.log(`Token Types Found: ${tokenTypes.size}\n`);

  // Show endpoints
  if (endpoints.size > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🌐 ENDPOINTS USED:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    Array.from(endpoints).forEach((url, index) => {
      console.log(`${index + 1}. ${url}`);
      
      // Find requests to this endpoint
      const requests = data.dncRequests.filter(r => r.url === url);
      if (requests.length > 0) {
        const req = requests[0];
        console.log(`   Method: ${req.method}`);
        console.log(`   Headers: ${Object.keys(req.headers).join(', ')}`);
        
        if (req.headers.Authorization || req.headers.authorization) {
          const token = (req.headers.Authorization || req.headers.authorization).substring(7);
          const tokenInfo = tokenTypes.get(token);
          if (tokenInfo) {
            console.log(`   Token Type: ${tokenInfo.type}`);
            console.log(`   Issuer: ${tokenInfo.issuer}`);
          }
        }
        
        if (req.bodyParsed) {
          console.log(`   Request Body: ${JSON.stringify(req.bodyParsed, null, 2)}`);
        }
        
        if (req.responseBody) {
          console.log(`   Response: ${JSON.stringify(req.responseBody, null, 2).substring(0, 500)}...`);
        }
      }
      console.log('');
    });
  }

  // Token analysis
  if (tokenTypes.size > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎫 TOKEN ANALYSIS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const cognitoTokens = Array.from(tokenTypes.values()).filter(t => t.type === 'Cognito ID Token');
    const ushaTokens = Array.from(tokenTypes.values()).filter(t => t.type === 'USHA JWT Token');
    
    console.log(`Cognito ID Tokens: ${cognitoTokens.length}`);
    console.log(`USHA JWT Tokens: ${ushaTokens.length}\n`);
    
    if (cognitoTokens.length > 0) {
      console.log('✅ Cognito ID Token is being used for DNC scrubbing!');
      console.log('   This means Cognito ID token works directly with the API.\n');
    }
    
    if (ushaTokens.length > 0) {
      console.log('✅ USHA JWT Token is being used for DNC scrubbing!');
      console.log('   This means there\'s a token exchange happening.\n');
    }
  }

  // Recommendations
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 RECOMMENDATIONS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (tokenTypes.size > 0) {
    const firstToken = Array.from(tokenTypes.values())[0];
    if (firstToken.type === 'Cognito ID Token') {
      console.log('✅ SOLUTION: Use Cognito ID token directly!');
      console.log('   - Get Cognito ID token via refresh token');
      console.log('   - Use it directly with USHA DNC API');
      console.log('   - No token exchange needed\n');
    } else {
      console.log('⚠️  SOLUTION: Need to find token exchange endpoint');
      console.log('   - Get Cognito ID token');
      console.log('   - Exchange it for USHA JWT token');
      console.log('   - Use USHA JWT token with DNC API\n');
    }
  } else {
    console.log('⚠️  No token information captured');
    console.log('   - Make sure you performed a DNC scrub action');
    console.log('   - Check that requests were made\n');
  }

  // Export data
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 EXPORT DATA:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    const jsonString = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(jsonString).then(() => {
      console.log('✅ Full capture data copied to clipboard!');
    }).catch(() => {
      console.log('⚠️  Could not copy to clipboard, but data is available in window.__tampaushaDncCapture');
    });
  } catch (e) {
    console.log('⚠️  Could not copy to clipboard');
  }
  
  console.log('\n💡 Access full data: window.__tampaushaDncCapture');
  console.log('💡 Copy JSON: JSON.stringify(window.__tampaushaDncCapture, null, 2)\n');
})();

