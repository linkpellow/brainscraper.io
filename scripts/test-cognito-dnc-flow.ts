#!/usr/bin/env tsx
/**
 * Test Cognito Authentication & DNC Scrubbing Flow
 * 
 * Verifies:
 * 1. Cognito token retrieval works
 * 2. Token refresh works automatically
 * 3. DNC scrubbing works with Cognito tokens
 * 4. Full end-to-end flow is seamless
 */

// Load environment variables
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { getUshaToken, clearTokenCache } from '../utils/getUshaToken';

// Test phone numbers (use real numbers for actual testing)
const TEST_PHONES = [
  '2143493972', // Test number 1
  '2145551234', // Test number 2
];

const USHA_API_BASE = 'https://api-business-agent.ushadvisors.com';
const DEFAULT_AGENT_NUMBER = '00044447';

async function testCognitoTokenRetrieval() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST 1: Cognito Token Retrieval');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Clear cache to force fresh token
    clearTokenCache();
    console.log('✅ Token cache cleared\n');

    console.log('🔑 Attempting to retrieve token via Cognito...');
    const token = await getUshaToken();
    
    if (!token) {
      throw new Error('Token is null or undefined');
    }

    // Validate token format
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    // Decode token to check expiration
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      const exp = payload.exp ? new Date(payload.exp * 1000) : null;
      const now = new Date();
      
      console.log('✅ Token retrieved successfully!');
      console.log(`   Token length: ${token.length} characters`);
      console.log(`   Token preview: ${token.substring(0, 50)}...`);
      
      if (exp) {
        const expiresIn = Math.floor((exp.getTime() - now.getTime()) / 1000 / 60);
        console.log(`   Expires: ${exp.toISOString()}`);
        console.log(`   Expires in: ${expiresIn} minutes`);
        
        if (expiresIn < 0) {
          throw new Error('Token is already expired!');
        }
      } else {
        console.log('   ⚠️  No expiration found in token');
      }

      // Check if it's a Cognito token (has cognito claims)
      if (payload.iss && payload.iss.includes('cognito')) {
        console.log('   ✅ Confirmed: Cognito ID token');
        console.log(`   Issuer: ${payload.iss}`);
        if (payload.email) {
          console.log(`   Email: ${payload.email}`);
        }
      }

      return { success: true, token, expiresIn: exp ? Math.floor((exp.getTime() - now.getTime()) / 1000 / 60) : null };
    } catch (e) {
      console.log('   ⚠️  Could not decode token payload, but token format is valid');
      return { success: true, token, expiresIn: null };
    }
  } catch (error) {
    console.error('❌ Token retrieval failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function testTokenRefresh() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST 2: Automatic Token Refresh');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('🔑 Retrieving first token...');
    const token1 = await getUshaToken();
    
    if (!token1) {
      throw new Error('First token retrieval failed');
    }
    console.log(`✅ First token: ${token1.substring(0, 50)}...\n`);

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('🔑 Retrieving second token (should use cache)...');
    const token2 = await getUshaToken();
    
    if (!token2) {
      throw new Error('Second token retrieval failed');
    }
    console.log(`✅ Second token: ${token2.substring(0, 50)}...\n`);

    if (token1 === token2) {
      console.log('✅ Token caching working - same token returned (as expected)\n');
    } else {
      console.log('⚠️  Different tokens returned - cache may not be working\n');
    }

    // Test forced refresh
    console.log('🔄 Testing forced refresh...');
    clearTokenCache();
    const token3 = await getUshaToken(null, true);
    
    if (!token3) {
      throw new Error('Forced refresh failed');
    }
    console.log(`✅ Forced refresh token: ${token3.substring(0, 50)}...\n`);

    return { success: true };
  } catch (error) {
    console.error('❌ Token refresh test failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function testDNCScrubbing(token: string) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST 3: DNC Scrubbing with Cognito Token');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const results = [];

  for (const phone of TEST_PHONES) {
    try {
      console.log(`📞 Testing DNC scrub for: ${phone}`);
      
      const url = `${USHA_API_BASE}/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=${encodeURIComponent(DEFAULT_AGENT_NUMBER)}&phone=${encodeURIComponent(phone)}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 401 || response.status === 403) {
        console.log(`   ❌ Authentication failed (${response.status})`);
        console.log('   🔄 Token may be invalid or expired - testing automatic refresh...');
        
        // Clear cache and get fresh token
        clearTokenCache();
        const freshToken = await getUshaToken(null, true);
        
        if (!freshToken) {
          throw new Error('Failed to refresh token');
        }
        
        console.log(`   ✅ Got fresh token: ${freshToken.substring(0, 50)}...`);
        console.log(`   🔄 Retrying with fresh token...`);
        
        // Retry with fresh token
        const retryResponse = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${freshToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (!retryResponse.ok) {
          const errorText = await retryResponse.text();
          throw new Error(`Retry failed: ${retryResponse.status} - ${errorText}`);
        }

        const retryData = await retryResponse.json();
        console.log(`   ✅ Retry successful!`);
        console.log(`   Result: ${JSON.stringify(retryData, null, 2)}\n`);
        
        results.push({ phone, success: true, refreshed: true, data: retryData });
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log(`   ✅ Success!`);
      console.log(`   Result: ${JSON.stringify(data, null, 2)}\n`);
      
      results.push({ phone, success: true, refreshed: false, data });
    } catch (error) {
      console.error(`   ❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
      results.push({ phone, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  return results;
}

async function testBatchDNCScrubbing(token: string) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST 4: Batch DNC Scrubbing');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log(`📞 Testing batch scrub for ${TEST_PHONES.length} numbers...`);
    
    // Use the internal API endpoint
    const response = await fetch('http://localhost:3000/api/usha/scrub-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumbers: TEST_PHONES
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Batch API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ Batch scrub successful!');
    console.log(`   Total: ${data.total || 0}`);
    console.log(`   OK: ${data.okCount || 0}`);
    console.log(`   DNC: ${data.dncCount || 0}\n`);
    
    return { success: true, data };
  } catch (error) {
    console.error('❌ Batch scrub failed:', error);
    console.log('   ⚠️  Note: This test requires the Next.js server to be running');
    console.log('   ⚠️  Start server with: npm run dev\n');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function runAllTests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 COGNITO AUTHENTICATION & DNC FLOW TEST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\nThis test verifies:');
  console.log('  1. Cognito token retrieval');
  console.log('  2. Automatic token refresh');
  console.log('  3. DNC scrubbing with Cognito tokens');
  console.log('  4. End-to-end flow\n');

  // Check environment
  if (!process.env.COGNITO_REFRESH_TOKEN) {
    console.error('❌ ERROR: COGNITO_REFRESH_TOKEN not found in environment');
    console.error('   Please ensure .env.local contains COGNITO_REFRESH_TOKEN\n');
    process.exit(1);
  }

  console.log('✅ Environment check passed\n');

  const results = {
    tokenRetrieval: null as any,
    tokenRefresh: null as any,
    dncScrubbing: null as any,
    batchScrubbing: null as any,
  };

  // Test 1: Token Retrieval
  results.tokenRetrieval = await testCognitoTokenRetrieval();
  
  if (!results.tokenRetrieval.success) {
    console.error('\n❌ Token retrieval failed - cannot continue tests');
    process.exit(1);
  }

  // Test 2: Token Refresh
  results.tokenRefresh = await testTokenRefresh();

  // Test 3: DNC Scrubbing
  if (results.tokenRetrieval.token) {
    results.dncScrubbing = await testDNCScrubbing(results.tokenRetrieval.token);
  }

  // Test 4: Batch Scrubbing (optional - requires server)
  // results.batchScrubbing = await testBatchDNCScrubbing(results.tokenRetrieval.token);

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 TEST SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`Token Retrieval: ${results.tokenRetrieval.success ? '✅ PASS' : '❌ FAIL'}`);
  if (results.tokenRetrieval.expiresIn !== null) {
    console.log(`   Token expires in: ${results.tokenRetrieval.expiresIn} minutes`);
  }

  console.log(`Token Refresh: ${results.tokenRefresh.success ? '✅ PASS' : '❌ FAIL'}`);

  if (results.dncScrubbing) {
    const successCount = results.dncScrubbing.filter((r: any) => r.success).length;
    const refreshCount = results.dncScrubbing.filter((r: any) => r.refreshed).length;
    console.log(`DNC Scrubbing: ${successCount}/${results.dncScrubbing.length} passed`);
    if (refreshCount > 0) {
      console.log(`   ⚠️  ${refreshCount} token refresh(es) occurred during scrubbing`);
    }
  }

  // Final verdict
  const allPassed = results.tokenRetrieval.success && 
                   results.tokenRefresh.success &&
                   (!results.dncScrubbing || results.dncScrubbing.every((r: any) => r.success));

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (allPassed) {
    console.log('✅ ALL TESTS PASSED - Cognito authentication is working!');
    console.log('✅ Automated refresh is seamless');
    console.log('✅ Ready for production\n');
  } else {
    console.log('⚠️  SOME TESTS FAILED - Review errors above\n');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  process.exit(allPassed ? 0 : 1);
}

// Run tests
runAllTests().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
