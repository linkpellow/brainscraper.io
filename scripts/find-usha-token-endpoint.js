/**
 * Find USHA Token Endpoint - Network Tab Helper
 * 
 * Instructions:
 * 1. Open DevTools → Network tab
 * 2. Clear network log
 * 3. Refresh the page or log in
 * 4. Look for requests that return a token
 * 5. Copy the Request URL and share it
 */

console.log('📋 MANUAL NETWORK TAB INSTRUCTIONS:');
console.log('');
console.log('1. Open DevTools (F12)');
console.log('2. Go to Network tab');
console.log('3. Clear the network log (trash icon)');
console.log('4. Filter by "Fetch/XHR"');
console.log('5. Refresh the page or log in');
console.log('6. Look for requests that:');
console.log('   - Go to agent.ushadvisors.com or api-business-agent.ushadvisors.com');
console.log('   - Return a response with a "token" field');
console.log('   - Happen AFTER Cognito authentication');
console.log('');
console.log('7. Click on the request that returns the USHA JWT token');
console.log('8. Share:');
console.log('   - Request URL (full URL)');
console.log('   - Request Method (GET/POST/etc.)');
console.log('   - Request Headers (especially Authorization)');
console.log('   - Request Payload (if POST)');
console.log('   - Response Preview (the token)');
console.log('');
console.log('💡 The token should have issuer "http://localhost:51370"');
console.log('');

// Also try to intercept if script runs before requests
const originalFetch = window.fetch;
window.fetch = function(...args) {
  const url = args[0];
  const options = args[1] || {};
  
  if (typeof url === 'string' && url.includes('ushadvisors.com')) {
    console.log(`🌐 Request: ${options.method || 'GET'} ${url}`);
    
    return originalFetch.apply(this, args).then(async (response) => {
      if (response.ok) {
        try {
          const cloned = response.clone();
          const data = await cloned.json();
          if (data.token || data.access_token || data.jwt_token) {
            const token = data.token || data.access_token || data.jwt_token;
            console.log(`✅ Token found in response from: ${url}`);
            console.log(`   Token preview: ${token.substring(0, 50)}...`);
            
            // Check if it's a USHA JWT
            try {
              const parts = token.split('.');
              if (parts.length === 3) {
                const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                if (payload.iss && payload.iss.includes('localhost:51370')) {
                  console.log(`   ✅ This is a USHA JWT token!`);
                  console.log(`   Endpoint: ${options.method || 'GET'} ${url}`);
                  console.log(`   Headers:`, options.headers);
                  console.log(`   Body:`, options.body);
                }
              }
            } catch (e) {}
          }
        } catch (e) {}
      }
      return response;
    });
  }
  
  return originalFetch.apply(this, args);
};

console.log('✅ Interceptor active. Now refresh the page or log in.');

