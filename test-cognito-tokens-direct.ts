/**
 * Test if Cognito tokens work directly with USHA DNC API
 */

import { getCognitoIdToken, getCognitoAccessToken } from './utils/cognitoAuth';

async function testCognitoTokensDirect() {
  console.log('🧪 Testing Cognito tokens directly with USHA DNC API...\n');

  try {
    // Get Cognito tokens
    console.log('1. Getting Cognito tokens...');
    const idToken = await getCognitoIdToken(null, false);
    const accessToken = await getCognitoAccessToken(null, false);

    if (!idToken || !accessToken) {
      console.error('❌ Failed to get Cognito tokens');
      return;
    }

    console.log('✅ Got Cognito tokens\n');

    // Test phone number
    const testPhone = '2694621403';
    const USHA_DNC_API_BASE = 'https://api-business-agent.ushadvisors.com';
    const currentContextAgentNumber = '00044447';
    const url = `${USHA_DNC_API_BASE}/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=${encodeURIComponent(currentContextAgentNumber)}&phone=${encodeURIComponent(testPhone)}`;

    // Test 1: Try with Cognito ID Token
    console.log('2. Testing with Cognito ID Token...');
    const response1 = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'accept': 'application/json, text/plain, */*',
        'Referer': 'https://agent.ushadvisors.com/',
        'Content-Type': 'application/json',
      },
    });

    console.log(`   Status: ${response1.status} ${response1.statusText}`);
    if (response1.ok) {
      const data1 = await response1.json();
      console.log('   ✅ ID Token WORKS!');
      console.log(`   Response: ${JSON.stringify(data1).substring(0, 200)}...`);
      console.log('\n✅ SOLUTION: Use Cognito ID Token directly!');
      return { success: true, tokenType: 'ID Token', token: idToken };
    } else {
      const error1 = await response1.text();
      console.log(`   ❌ ID Token failed: ${error1.substring(0, 200)}`);
    }

    // Test 2: Try with Cognito Access Token
    console.log('\n3. Testing with Cognito Access Token...');
    const response2 = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'accept': 'application/json, text/plain, */*',
        'Referer': 'https://agent.ushadvisors.com/',
        'Content-Type': 'application/json',
      },
    });

    console.log(`   Status: ${response2.status} ${response2.statusText}`);
    if (response2.ok) {
      const data2 = await response2.json();
      console.log('   ✅ Access Token WORKS!');
      console.log(`   Response: ${JSON.stringify(data2).substring(0, 200)}...`);
      console.log('\n✅ SOLUTION: Use Cognito Access Token directly!');
      return { success: true, tokenType: 'Access Token', token: accessToken };
    } else {
      const error2 = await response2.text();
      console.log(`   ❌ Access Token failed: ${error2.substring(0, 200)}`);
    }

    console.log('\n❌ Neither Cognito token works directly');
    console.log('   Token exchange is required.');
    return { success: false };

  } catch (error) {
    console.error('❌ Test failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

testCognitoTokensDirect()
  .then(result => {
    process.exit(result?.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
