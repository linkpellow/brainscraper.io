/**
 * Test rate limiting with burst detection
 * The issue might be that RapidAPI enforces a "burst limit" - e.g., 
 * you can make 5 requests per second, but only if they're spread out,
 * not all at once in a burst
 */

import * as fs from 'fs';
import * as path from 'path';

function loadTestLeads(): any[] {
  const resultsDir = path.join(process.cwd(), 'data', 'api-results');
  const allLeads: any[] = [];
  
  if (!fs.existsSync(resultsDir)) {
    return [];
  }
  
  const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.json') && f.startsWith('20')).sort().reverse();
  
  for (const file of files.slice(0, 2)) {
    try {
      const filePath = path.join(resultsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      let leads: any[] = [];
      
      if (data.processedResults && Array.isArray(data.processedResults)) {
        leads = data.processedResults;
      } else if (data.rawResponse?.response?.data && Array.isArray(data.rawResponse.response.data)) {
        leads = data.rawResponse.response.data;
      } else if (data.rawResponse?.data?.response?.data && Array.isArray(data.rawResponse.data.response.data)) {
        leads = data.rawResponse.data.response.data;
      } else if (data.results && Array.isArray(data.results)) {
        leads = data.results;
      } else if (data.rawResponse?.data && Array.isArray(data.rawResponse.data)) {
        leads = data.rawResponse.data;
      } else if (Array.isArray(data.rawResponse)) {
        leads = data.rawResponse;
      }
      
      allLeads.push(...leads);
    } catch (error) {
      // Ignore
    }
  }
  
  return allLeads.slice(0, 20);
}

function normalizeName(name: string): string {
  if (!name) return '';
  const firstPart = name.split(',')[0].trim();
  return firstPart.replace(/\.$/, '').trim();
}

function cleanNameForAPI(name: string): string {
  if (!name) return '';
  return name
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    .replace(/[^\w\s-]/g, '')
    .trim();
}

async function testWithBurstProtection(delayMs: number, testLeads: any[]): Promise<{
  successCount: number;
  error429Count: number;
  totalTime: number;
}> {
  console.log(`\n🧪 Testing with ${delayMs}ms delay (${(1000/delayMs).toFixed(2)} req/sec)`);
  console.log(`   Using burst protection: Ensuring requests are evenly spaced\n`);

  const results = {
    successCount: 0,
    error429Count: 0,
    totalTime: 0,
  };

  const startTime = Date.now();
  let lastRequestTime = 0;

  for (let i = 0; i < testLeads.length; i++) {
    const lead = testLeads[i];
    const rawFullName = lead.fullName || lead.name || lead.full_name || 
      (lead.firstName || lead.first_name ? 
        `${lead.firstName || lead.first_name} ${lead.lastName || lead.last_name || ''}`.trim() : 
        'Unknown');
    const fullName = normalizeName(rawFullName);
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    
    if (!firstName || !lastName) {
      continue;
    }

    const cleanedFirstName = cleanNameForAPI(firstName);
    const cleanedLastName = cleanNameForAPI(lastName);
    const fullNameClean = `${cleanedFirstName} ${cleanedLastName}`.trim();
    
    // CRITICAL: Ensure we wait the FULL delay since last request
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < delayMs) {
      const waitTime = delayMs - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    const requestStart = Date.now();

    try {
      const url = `http://localhost:3000/api/skip-tracing?name=${encodeURIComponent(fullNameClean)}&page=1`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
      });

      lastRequestTime = Date.now();

      if (response.status === 429) {
        results.error429Count++;
        console.log(`  ❌ Lead ${i + 1}: 429 Rate Limit`);
      } else if (response.ok) {
        results.successCount++;
        const data = await response.json().catch(() => ({}));
        const hasResults = data?.data?.PeopleDetails?.length > 0 || data?.PeopleDetails?.length > 0;
        console.log(`  ✅ Lead ${i + 1}: Success ${hasResults ? '✓' : '✗'}`);
      } else {
        console.log(`  ⚠️  Lead ${i + 1}: HTTP ${response.status}`);
      }
    } catch (error) {
      console.log(`  ❌ Lead ${i + 1}: Error`);
    }
  }

  results.totalTime = Date.now() - startTime;
  return results;
}

async function main() {
  console.log('🚀 Burst-Protected Rate Limit Test');
  console.log('===================================\n');
  console.log('Testing with proper spacing to avoid burst limits\n');

  const testLeads = loadTestLeads();
  
  if (testLeads.length === 0) {
    console.log('❌ No test leads found');
    process.exit(1);
  }

  console.log(`✅ Loaded ${testLeads.length} test leads\n`);

  // Test different delays with proper burst protection
  const delaysToTest = [200, 250, 300, 400, 500];
  
  let bestDelay = 0;
  let bestResults = { successCount: 0, error429Count: Infinity, totalTime: 0 };

  for (const delayMs of delaysToTest) {
    console.log(`\n${'='.repeat(60)}`);
    const results = await testWithBurstProtection(delayMs, testLeads);
    
    console.log(`\nResults: ${results.successCount} success, ${results.error429Count} 429 errors, ${Math.round(results.totalTime/1000)}s total`);
    
    if (results.error429Count === 0 && results.successCount > bestResults.successCount) {
      bestDelay = delayMs;
      bestResults = results;
    }
    
    // Wait between tests
    if (delayMs !== delaysToTest[delaysToTest.length - 1]) {
      console.log('\n⏳ Waiting 5 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('🎯 RECOMMENDATION');
  console.log('='.repeat(60));

  if (bestDelay > 0) {
    console.log(`\n✅ OPTIMAL DELAY: ${bestDelay}ms`);
    console.log(`   Rate: ${(1000/bestDelay).toFixed(2)} req/sec`);
    console.log(`   Results: ${bestResults.successCount} success, ${bestResults.error429Count} errors`);
    console.log(`\n💡 Update enrichData.ts:`);
    console.log(`   private readonly minDelayMs: number = ${bestDelay};`);
  } else {
    console.log(`\n❌ All tests had 429 errors. The API may have stricter limits.`);
    console.log(`   Try using 500ms delay (2 req/sec) as a safe fallback.`);
  }

  console.log('\n✅ Testing complete!\n');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
