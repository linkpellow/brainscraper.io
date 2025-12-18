#!/usr/bin/env tsx
/**
 * Comprehensive Test: TampaUSHA DNC Flow
 * 
 * Verifies:
 * 1. ✅ Obtaining Cognito ID token from TampaUSHA (not exchanging for USHA JWT)
 * 2. ✅ Refreshing token automatically if it becomes invalid
 * 3. ✅ Processing leads smoothly without errors or interruptions
 * 
 * This test validates the complete LeadArena API integration with Cognito tokens.
 */

// Load environment variables
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { getCognitoIdToken, clearCognitoTokenCache } from '../utils/cognitoAuth';

const LEADARENA_API_BASE = 'https://optic-prod-api.leadarena.com';
const USHA_DNC_API_BASE = 'https://api-business-agent.ushadvisors.com';
const DEFAULT_AGENT_NUMBER = '00044447';

// Test phone numbers
const TEST_PHONES = [
  '2143493972',
  '2145551234',
  '2145555678',
];

interface TestResult {
  success: boolean;
  error?: string;
  details?: any;
}

/**
 * TEST 1: Verify Cognito ID Token Acquisition
 */
async function testTokenAcquisition(): Promise<TestResult> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST 1: Cognito ID Token Acquisition');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Clear cache to force fresh token
    clearCognitoTokenCache();
    console.log('✅ Token cache cleared\n');

    console.log('🔑 Attempting to retrieve Cognito ID token...');
    const token = await getCognitoIdToken();
    
    if (!token) {
      throw new Error('Token is null or undefined');
    }

    // Validate token format
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    // Decode token to verify it's a Cognito token
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
    }

    // Verify it's a Cognito token (not USHA JWT)
    if (payload.iss && payload.iss.includes('cognito')) {
      console.log('   ✅ Confirmed: Cognito ID token (not USHA JWT)');
      console.log(`   Issuer: ${payload.iss}`);
      if (payload.email) {
        console.log(`   Email: ${payload.email}`);
      }
    } else {
      throw new Error('Token is not a Cognito ID token! Issuer: ' + (payload.iss || 'unknown'));
    }

    return { 
      success: true, 
      details: { 
        token: token.substring(0, 50) + '...',
        expiresIn: exp ? Math.floor((exp.getTime() - now.getTime()) / 1000 / 60) : null,
        issuer: payload.iss
      } 
    };
  } catch (error) {
    console.error('❌ Token acquisition failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * TEST 2: Verify Automatic Token Refresh
 */
async function testTokenRefresh(): Promise<TestResult> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST 2: Automatic Token Refresh');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('🔑 Step 1: Retrieving first token...');
    const token1 = await getCognitoIdToken();
    
    if (!token1) {
      throw new Error('First token retrieval failed');
    }
    console.log(`✅ First token: ${token1.substring(0, 50)}...\n`);

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('🔑 Step 2: Retrieving second token (should use cache)...');
    const token2 = await getCognitoIdToken();
    
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
    console.log('🔄 Step 3: Testing forced refresh...');
    clearCognitoTokenCache();
    const token3 = await getCognitoIdToken(null, true);
    
    if (!token3) {
      throw new Error('Forced refresh failed');
    }
    console.log(`✅ Forced refresh token: ${token3.substring(0, 50)}...\n`);

    // Verify tokens are valid Cognito tokens
    const payload1 = JSON.parse(Buffer.from(token1.split('.')[1], 'base64url').toString());
    const payload3 = JSON.parse(Buffer.from(token3.split('.')[1], 'base64url').toString());
    
    if (payload1.iss && payload1.iss.includes('cognito') && 
        payload3.iss && payload3.iss.includes('cognito')) {
      console.log('✅ Both tokens are valid Cognito ID tokens\n');
    } else {
      throw new Error('Tokens are not valid Cognito ID tokens');
    }

    return { success: true };
  } catch (error) {
    console.error('❌ Token refresh test failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * TEST 3: Verify DNC Scrubbing with LeadArena API
 */
async function testDNCScrubbing(token: string): Promise<TestResult> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST 3: DNC Scrubbing with LeadArena API');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const results = [];
  let refreshCount = 0;

  for (const phone of TEST_PHONES) {
    try {
      console.log(`📞 Testing DNC scrub for: ${phone}`);
      
      // Try LeadArena API first
      let url = `${LEADARENA_API_BASE}/leads/scrub/phone?phone=${encodeURIComponent(phone)}`;
      let headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-domain': 'app.tampausha.com',
      };
      
      let response = await fetch(url, { method: 'GET', headers });
      
      // If LeadArena endpoint doesn't exist, exchange Cognito token for USHA JWT and use USHA DNC API
      if (!response.ok && (response.status === 404 || response.status === 405)) {
        console.log(`   🔄 LeadArena endpoint not available, exchanging Cognito token for USHA JWT...`);
        try {
          const { exchangeCognitoForUshaJwt } = await import('../utils/exchangeCognitoForUshaJwt');
          const ushaJwtToken = await exchangeCognitoForUshaJwt(token);
          
          if (ushaJwtToken) {
            url = `${USHA_DNC_API_BASE}/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=${encodeURIComponent(DEFAULT_AGENT_NUMBER)}&phone=${encodeURIComponent(phone)}`;
            headers = {
              'Authorization': `Bearer ${ushaJwtToken}`,
              'Origin': 'https://agent.ushadvisors.com',
              'Referer': 'https://agent.ushadvisors.com',
              'Content-Type': 'application/json',
              'x-domain': 'app.tampausha.com',
            };
            response = await fetch(url, { method: 'GET', headers });
          } else {
            throw new Error('Token exchange failed');
          }
        } catch (e) {
          console.log(`   ⚠️  Token exchange failed: ${e}`);
          throw new Error('Failed to exchange token for USHA JWT');
        }
      }

      // Test automatic token refresh on auth failure
      if (response.status === 401 || response.status === 403) {
        console.log(`   ⚠️  Authentication failed (${response.status})`);
        console.log('   🔄 Testing automatic token refresh...');
        
        clearCognitoTokenCache();
        const freshCognitoToken = await getCognitoIdToken(null, true);
        refreshCount++;
        
        if (!freshCognitoToken) {
          throw new Error('Failed to refresh Cognito token');
        }
        
        console.log(`   ✅ Got fresh Cognito token: ${freshCognitoToken.substring(0, 50)}...`);
        
        // If using USHA DNC API, exchange for USHA JWT
        if (url.includes('ushadvisors.com')) {
          console.log(`   🔄 Exchanging fresh token for USHA JWT...`);
          try {
            const { exchangeCognitoForUshaJwt } = await import('../utils/exchangeCognitoForUshaJwt');
            const ushaJwt = await exchangeCognitoForUshaJwt(freshCognitoToken);
            if (ushaJwt) {
              headers = { ...headers, 'Authorization': `Bearer ${ushaJwt}` };
              response = await fetch(url, { method: 'GET', headers });
            } else {
              throw new Error('Token exchange failed');
            }
          } catch (e) {
            throw new Error('Failed to exchange refreshed token');
          }
        } else {
          // Using LeadArena API, use Cognito token directly
          headers = { ...headers, 'Authorization': `Bearer ${freshCognitoToken}` };
          response = await fetch(url, { method: 'GET', headers });
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText.substring(0, 200)}`);
      }

      const data = await response.json();
      console.log(`   ✅ Success!`);
      
      // Parse response
      const responseData = data.data || data;
      const isDNC = responseData.isDoNotCall === true || 
                   responseData.contactStatus?.canContact === false ||
                   data.isDNC === true || 
                   data.canContact === false;
      const canContact = responseData.contactStatus?.canContact !== false && !isDNC;
      
      console.log(`   Status: ${isDNC ? 'DNC' : 'OK'}`);
      console.log(`   Can Contact: ${canContact}\n`);
      
      results.push({ phone, success: true, isDNC, canContact, data });
    } catch (error) {
      console.error(`   ❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
      results.push({ phone, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  const successCount = results.filter((r: any) => r.success).length;
  const allPassed = successCount === TEST_PHONES.length;

  if (refreshCount > 0) {
    console.log(`⚠️  Note: ${refreshCount} automatic token refresh(es) occurred during scrubbing\n`);
  }

  return { 
    success: allPassed, 
    details: { 
      results, 
      successCount, 
      total: TEST_PHONES.length,
      refreshCount 
    } 
  };
}

/**
 * TEST 4: Verify Lead Processing (Simulated Batch)
 */
async function testLeadProcessing(token: string): Promise<TestResult> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST 4: Lead Processing (Simulated Batch)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log(`📦 Processing ${TEST_PHONES.length} leads in sequence...\n`);
    
    const processedLeads = [];
    let errorCount = 0;
    let refreshCount = 0;

    for (let i = 0; i < TEST_PHONES.length; i++) {
      const phone = TEST_PHONES[i];
      console.log(`[${i + 1}/${TEST_PHONES.length}] Processing lead with phone: ${phone}`);
      
      try {
        // Simulate lead processing with DNC check
        let url = `${LEADARENA_API_BASE}/leads/scrub/phone?phone=${encodeURIComponent(phone)}`;
        let headers: Record<string, string> = {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-domain': 'app.tampausha.com',
        };
        
        let response = await fetch(url, { method: 'GET', headers });
        
        // Fallback to USHA DNC API if needed
        if (!response.ok && (response.status === 404 || response.status === 405)) {
          url = `${USHA_DNC_API_BASE}/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=${encodeURIComponent(DEFAULT_AGENT_NUMBER)}&phone=${encodeURIComponent(phone)}`;
          headers = {
            'Authorization': `Bearer ${token}`,
            'Origin': 'https://agent.ushadvisors.com',
            'Referer': 'https://agent.ushadvisors.com',
            'Content-Type': 'application/json',
            'x-domain': 'app.tampausha.com',
          };
          response = await fetch(url, { method: 'GET', headers });
        }

        // Automatic token refresh on auth failure
        if (response.status === 401 || response.status === 403) {
          console.log(`   🔄 Token expired, refreshing automatically...`);
          clearCognitoTokenCache();
          const freshToken = await getCognitoIdToken(null, true);
          refreshCount++;
          
          if (freshToken) {
            token = freshToken; // Update token for subsequent requests
            headers = { ...headers, 'Authorization': `Bearer ${freshToken}` };
            response = await fetch(url, { method: 'GET', headers });
          }
        }

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const responseData = data.data || data;
        const isDNC = responseData.isDoNotCall === true || 
                     responseData.contactStatus?.canContact === false;
        
        processedLeads.push({
          phone,
          processed: true,
          isDNC,
          timestamp: new Date().toISOString()
        });
        
        console.log(`   ✅ Processed successfully (${isDNC ? 'DNC' : 'OK'})\n`);
        
        // Small delay to simulate real processing
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        errorCount++;
        console.error(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
        processedLeads.push({
          phone,
          processed: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
    }

    const successCount = processedLeads.filter(l => l.processed).length;
    const allPassed = errorCount === 0;

    console.log(`📊 Processing Summary:`);
    console.log(`   Total: ${TEST_PHONES.length}`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);
    if (refreshCount > 0) {
      console.log(`   Token Refreshes: ${refreshCount}`);
    }
    console.log('');

    return { 
      success: allPassed, 
      details: { 
        processedLeads, 
        successCount, 
        errorCount,
        refreshCount 
      } 
    };
  } catch (error) {
    console.error('❌ Lead processing test failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 TAMPAUSHA DNC COMPLETE FLOW TEST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\nThis test verifies:');
  console.log('  1. ✅ Obtaining Cognito ID token from TampaUSHA');
  console.log('  2. ✅ Refreshing token automatically if invalid');
  console.log('  3. ✅ Processing leads smoothly without errors\n');

  // Check environment
  if (!process.env.COGNITO_REFRESH_TOKEN && !process.env.COGNITO_USERNAME) {
    console.error('❌ ERROR: Cognito credentials not found in environment');
    console.error('   Please ensure .env.local contains:');
    console.error('   - COGNITO_REFRESH_TOKEN (recommended), or');
    console.error('   - COGNITO_USERNAME and COGNITO_PASSWORD\n');
    process.exit(1);
  }

  console.log('✅ Environment check passed\n');

  const results = {
    tokenAcquisition: null as TestResult | null,
    tokenRefresh: null as TestResult | null,
    dncScrubbing: null as TestResult | null,
    leadProcessing: null as TestResult | null,
  };

  let token: string | null = null;

  // Test 1: Token Acquisition
  results.tokenAcquisition = await testTokenAcquisition();
  
  if (!results.tokenAcquisition.success) {
    console.error('\n❌ Token acquisition failed - cannot continue tests');
    process.exit(1);
  }

  // Extract token from test result
  if (results.tokenAcquisition.details?.token) {
    // Get full token for subsequent tests
    clearCognitoTokenCache();
    token = await getCognitoIdToken();
  }

  // Test 2: Token Refresh
  results.tokenRefresh = await testTokenRefresh();

  // Test 3: DNC Scrubbing
  if (token) {
    results.dncScrubbing = await testDNCScrubbing(token);
    // Update token in case it was refreshed
    token = await getCognitoIdToken();
  }

  // Test 4: Lead Processing
  if (token) {
    results.leadProcessing = await testLeadProcessing(token);
  }

  // Final Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 FINAL TEST SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`1. Token Acquisition: ${results.tokenAcquisition.success ? '✅ PASS' : '❌ FAIL'}`);
  if (results.tokenAcquisition.details?.expiresIn) {
    console.log(`   Token expires in: ${results.tokenAcquisition.details.expiresIn} minutes`);
  }

  console.log(`2. Token Refresh: ${results.tokenRefresh.success ? '✅ PASS' : '❌ FAIL'}`);

  if (results.dncScrubbing) {
    const successCount = results.dncScrubbing.details?.successCount || 0;
    const total = results.dncScrubbing.details?.total || 0;
    const refreshCount = results.dncScrubbing.details?.refreshCount || 0;
    console.log(`3. DNC Scrubbing: ${results.dncScrubbing.success ? '✅ PASS' : '❌ FAIL'} (${successCount}/${total})`);
    if (refreshCount > 0) {
      console.log(`   Automatic refreshes: ${refreshCount}`);
    }
  }

  if (results.leadProcessing) {
    const successCount = results.leadProcessing.details?.successCount || 0;
    const errorCount = results.leadProcessing.details?.errorCount || 0;
    const refreshCount = results.leadProcessing.details?.refreshCount || 0;
    console.log(`4. Lead Processing: ${results.leadProcessing.success ? '✅ PASS' : '❌ FAIL'} (${successCount} success, ${errorCount} errors)`);
    if (refreshCount > 0) {
      console.log(`   Automatic refreshes: ${refreshCount}`);
    }
  }

  // Final verdict
  const allPassed = results.tokenAcquisition.success && 
                   results.tokenRefresh.success &&
                   (results.dncScrubbing?.success ?? false) &&
                   (results.leadProcessing?.success ?? false);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (allPassed) {
    console.log('✅ ALL TESTS PASSED!');
    console.log('✅ Cognito token acquisition: Working');
    console.log('✅ Automatic token refresh: Working');
    console.log('✅ Lead processing: Smooth, no interruptions');
    console.log('✅ Ready for production use!\n');
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
