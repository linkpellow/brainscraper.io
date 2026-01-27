# Extract Token from Browser Console

Run these snippets in your browser console while logged into `agent.ushadvisors.com` to extract the JWT token and session information.

## Step 1: Get Current JWT Token

```javascript
// Get token from any recent API request
(async () => {
  // Method 1: Check localStorage/sessionStorage
  console.log('=== Checking Storage ===');
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const value = localStorage.getItem(key);
    if (value && value.includes('eyJ')) {
      console.log(`Found in localStorage[${key}]:`, value.substring(0, 50) + '...');
    }
  }
  
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    const value = sessionStorage.getItem(key);
    if (value && value.includes('eyJ')) {
      console.log(`Found in sessionStorage[${key}]:`, value.substring(0, 50) + '...');
    }
  }
  
  // Method 2: Intercept fetch requests
  console.log('\n=== Intercepting Next API Request ===');
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    const options = args[1] || {};
    const headers = options.headers || {};
    
    // Check Authorization header
    if (headers.Authorization || headers.authorization) {
      const authHeader = headers.Authorization || headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        console.log('🔑 TOKEN FOUND in fetch request:');
        console.log('URL:', url);
        console.log('Token:', token);
        console.log('\n📋 Copy this token:');
        console.log(token);
        return originalFetch.apply(this, args).then(response => {
          console.log('✅ Request completed');
          return response;
        });
      }
    }
    
    return originalFetch.apply(this, args);
  };
  
  console.log('✅ Interceptor active. Make an API request (e.g., scrub a phone number) and the token will be logged.');
  console.log('Token will appear above when you make a request.');
})();
```

## Step 2: Extract Token from Network Tab (Alternative)

```javascript
// Run this, then check Network tab for any request to api-business-agent.ushadvisors.com
// Look for Authorization header in Request Headers

// Or use this to find it in recent requests:
(async () => {
  const performanceEntries = performance.getEntriesByType('resource');
  const apiRequests = performanceEntries.filter(entry => 
    entry.name.includes('ushadvisors.com') || entry.name.includes('api-business-agent')
  );
  
  console.log('=== Recent API Requests ===');
  apiRequests.slice(-5).forEach(entry => {
    console.log('Request:', entry.name);
  });
  
  console.log('\n💡 Go to Network tab → Find a request to api-business-agent.ushadvisors.com');
  console.log('💡 Look for "Authorization: Bearer ..." in Request Headers');
  console.log('💡 Copy the token value (everything after "Bearer ")');
})();
```

## Step 3: Decode JWT Token (Get Expiration)

```javascript
// Paste your token here and run
const token = 'PASTE_YOUR_TOKEN_HERE';

try {
  const parts = token.split('.');
  if (parts.length !== 3) {
    console.error('Invalid JWT format');
  } else {
    // Decode header
    const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
    console.log('=== JWT Header ===');
    console.log(JSON.stringify(header, null, 2));
    
    // Decode payload
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    console.log('\n=== JWT Payload ===');
    console.log(JSON.stringify(payload, null, 2));
    
    // Extract expiration
    if (payload.exp) {
      const expiresAt = new Date(payload.exp * 1000);
      const now = new Date();
      const expiresIn = Math.floor((payload.exp * 1000 - now.getTime()) / 1000 / 60);
      
      console.log('\n=== Token Expiration ===');
      console.log('Expires at:', expiresAt.toISOString());
      console.log('Current time:', now.toISOString());
      console.log('Expires in:', expiresIn, 'minutes');
      console.log('Is expired:', expiresAt < now ? 'YES ❌' : 'NO ✅');
      
      console.log('\n📋 Copy these values:');
      console.log('Token:', token);
      console.log('Expires at (milliseconds):', payload.exp * 1000);
      console.log('Expires at (ISO):', expiresAt.toISOString());
    }
  }
} catch (error) {
  console.error('Error decoding token:', error);
}
```

## Step 4: Get Token from Active Request (Most Reliable)

```javascript
// This will capture the token from the next API request you make
(async () => {
  console.log('🔍 Waiting for API request...');
  console.log('💡 Make a request (e.g., scrub a phone number) and the token will be captured automatically.');
  
  // Override fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = args[0];
    const options = args[1] || {};
    
    // Check if this is a USHA API request
    if (typeof url === 'string' && url.includes('ushadvisors.com')) {
      const headers = options.headers || {};
      const authHeader = headers.Authorization || headers.authorization || 
                         (headers.get && headers.get('Authorization')) ||
                         (headers.get && headers.get('authorization'));
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        
        console.log('\n✅ TOKEN CAPTURED!');
        console.log('='.repeat(60));
        console.log('URL:', url);
        console.log('\n🔑 JWT Token:');
        console.log(token);
        
        // Decode token
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            
            console.log('\n📊 Token Info:');
            console.log('Email:', payload.Email || payload.email || 'N/A');
            console.log('Agent Number:', payload.AgentNumber || 'N/A');
            
            if (payload.exp) {
              const expiresAt = new Date(payload.exp * 1000);
              const expiresIn = Math.floor((payload.exp * 1000 - Date.now()) / 1000 / 60);
              console.log('Expires at:', expiresAt.toISOString());
              console.log('Expires in:', expiresIn, 'minutes');
              
              console.log('\n📋 Values to copy:');
              console.log('Token:', token);
              console.log('Expires at (ms):', payload.exp * 1000);
            }
          }
        } catch (e) {
          console.log('Could not decode token:', e.message);
        }
        
        console.log('='.repeat(60));
      }
    }
    
    return originalFetch.apply(this, args);
  };
  
  console.log('✅ Interceptor active. Make an API request now.');
})();
```

## Step 5: One-Liner to Get Token from Current Page

```javascript
// Quick one-liner - checks common storage locations
(() => {
  const findToken = (obj, path = '') => {
    if (typeof obj === 'string' && obj.startsWith('eyJ') && obj.split('.').length === 3) {
      console.log(`🔑 Found token at: ${path}`);
      console.log('Token:', obj);
      return obj;
    }
    if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string' && value.startsWith('eyJ')) {
          console.log(`🔑 Found token at: ${path}.${key}`);
          console.log('Token:', value);
          return value;
        }
        if (typeof value === 'object') {
          findToken(value, path ? `${path}.${key}` : key);
        }
      }
    }
  };
  
  console.log('=== Searching for JWT Token ===');
  findToken(window.localStorage);
  findToken(window.sessionStorage);
  findToken(window);
})();
```

## Step 6: Complete Extraction Script (All-in-One)

```javascript
// Complete script - extracts everything you need
(async () => {
  console.log('🔍 Extracting JWT Token and Session Info...\n');
  
  let token = null;
  let tokenInfo = null;
  
  // Method 1: Check storage
  console.log('1️⃣ Checking localStorage...');
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const value = localStorage.getItem(key);
    if (value && value.includes('eyJ') && value.split('.').length === 3) {
      token = value;
      console.log(`   ✅ Found in localStorage[${key}]`);
      break;
    }
  }
  
  if (!token) {
    console.log('2️⃣ Checking sessionStorage...');
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      const value = sessionStorage.getItem(key);
      if (value && value.includes('eyJ') && value.split('.').length === 3) {
        token = value;
        console.log(`   ✅ Found in sessionStorage[${key}]`);
        break;
      }
    }
  }
  
  // Method 2: Intercept next request
  if (!token) {
    console.log('3️⃣ Setting up request interceptor...');
    console.log('   💡 Make an API request (e.g., scrub phone number) to capture token');
    
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const url = args[0];
      const options = args[1] || {};
      const headers = options.headers || {};
      
      const authHeader = headers.Authorization || headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
        console.log('   ✅ Token captured from request!');
        decodeToken(token);
        return originalFetch.apply(this, args);
      }
      
      return originalFetch.apply(this, args);
    };
  } else {
    decodeToken(token);
  }
  
  function decodeToken(t) {
    try {
      const parts = t.split('.');
      if (parts.length !== 3) {
        console.error('   ❌ Invalid JWT format');
        return;
      }
      
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      
      console.log('\n📊 TOKEN INFORMATION:');
      console.log('='.repeat(60));
      console.log('🔑 Token:', t);
      console.log('\n📋 Payload:');
      console.log('   Email:', payload.Email || payload.email || 'N/A');
      console.log('   Agent Number:', payload.AgentNumber || 'N/A');
      console.log('   JTI:', payload.jti || 'N/A');
      
      if (payload.exp) {
        const expiresAt = new Date(payload.exp * 1000);
        const expiresIn = Math.floor((payload.exp * 1000 - Date.now()) / 1000 / 60);
        
        console.log('\n⏰ Expiration:');
        console.log('   Expires at:', expiresAt.toISOString());
        console.log('   Expires in:', expiresIn, 'minutes');
        console.log('   Is expired:', expiresAt < new Date() ? 'YES ❌' : 'NO ✅');
        
        console.log('\n📋 VALUES TO COPY:');
        console.log('Token:', t);
        console.log('Expires at (milliseconds):', payload.exp * 1000);
        console.log('Expires at (ISO):', expiresAt.toISOString());
      }
      
      console.log('='.repeat(60));
      
      tokenInfo = {
        token: t,
        email: payload.Email || payload.email,
        agentNumber: payload.AgentNumber,
        expiresAt: payload.exp ? payload.exp * 1000 : null,
        expiresAtISO: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
      };
      
      // Copy to clipboard if possible
      if (navigator.clipboard) {
        navigator.clipboard.writeText(t).then(() => {
          console.log('\n✅ Token copied to clipboard!');
        });
      }
      
    } catch (error) {
      console.error('   ❌ Error decoding token:', error);
    }
  }
})();
```

## Quick Reference: What to Copy

After running the scripts above, you'll need:

1. **Token**: The full JWT token (starts with `eyJ...`)
2. **Expires at**: Timestamp in milliseconds (from `payload.exp * 1000`)
3. **Agent Number**: From `payload.AgentNumber`

## Next Steps

Once you have the token:
1. Update your session file with the new token
2. Update `expires_at` with the expiration timestamp
3. Sync to production

See `docs/token-expired-solution.md` for how to update the session.
