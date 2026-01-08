/**
 * Browser Script to Extract USHA JWT Token
 * 
 * Instructions:
 * 1. Log into https://agent.ushadvisors.com
 * 2. Open browser DevTools (F12)
 * 3. Go to Console tab
 * 4. Copy and paste this entire script
 * 5. Press Enter
 * 6. The script will find and display your USHA JWT token
 * 
 * The token will be displayed in the console. Copy it and update your USHA_JWT_TOKEN environment variable.
 */

(function() {
  console.log('🔍 [TOKEN_EXTRACT] Searching for USHA JWT token...\n');

  // Method 1: Check localStorage
  console.log('📋 [TOKEN_EXTRACT] Method 1: Checking localStorage...');
  const localStorageKeys = Object.keys(localStorage);
  let foundToken = null;
  
  for (const key of localStorageKeys) {
    const value = localStorage.getItem(key);
    if (value && value.startsWith('eyJ')) {
      // Check if it's a JWT token (starts with eyJ and has 3 parts)
      const parts = value.split('.');
      if (parts.length === 3) {
        try {
          // Decode payload to check if it's a USHA token
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          
          // Check if it's a USHA token (not Cognito)
          if (payload.iss && !payload.iss.includes('cognito')) {
            console.log(`✅ [TOKEN_EXTRACT] Found USHA JWT token in localStorage['${key}']`);
            foundToken = value;
            break;
          } else if (payload.iss && payload.iss.includes('ushadvisors')) {
            console.log(`✅ [TOKEN_EXTRACT] Found USHA JWT token in localStorage['${key}']`);
            foundToken = value;
            break;
          }
        } catch (e) {
          // Not a valid JWT, continue
        }
      }
    }
  }

  // Method 2: Check sessionStorage
  if (!foundToken) {
    console.log('\n📋 [TOKEN_EXTRACT] Method 2: Checking sessionStorage...');
    const sessionStorageKeys = Object.keys(sessionStorage);
    
    for (const key of sessionStorageKeys) {
      const value = sessionStorage.getItem(key);
      if (value && value.startsWith('eyJ')) {
        const parts = value.split('.');
        if (parts.length === 3) {
          try {
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            if (payload.iss && !payload.iss.includes('cognito')) {
              console.log(`✅ [TOKEN_EXTRACT] Found USHA JWT token in sessionStorage['${key}']`);
              foundToken = value;
              break;
            }
          } catch (e) {
            // Not a valid JWT, continue
          }
        }
      }
    }
  }

  // Method 3: Monitor network requests
  if (!foundToken) {
    console.log('\n📋 [TOKEN_EXTRACT] Method 3: Checking recent network requests...');
    console.log('⚠️  [TOKEN_EXTRACT] Please make a request to the USHA API (e.g., navigate to a page)');
    console.log('⚠️  [TOKEN_EXTRACT] Then check the Network tab for Authorization headers\n');
    
    // Try to intercept fetch requests
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const request = args[0];
      const options = args[1] || {};
      const headers = options.headers || {};
      
      // Check for Authorization header
      if (headers.Authorization || headers.authorization) {
        const authHeader = headers.Authorization || headers.authorization;
        if (authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          if (token.startsWith('eyJ') && token.split('.').length === 3) {
            try {
              const parts = token.split('.');
              const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
              if (payload.iss && !payload.iss.includes('cognito')) {
                console.log('✅ [TOKEN_EXTRACT] Found USHA JWT token in fetch request!');
                foundToken = token;
              }
            } catch (e) {
              // Not a valid JWT
            }
          }
        }
      }
      
      return originalFetch.apply(this, args);
    };
    
    console.log('✅ [TOKEN_EXTRACT] Network monitoring enabled. Make a request to see the token.\n');
  }

  // Display results
  if (foundToken) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ [TOKEN_EXTRACT] USHA JWT Token Found!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Decode and display token info
    try {
      const parts = foundToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload.exp) {
          const expiration = new Date(payload.exp * 1000);
          const now = new Date();
          const expiresIn = Math.floor((payload.exp * 1000 - now.getTime()) / 1000 / 60);
          console.log(`📅 Expires: ${expiration.toISOString()}`);
          console.log(`⏰ Expires in: ${expiresIn} minutes\n`);
        }
      }
    } catch (e) {
      // Couldn't decode
    }
    
    console.log('📋 Full Token:');
    console.log(foundToken);
    console.log('\n📝 To update your environment:');
    console.log(`   USHA_JWT_TOKEN=${foundToken}`);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Copy to clipboard if possible
    if (navigator.clipboard) {
      navigator.clipboard.writeText(foundToken).then(() => {
        console.log('✅ Token copied to clipboard!');
      }).catch(() => {
        console.log('⚠️  Could not copy to clipboard automatically');
      });
    }
  } else {
    console.log('\n❌ [TOKEN_EXTRACT] Could not find USHA JWT token automatically');
    console.log('\n📝 Manual Extraction Instructions:');
    console.log('   1. Open DevTools (F12) → Network tab');
    console.log('   2. Filter by "XHR" or "Fetch"');
    console.log('   3. Make a request to the USHA API (navigate to a page)');
    console.log('   4. Find a request to api-business-agent.ushadvisors.com or similar');
    console.log('   5. Click on the request → Headers tab');
    console.log('   6. Look for "Authorization: Bearer <token>"');
    console.log('   7. Copy the token (the part after "Bearer ")');
    console.log('   8. Update USHA_JWT_TOKEN in your environment variables\n');
  }
})();

