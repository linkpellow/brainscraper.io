/**
 * Test script to verify Crokodial token fetching works correctly
 */

import { getUshaToken, clearTokenCache } from '../utils/getUshaToken';

async function testTokenFetching() {
  console.log('🧪 Testing Crokodial Token Fetcher\n');
  console.log('='.repeat(60));
  
  // Test 1: Fetch token from Crokodial
  console.log('\n📋 Test 1: Fetching token from Crokodial API...');
  let token1: string;
  try {
    token1 = await getUshaToken();
    console.log(`✅ Token fetched: ${token1.substring(0, 50)}...`);
    console.log(`   Token length: ${token1.length} characters`);
    
    if (token1 === 'test-token-123') {
      console.log('⚠️  WARNING: Received test token from API. This may be expected in test environment.');
    }
  } catch (error) {
    console.error('❌ Test 1 failed:', error);
    return;
  }
  
  // Test 2: Verify caching works
  console.log('\n📋 Test 2: Testing token cache...');
  try {
    const token2 = await getUshaToken();
    console.log(`✅ Cached token retrieved: ${token2.substring(0, 50)}...`);
    
    if (token1 === token2) {
      console.log('✅ Cache working correctly - same token returned');
    } else {
      console.log('⚠️  Different token returned (cache may have expired or refreshed)');
    }
  } catch (error) {
    console.error('❌ Test 2 failed:', error);
    return;
  }
  
  // Test 3: Test with provided token (should override)
  console.log('\n📋 Test 3: Testing provided token priority...');
  try {
    const providedToken = 'provided-test-token-12345';
    const token3 = await getUshaToken(providedToken);
    
    if (token3 === providedToken) {
      console.log('✅ Provided token takes priority correctly');
    } else {
      console.log('❌ Provided token was not used!');
      console.log(`   Expected: ${providedToken}`);
      console.log(`   Got: ${token3.substring(0, 50)}...`);
    }
  } catch (error) {
    console.error('❌ Test 3 failed:', error);
    return;
  }
  
  // Test 4: Clear cache and verify fresh fetch
  console.log('\n📋 Test 4: Testing cache clear and fresh fetch...');
  try {
    clearTokenCache();
    const token4 = await getUshaToken();
    console.log(`✅ Fresh token fetched after cache clear: ${token4.substring(0, 50)}...`);
  } catch (error) {
    console.error('❌ Test 4 failed:', error);
    return;
  }
  
  // Test 5: Verify token format (should be JWT-like)
  console.log('\n📋 Test 5: Verifying token format...');
  try {
    const token5 = await getUshaToken();
    const parts = token5.split('.');
    
    if (parts.length === 3) {
      console.log('✅ Token appears to be valid JWT format (3 parts)');
    } else if (token5 === 'test-token-123') {
      console.log('⚠️  Test token format (expected in test environment)');
    } else {
      console.log(`⚠️  Token format unexpected: ${parts.length} parts (expected 3 for JWT)`);
    }
  } catch (error) {
    console.error('❌ Test 5 failed:', error);
    return;
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ All tests completed!\n');
}

// Run tests
testTokenFetching().catch(console.error);
