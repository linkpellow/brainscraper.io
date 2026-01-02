/**
 * Find USHA Refresh Token - Browser Console Helper
 * 
 * Run this in your browser console on agent.ushadvisors.com
 * 
 * This will search localStorage, sessionStorage, and cookies for USHA refresh tokens
 */

console.log('🔍 Searching for USHA Refresh Token...\n');

const results = {
  localStorage: [],
  sessionStorage: [],
  cookies: [],
  networkRequests: []
};

// Check localStorage
console.log('📦 Checking localStorage...');
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  const value = localStorage.getItem(key);
  
  if (key && (key.toLowerCase().includes('refresh') || key.toLowerCase().includes('token') || key.toLowerCase().includes('user'))) {
    console.log(`  Key: ${key}`);
    
    // Try to parse as JSON
    if (value && value.startsWith('{')) {
      try {
        const parsed = JSON.parse(value);
        if (parsed.refresh_token) {
          results.localStorage.push({ key, token: parsed.refresh_token });
          console.log(`    ✅ Found refresh_token!`);
          console.log(`    Token: ${parsed.refresh_token.substring(0, 80)}...`);
        }
        if (parsed.user && parsed.user.refresh_token) {
          results.localStorage.push({ key, token: parsed.user.refresh_token });
          console.log(`    ✅ Found user.refresh_token!`);
          console.log(`    Token: ${parsed.user.refresh_token.substring(0, 80)}...`);
        }
      } catch (e) {}
    } else if (value && value.length > 50 && !value.includes('cognito')) {
      // Might be a token directly
      if (key.includes('refresh')) {
        results.localStorage.push({ key, token: value });
        console.log(`    ✅ Potential refresh token (direct value)`);
        console.log(`    Token: ${value.substring(0, 80)}...`);
      }
    }
  }
}

// Check sessionStorage
console.log('\n📦 Checking sessionStorage...');
for (let i = 0; i < sessionStorage.length; i++) {
  const key = sessionStorage.key(i);
  const value = sessionStorage.getItem(key);
  
  if (key && (key.toLowerCase().includes('refresh') || key.toLowerCase().includes('token'))) {
    console.log(`  Key: ${key}`);
    if (value && value.length > 50 && !value.includes('cognito')) {
      results.sessionStorage.push({ key, token: value });
      console.log(`    ✅ Potential refresh token`);
      console.log(`    Token: ${value.substring(0, 80)}...`);
    }
  }
}

// Check cookies
console.log('\n🍪 Checking cookies...');
document.cookie.split(';').forEach(cookie => {
  const [key, value] = cookie.trim().split('=');
  if (key && (key.toLowerCase().includes('refresh') || key.toLowerCase().includes('token'))) {
    if (value && value.length > 50) {
      results.cookies.push({ key, token: value });
      console.log(`  ✅ Found: ${key}`);
      console.log(`    Token: ${value.substring(0, 80)}...`);
    }
  }
});

// Summary
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 SUMMARY');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const allTokens = [...results.localStorage, ...results.sessionStorage, ...results.cookies];

if (allTokens.length > 0) {
  console.log(`✅ Found ${allTokens.length} potential refresh token(s):\n`);
  allTokens.forEach((item, i) => {
    console.log(`${i + 1}. Source: ${item.key}`);
    console.log(`   Token: ${item.token.substring(0, 100)}...`);
    console.log(`   Length: ${item.token.length} characters`);
    console.log(`\n   💡 Set in Railway as:`);
    console.log(`   USHA_REFRESH_TOKEN=${item.token}\n`);
  });
} else {
  console.log('⚠️  No refresh tokens found in localStorage, sessionStorage, or cookies.');
  console.log('\n💡 Next steps:');
  console.log('   1. Check the Network tab in DevTools');
  console.log('   2. Look for requests that return a "refresh_token" field');
  console.log('   3. Check if the token is stored in IndexedDB or another storage mechanism');
}

// Store results globally for inspection
window.__ushaRefreshTokenSearch = results;
console.log('\n💡 Access full results: window.__ushaRefreshTokenSearch');

