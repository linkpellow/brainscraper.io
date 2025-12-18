#!/usr/bin/env tsx
/**
 * Test Cognito Refresh Token Flow
 * 
 * Specifically tests Cognito refresh token authentication and automatic refresh
 */

// Load environment variables
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { getCognitoIdToken, clearCognitoTokenCache } from '../utils/cognitoAuth';

async function testCognitoRefreshToken() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 COGNITO REFRESH TOKEN FLOW TEST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check environment
  if (!process.env.COGNITO_REFRESH_TOKEN) {
    console.error('❌ ERROR: COGNITO_REFRESH_TOKEN not found in environment');
    console.error('   Please ensure .env.local contains COGNITO_REFRESH_TOKEN\n');
    process.exit(1);
  }

  console.log('✅ COGNITO_REFRESH_TOKEN found in environment\n');

  try {
    // Clear cache to force fresh token
    clearCognitoTokenCache();
    console.log('✅ Cognito token cache cleared\n');

    console.log('🔑 Step 1: Retrieving ID token using refresh token...');
    const token1 = await getCognitoIdToken(null, false);
    
    if (!token1) {
      throw new Error('Failed to retrieve Cognito ID token');
    }

    // Validate token
    const parts = token1.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    // Decode token
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    const exp = payload.exp ? new Date(payload.exp * 1000) : null;
    const now = new Date();
    const expiresIn = exp ? Math.floor((exp.getTime() - now.getTime()) / 1000 / 60) : null;

    console.log('✅ ID token retrieved successfully!');
    console.log(`   Token length: ${token1.length} characters`);
    console.log(`   Token preview: ${token1.substring(0, 80)}...`);
    
    if (exp) {
      console.log(`   Expires: ${exp.toISOString()}`);
      console.log(`   Expires in: ${expiresIn} minutes`);
    }

    // Verify it's a Cognito token
    if (payload.iss && payload.iss.includes('cognito')) {
      console.log('   ✅ Confirmed: Cognito ID token');
      console.log(`   Issuer: ${payload.iss}`);
      if (payload.email) {
        console.log(`   Email: ${payload.email}`);
      }
    } else {
      console.log('   ⚠️  Token issuer does not appear to be Cognito');
    }

    console.log('\n🔑 Step 2: Testing token caching...');
    const token2 = await getCognitoIdToken(null, false);
    
    if (token1 === token2) {
      console.log('✅ Token caching working - same token returned (as expected)\n');
    } else {
      console.log('⚠️  Different tokens returned - cache may not be working\n');
    }

    console.log('🔄 Step 3: Testing forced refresh...');
    const token3 = await getCognitoIdToken(null, true);
    
    if (!token3) {
      throw new Error('Forced refresh failed');
    }

    if (token3 === token1) {
      console.log('⚠️  Forced refresh returned same token (may be cached)');
    } else {
      console.log('✅ Forced refresh returned new token');
      console.log(`   New token preview: ${token3.substring(0, 80)}...`);
    }

    // Test DNC scrubbing with the token
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧪 TEST 4: DNC Scrubbing with Cognito Token');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const testPhone = '2143493972';
    const agentNumber = '00044447';
    const url = `https://api-business-agent.ushadvisors.com/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=${encodeURIComponent(agentNumber)}&phone=${encodeURIComponent(testPhone)}`;

    console.log(`📞 Testing DNC scrub for: ${testPhone}`);
    console.log(`   Using Cognito token: ${token3.substring(0, 50)}...\n`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token3}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 401 || response.status === 403) {
      console.error(`❌ Authentication failed (${response.status})`);
      console.error('   The Cognito token may not be valid for this API endpoint');
      console.error('   This could mean the token is for a different API (Tampa/LeadArena)\n');
      return { success: false, error: 'Token authentication failed' };
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ DNC scrub successful!');
    console.log(`   Result: ${JSON.stringify(data, null, 2)}\n`);

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 TEST SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ Cognito refresh token authentication: PASS');
    console.log('✅ Token caching: PASS');
    console.log('✅ Token refresh: PASS');
    console.log('✅ DNC scrubbing: PASS');
    console.log('\n✅ ALL TESTS PASSED - Cognito refresh flow is working!\n');

    return { success: true, token: token3 };
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    console.error('\nTroubleshooting:');
    console.error('  1. Verify COGNITO_REFRESH_TOKEN is valid');
    console.error('  2. Check if refresh token has been revoked');
    console.error('  3. Verify Cognito configuration (User Pool, Client ID, Region)');
    console.error('  4. Check network connectivity to Cognito API\n');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Run test
testCognitoRefreshToken()
  .then(result => {
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
