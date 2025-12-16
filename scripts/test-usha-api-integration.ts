/**
 * Integration test: Verify token fetching works with actual USHA API endpoint
 */

import { getUshaToken, clearTokenCache } from '../utils/getUshaToken';

async function testIntegration() {
  console.log('🧪 Testing USHA API Integration with Auto Token Fetching\n');
  console.log('='.repeat(70));
  
  // Clear cache to force fresh fetch
  clearTokenCache();
  
  // Test 1: Get token
  console.log('\n📋 Step 1: Fetching token from Crokodial...');
  let token: string;
  try {
    token = await getUshaToken();
    console.log(`✅ Token obtained: ${token.substring(0, 60)}...`);
    console.log(`   Full length: ${token.length} chars`);
  } catch (error) {
    console.error('❌ Failed to get token:', error);
    return;
  }
  
  // Test 2: Use token with USHA API (test phone scrub)
  console.log('\n📋 Step 2: Testing token with USHA API (scrub phone endpoint)...');
  const testPhone = '2694621403';
  const agentNumber = '00044447';
  
  try {
    const url = `https://api-business-agent.ushadvisors.com/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=${encodeURIComponent(agentNumber)}&phone=${encodeURIComponent(testPhone)}`;
    
    console.log(`   Calling: ${url.substring(0, 80)}...`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://agent.ushadvisors.com',
        'Referer': 'https://agent.ushadvisors.com',
        'Content-Type': 'application/json',
      },
    });
    
    console.log(`   Response status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ USHA API call successful!');
      console.log(`   Phone: ${testPhone}`);
      console.log(`   DNC Status: ${result.data?.isDoNotCall ? 'YES' : 'NO'}`);
      console.log(`   Can Contact: ${result.data?.contactStatus?.canContact ? 'YES' : 'NO'}`);
      if (result.data?.contactStatus?.reason) {
        console.log(`   Reason: ${result.data.contactStatus.reason}`);
      }
    } else {
      const errorText = await response.text();
      console.error(`❌ USHA API error (${response.status}):`);
      console.error(`   ${errorText.substring(0, 200)}`);
      
      if (response.status === 401) {
        console.error('\n⚠️  Authentication failed - token may be invalid or expired');
        console.error('   This could mean:');
        console.error('   1. The token from Crokodial is a test token');
        console.error('   2. The token format is incorrect');
        console.error('   3. The token has expired');
      }
    }
  } catch (error) {
    console.error('❌ Network error calling USHA API:', error);
  }
  
  // Test 3: Verify token caching
  console.log('\n📋 Step 3: Verifying token cache...');
  try {
    const cachedToken = await getUshaToken();
    if (cachedToken === token) {
      console.log('✅ Cache working - same token returned');
    } else {
      console.log('⚠️  Different token returned (may have refreshed)');
    }
  } catch (error) {
    console.error('❌ Cache test failed:', error);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Integration test completed\n');
}

testIntegration().catch(console.error);
