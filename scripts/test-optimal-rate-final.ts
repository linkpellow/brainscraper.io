/**
 * Final test to find optimal rate limit
 * Accounts for the fact that we make 2 API calls per lead (search + person details)
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
  
  return allLeads.slice(0, 10); // Test with 10 leads = ~20 API calls
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

async function testRateLimit(delayMs: number, testLeads: any[]): Promise<{
  successCount: number;
  error429Count: number;
  totalRequests: number;
  totalTime: number;
}> {
  console.log(`\n🧪 Testing: ${delayMs}ms delay (${(1000/delayMs).toFixed(2)} req/sec)`);
  console.log(`   Simulating 2 calls per lead (search + person details)\n`);

  const results = {
    successCount: 0,
    error429Count: 0,
    totalRequests: 0,
    totalTime: 0,
  };

  const startTime = Date.now();
  let lastRequestTime = 0;

  // Simulate the actual enrichment flow: search call, then person details call
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
    
    // CALL 1: Search call
    const now1 = Date.now();
    const timeSinceLast1 = now1 - lastRequestTime;
    
    if (timeSinceLast1 < delayMs) {
      const waitTime = delayMs - timeSinceLast1;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    results.totalRequests++;
    const requestStart1 = Date.now();

    try {
      const url1 = `http://localhost:3000/api/skip-tracing?name=${encodeURIComponent(fullNameClean)}&page=1`;
      const response1 = await fetch(url1, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
      });

      lastRequestTime = Date.now();

      if (response1.status === 429) {
        results.error429Count++;
        console.log(`  ❌ Lead ${i + 1} Search: 429`);
        continue; // Skip person details if search fails
      } else if (response1.ok) {
        const data1 = await response1.json().catch(() => ({}));
        const peopleDetails = data1?.data?.PeopleDetails || data1?.PeopleDetails || [];
        
        if (peopleDetails.length > 0 && peopleDetails[0]['Person ID']) {
          // CALL 2: Person details call (simulating the actual flow)
          const now2 = Date.now();
          const timeSinceLast2 = now2 - lastRequestTime;
          
          if (timeSinceLast2 < delayMs) {
            const waitTime2 = delayMs - timeSinceLast2;
            await new Promise(resolve => setTimeout(resolve, waitTime2));
          }

          results.totalRequests++;
          const personId = peopleDetails[0]['Person ID'];
          
          const url2 = `http://localhost:3000/api/skip-tracing?peo_id=${encodeURIComponent(personId)}`;
          const response2 = await fetch(url2, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(60000),
          });

          lastRequestTime = Date.now();

          if (response2.status === 429) {
            results.error429Count++;
            console.log(`  ❌ Lead ${i + 1} Details: 429`);
          } else if (response2.ok) {
            results.successCount++;
            console.log(`  ✅ Lead ${i + 1}: Both calls succeeded`);
          } else {
            console.log(`  ⚠️  Lead ${i + 1} Details: HTTP ${response2.status}`);
          }
        } else {
          results.successCount++;
          console.log(`  ✅ Lead ${i + 1}: Search succeeded (no Person ID)`);
        }
      } else {
        console.log(`  ⚠️  Lead ${i + 1} Search: HTTP ${response1.status}`);
      }
    } catch (error) {
      console.log(`  ❌ Lead ${i + 1}: Error - ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  results.totalTime = Date.now() - startTime;
  return results;
}

async function main() {
  console.log('🚀 Final Rate Limit Test');
  console.log('=========================\n');
  console.log('Testing with realistic flow: search + person details calls\n');

  const testLeads = loadTestLeads();
  
  if (testLeads.length === 0) {
    console.log('❌ No test leads found');
    process.exit(1);
  }

  console.log(`✅ Loaded ${testLeads.length} test leads (~${testLeads.length * 2} API calls)\n`);

  // Test different delays
  const delaysToTest = [200, 250, 300, 400, 500];
  
  let bestDelay = 0;
  let bestResults = { successCount: 0, error429Count: Infinity, totalRequests: 0, totalTime: 0 };

  for (const delayMs of delaysToTest) {
    const results = await testRateLimit(delayMs, testLeads);
    
    console.log(`\nResults: ${results.successCount} success, ${results.error429Count} 429 errors, ${results.totalRequests} total requests, ${Math.round(results.totalTime/1000)}s total`);
    
    if (results.error429Count === 0 && results.successCount > bestResults.successCount) {
      bestDelay = delayMs;
      bestResults = results;
    }
    
    // Wait between tests
    if (delayMs !== delaysToTest[delaysToTest.length - 1]) {
      console.log('\n⏳ Waiting 10 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('🎯 FINAL RECOMMENDATION');
  console.log('='.repeat(60));

  if (bestDelay > 0) {
    console.log(`\n✅ OPTIMAL DELAY: ${bestDelay}ms`);
    console.log(`   Rate: ${(1000/bestDelay).toFixed(2)} req/sec`);
    console.log(`   Results: ${bestResults.successCount} success, ${bestResults.error429Count} 429 errors`);
    console.log(`   Total requests: ${bestResults.totalRequests}`);
    console.log(`\n💡 Update enrichData.ts:`);
    console.log(`   private readonly minDelayMs: number = ${bestDelay};`);
  } else {
    console.log(`\n⚠️  All tests had some 429 errors.`);
    console.log(`   Recommendation: Use 300ms delay (3.33 req/sec) as a safe fallback.`);
    console.log(`   This accounts for 2 calls per lead and provides buffer.`);
  }

  console.log('\n✅ Testing complete!\n');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
