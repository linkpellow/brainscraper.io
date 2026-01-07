/**
 * Test the auth_token found in localStorage
 */

const authToken = '24feb0df68ca60586427f08f135d69157e985e2d826542ba516d6cbb413228fe';

const USHA_AUTH_BASE = 'https://agent.ushadvisors.com';
const USHA_API_BASE = 'https://api-business-agent.ushadvisors.com';

const refreshEndpoints = [
  `${USHA_AUTH_BASE}/connect/token`,
  `${USHA_AUTH_BASE}/api/token/refresh`,
  `${USHA_AUTH_BASE}/api/token`,
  `${USHA_API_BASE}/connect/token`,
  `${USHA_API_BASE}/api/token/refresh`,
  `${USHA_API_BASE}/api/token`,
];

async function testAuthToken() {
  console.log('🧪 Testing auth_token as refresh token...\n');
  console.log(`Token: ${authToken.substring(0, 50)}...\n`);

  for (const endpoint of refreshEndpoints) {
    try {
      console.log(`Testing: ${endpoint}`);
      
      // Try as refresh_token
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: authToken
        }).toString()
      });

      console.log(`  Status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.access_token) {
          console.log(`  ✅ SUCCESS! Got access token`);
          console.log(`  Access token: ${data.access_token.substring(0, 50)}...`);
          return { success: true, endpoint, accessToken: data.access_token };
        }
      } else {
        const errorText = await response.text();
        console.log(`  ❌ Failed: ${errorText.substring(0, 100)}`);
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
    console.log('');
  }

  return { success: false };
}

testAuthToken().then(result => {
  if (result.success) {
    console.log('\n✅ SOLUTION FOUND!');
    console.log(`Endpoint: ${result.endpoint}`);
    console.log(`Set in Railway: USHA_REFRESH_TOKEN=${authToken}`);
  } else {
    console.log('\n⚠️  auth_token does not work as refresh token');
    console.log('   It might be an API key or different type of token');
  }
  process.exit(result.success ? 0 : 1);
});
