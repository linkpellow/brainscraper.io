/**
 * Extract and decode the JWT token from harvested credentials
 * Run this in browser console after harvesting
 */

// Get the harvested data
const data = window.__harvestedCredentials;

if (!data) {
  console.error('❌ No harvested credentials found. Run the harvest script first.');
} else {
  console.log('🔍 Extracting tokens from harvested data...\n');
  
  const tokens = [];
  
  // Extract from localStorage
  if (data.localStorage && data.localStorage.user) {
    try {
      const userData = JSON.parse(data.localStorage.user);
      if (userData.access_token) {
        tokens.push({
          source: 'localStorage.user',
          type: 'JWT Access Token',
          key: 'access_token',
          value: userData.access_token,
          token_type: userData.token_type,
          expires_in: userData.expires_in,
          name: userData.name
        });
      }
    } catch (e) {
      console.warn('Could not parse user data:', e);
    }
  }
  
  // Decode JWT tokens
  tokens.forEach(token => {
    try {
      const parts = token.value.split('.');
      if (parts.length === 3) {
        const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        
        token.decoded = {
          header: header,
          payload: payload,
          expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
          issuedAt: payload.iat ? new Date(payload.iat * 1000).toISOString() : null
        };
      }
    } catch (e) {
      console.warn('Could not decode token:', e);
    }
  });
  
  // Display results
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔑 EXTRACTED TOKENS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  tokens.forEach((token, index) => {
    console.log(`\nToken ${index + 1}: ${token.type}`);
    console.log(`Source: ${token.source}`);
    console.log(`Name: ${token.name || 'N/A'}`);
    console.log(`Token Type: ${token.token_type}`);
    console.log(`Expires In: ${token.expires_in ? new Date(token.expires_in * 1000).toISOString() : 'N/A'}`);
    console.log(`\nToken Value:\n${token.value}`);
    
    if (token.decoded) {
      console.log(`\n📋 Decoded JWT:`);
      console.log(`Header:`, JSON.stringify(token.decoded.header, null, 2));
      console.log(`Payload:`, JSON.stringify(token.decoded.payload, null, 2));
      console.log(`Expires At: ${token.decoded.expiresAt || 'N/A'}`);
      console.log(`Issued At: ${token.decoded.issuedAt || 'N/A'}`);
    }
    console.log('\n' + '─'.repeat(60));
  });
  
  // Save to window
  window.__extractedTokens = tokens;
  
  // Create clean output
  const cleanOutput = {
    timestamp: new Date().toISOString(),
    url: data.url,
    tokens: tokens.map(t => ({
      source: t.source,
      type: t.type,
      name: t.name,
      token_type: t.token_type,
      expires_in: t.expires_in,
      expires_at: t.decoded?.expiresAt,
      token: t.value,
      decoded: t.decoded
    }))
  };
  
  // Copy to clipboard
  try {
    const jsonString = JSON.stringify(cleanOutput, null, 2);
    navigator.clipboard.writeText(jsonString).then(() => {
      console.log('\n✅ Token data copied to clipboard!');
    });
  } catch (e) {
    console.log('\n📋 Token data:');
    console.log(JSON.stringify(cleanOutput, null, 2));
  }
  
  window.__tokenOutput = cleanOutput;
  console.log('\n💡 Access tokens via: window.__extractedTokens');
  console.log('💡 Access formatted output via: window.__tokenOutput');
}

