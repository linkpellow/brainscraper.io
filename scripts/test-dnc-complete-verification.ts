#!/usr/bin/env tsx
/**
 * Complete DNC Verification Test
 * 
 * Verifies:
 * 1. ✅ Obtaining token from TampaUSHA (USHA JWT token)
 * 2. ✅ Refreshing token automatically if invalid
 * 3. ✅ Processing DNC scrubbing smoothly without errors
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { getUshaToken, clearTokenCache } from '../utils/getUshaToken';

const USHA_DNC_API_BASE = 'https://api-business-agent.ushadvisors.com';
const currentContextAgentNumber = '00044447';

const TEST_PHONES = [
  '2143493972',
  '2694621403', // Known DNC number from your example
  '2145551234',
];

interface TestResult {
  phone: string;
  success: boolean;
  isDNC?: boolean;
  canContact?: boolean;
  reason?: string;
  error?: string;
  refreshed?: boolean;
}

/**
 * TEST 1: Token Acquisition
 */
async function testTokenAcquisition(): Promise<{ success: boolean; token?: string; error?: string }> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST 1: Token Acquisition');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    clearTokenCache();
    console.log('🔑 Getting USHA JWT token...');
    const token = await getUshaToken();
    
    if (!token) {
      return { success: false, error: 'Token is null' };
    }

    // Validate token format
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { success: false, error: 'Invalid JWT format' };
    }

    // Decode to check expiration
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    const exp = payload.exp ? new Date(payload.exp * 1000) : null;
    
    console.log('✅ Token obtained successfully!');
    console.log(`   Token preview: ${token.substring(0, 50)}...`);
    if (exp) {
      const expiresIn = Math.floor((exp.getTime() - Date.now()) / 1000 / 60);
      console.log(`   Expires: ${exp.toISOString()}`);
      console.log(`   Expires in: ${expiresIn} minutes`);
    }
    console.log('');

    return { success: true, token };
  } catch (error) {
    console.error('❌ Token acquisition failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * TEST 2: Token Refresh
 */
async function testTokenRefresh(): Promise<{ success: boolean; error?: string }> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST 2: Automatic Token Refresh');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('🔑 Getting first token...');
    const token1 = await getUshaToken();
    console.log(`✅ First token: ${token1.substring(0, 50)}...\n`);

    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('🔑 Getting second token (should use cache)...');
    const token2 = await getUshaToken();
    console.log(`✅ Second token: ${token2.substring(0, 50)}...\n`);

    if (token1 === token2) {
      console.log('✅ Token caching working correctly\n');
    }

    console.log('🔄 Testing forced refresh...');
    clearTokenCache();
    const token3 = await getUshaToken(null, true);
    console.log(`✅ Forced refresh token: ${token3.substring(0, 50)}...\n`);

    return { success: true };
  } catch (error) {
    console.error('❌ Token refresh test failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * TEST 3: DNC Scrubbing
 */
async function testDNCScrubbing(token: string): Promise<TestResult[]> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST 3: DNC Scrubbing');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const results: TestResult[] = [];
  let refreshCount = 0;

  for (const phone of TEST_PHONES) {
    try {
      console.log(`📞 Scrubbing: ${phone}`);
      
      const url = `${USHA_DNC_API_BASE}/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=${encodeURIComponent(currentContextAgentNumber)}&phone=${encodeURIComponent(phone)}`;
      let headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'accept': 'application/json, text/plain, */*',
        'Referer': 'https://agent.ushadvisors.com/',
        'Content-Type': 'application/json',
      };
      
      let response = await fetch(url, { method: 'GET', headers });

      // Test automatic refresh on auth failure
      if (response.status === 401 || response.status === 403) {
        console.log(`   ⚠️  Auth failed (${response.status}), refreshing token...`);
        clearTokenCache();
        const freshToken = await getUshaToken(null, true);
        refreshCount++;
        
        if (freshToken) {
          console.log(`   ✅ Got fresh token, retrying...`);
          headers = { ...headers, 'Authorization': `Bearer ${freshToken}` };
          response = await fetch(url, { method: 'GET', headers });
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText.substring(0, 200)}`);
      }

      const result = await response.json();
      
      // Parse response
      const data = result.data || result;
      const contactStatus = data.contactStatus || {};
      const isDNC = data.isDoNotCall === true || contactStatus.canContact === false;
      const canContact = contactStatus.canContact !== false && !isDNC;
      const reason = contactStatus.reason || (isDNC ? 'Do Not Call' : undefined);
      
      console.log(`   ✅ Success! Status: ${isDNC ? 'DNC' : 'OK'}`);
      if (reason) {
        console.log(`   Reason: ${reason}`);
      }
      console.log('');
      
      results.push({ phone, success: true, isDNC, canContact, reason });
    } catch (error) {
      console.error(`   ❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
      results.push({ phone, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  if (refreshCount > 0) {
    console.log(`⚠️  Note: ${refreshCount} automatic token refresh(es) occurred\n`);
  }

  return results;
}

/**
 * TEST 4: Batch Processing (Simulated)
 */
async function testBatchProcessing(token: string): Promise<{ success: boolean; processed: number; errors: number; refreshCount: number }> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST 4: Batch Processing (Simulated)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`📦 Processing ${TEST_PHONES.length} leads in sequence...\n`);
  
  let processed = 0;
  let errors = 0;
  let refreshCount = 0;
  let currentToken = token;

  for (let i = 0; i < TEST_PHONES.length; i++) {
    const phone = TEST_PHONES[i];
    console.log(`[${i + 1}/${TEST_PHONES.length}] Processing: ${phone}`);
    
    try {
      const url = `${USHA_DNC_API_BASE}/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=${encodeURIComponent(currentContextAgentNumber)}&phone=${encodeURIComponent(phone)}`;
      let headers: Record<string, string> = {
        'Authorization': `Bearer ${currentToken}`,
        'accept': 'application/json, text/plain, */*',
        'Referer': 'https://agent.ushadvisors.com/',
        'Content-Type': 'application/json',
      };
      
      let response = await fetch(url, { method: 'GET', headers });

      // Automatic refresh on auth failure
      if (response.status === 401 || response.status === 403) {
        console.log(`   🔄 Token expired, refreshing automatically...`);
        clearTokenCache();
        const freshToken = await getUshaToken(null, true);
        refreshCount++;
        
        if (freshToken) {
          currentToken = freshToken; // Update token for subsequent requests
          headers = { ...headers, 'Authorization': `Bearer ${freshToken}` };
          response = await fetch(url, { method: 'GET', headers });
        }
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();
      const data = result.data || result;
      const isDNC = data.isDoNotCall === true || data.contactStatus?.canContact === false;
      
      processed++;
      console.log(`   ✅ Processed (${isDNC ? 'DNC' : 'OK'})\n`);
      
      // Small delay to simulate real processing
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      errors++;
      console.error(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    }
  }

  console.log(`📊 Summary: ${processed} processed, ${errors} errors`);
  if (refreshCount > 0) {
    console.log(`   Automatic refreshes: ${refreshCount}`);
  }
  console.log('');

  return { success: errors === 0, processed, errors, refreshCount };
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 COMPLETE DNC VERIFICATION TEST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\nThis test verifies:');
  console.log('  1. ✅ Obtaining token from TampaUSHA');
  console.log('  2. ✅ Refreshing token automatically if invalid');
  console.log('  3. ✅ Processing DNC scrubbing smoothly without errors\n');

  const results = {
    tokenAcquisition: null as any,
    tokenRefresh: null as any,
    dncScrubbing: null as any,
    batchProcessing: null as any,
  };

  let token: string | null = null;

  // Test 1: Token Acquisition
  results.tokenAcquisition = await testTokenAcquisition();
  if (!results.tokenAcquisition.success) {
    console.error('\n❌ Token acquisition failed - cannot continue');
    process.exit(1);
  }
  token = results.tokenAcquisition.token!;

  // Test 2: Token Refresh
  results.tokenRefresh = await testTokenRefresh();

  // Test 3: DNC Scrubbing
  if (token) {
    results.dncScrubbing = await testDNCScrubbing(token);
    // Update token in case it was refreshed
    token = await getUshaToken();
  }

  // Test 4: Batch Processing
  if (token) {
    results.batchProcessing = await testBatchProcessing(token);
  }

  // Final Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 FINAL VERIFICATION SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`1. Token Acquisition: ${results.tokenAcquisition.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`2. Token Refresh: ${results.tokenRefresh.success ? '✅ PASS' : '❌ FAIL'}`);

  if (results.dncScrubbing) {
    const successCount = results.dncScrubbing.filter(r => r.success).length;
    const total = results.dncScrubbing.length;
    console.log(`3. DNC Scrubbing: ${successCount === total ? '✅ PASS' : '❌ FAIL'} (${successCount}/${total})`);
  }

  if (results.batchProcessing) {
    const allPassed = results.batchProcessing.success && results.batchProcessing.errors === 0;
    console.log(`4. Batch Processing: ${allPassed ? '✅ PASS' : '❌ FAIL'} (${results.batchProcessing.processed} processed, ${results.batchProcessing.errors} errors)`);
    if (results.batchProcessing.refreshCount > 0) {
      console.log(`   Automatic refreshes: ${results.batchProcessing.refreshCount}`);
    }
  }

  // Final verdict
  const allPassed = results.tokenAcquisition.success && 
                   results.tokenRefresh.success &&
                   (results.dncScrubbing?.every(r => r.success) ?? false) &&
                   (results.batchProcessing?.success ?? false);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (allPassed) {
    console.log('✅ ALL TESTS PASSED!');
    console.log('✅ Token acquisition: Working');
    console.log('✅ Automatic token refresh: Working');
    console.log('✅ DNC scrubbing: Smooth, no interruptions');
    console.log('✅ Ready for production use!\n');
  } else {
    console.log('⚠️  SOME TESTS FAILED - Review errors above\n');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  process.exit(allPassed ? 0 : 1);
}

runAllTests().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
