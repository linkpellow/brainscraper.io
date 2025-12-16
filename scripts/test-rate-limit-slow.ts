/**
 * Test slower rate limits to find the actual working limit
 */

import * as fs from 'fs';
import * as path from 'path';

// Test even slower rate limits
const RATE_LIMITS_TO_TEST = [
  { delayMs: 1500, name: '0.67 req/sec (1500ms)', expectedRate: 0.67 },
  { delayMs: 2000, name: '0.5 req/sec (2000ms)', expectedRate: 0.5 },
  { delayMs: 3000, name: '0.33 req/sec (3000ms)', expectedRate: 0.33 },
];

// Load a few test leads
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
  
  return allLeads.slice(0, 15); // Use 15 leads for more thorough testing
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

async function testRateLimit(delayMs: number, testLeads: any[], testName: string): Promise<{
  success: boolean;
  totalRequests: number;
  successCount: number;
  error429Count: number;
  otherErrors: number;
  avgResponseTime: number;
  totalTime: number;
  errors: string[];
}> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 Testing: ${testName}`);
  console.log(`   Delay: ${delayMs}ms between requests`);
  console.log(`   Expected rate: ${(1000/delayMs).toFixed(2)} req/sec`);
  console.log(`   Test leads: ${testLeads.length}`);
  console.log(`${'='.repeat(60)}\n`);

  const results = {
    success: true,
    totalRequests: 0,
    successCount: 0,
    error429Count: 0,
    otherErrors: 0,
    avgResponseTime: 0,
    totalTime: 0,
    errors: [] as string[],
  };

  const startTime = Date.now();
  const responseTimes: number[] = [];

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
    
    // Wait for rate limit delay (except for first request)
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    const requestStart = Date.now();
    results.totalRequests++;

    try {
      const url = `http://localhost:3000/api/skip-tracing?name=${encodeURIComponent(fullNameClean)}&page=1`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
      });

      const responseTime = Date.now() - requestStart;
      responseTimes.push(responseTime);

      if (response.status === 429) {
        results.error429Count++;
        const errorText = await response.text().catch(() => 'Rate limit exceeded');
        results.errors.push(`Lead ${i + 1} (${fullNameClean}): 429`);
        console.log(`  ❌ Lead ${i + 1} (${fullNameClean.substring(0, 20)}...): 429 Rate Limit`);
      } else if (response.ok) {
        results.successCount++;
        const data = await response.json().catch(() => ({}));
        const hasResults = data?.data?.PeopleDetails?.length > 0 || data?.PeopleDetails?.length > 0;
        console.log(`  ✅ Lead ${i + 1} (${fullNameClean.substring(0, 20)}...): Success ${hasResults ? '✓' : '✗'}`);
      } else {
        results.otherErrors++;
        results.errors.push(`Lead ${i + 1} (${fullNameClean}): ${response.status}`);
        console.log(`  ⚠️  Lead ${i + 1} (${fullNameClean.substring(0, 20)}...): HTTP ${response.status}`);
      }
    } catch (error) {
      results.otherErrors++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.errors.push(`Lead ${i + 1} (${fullNameClean}): ${errorMsg}`);
      console.log(`  ❌ Lead ${i + 1} (${fullNameClean.substring(0, 20)}...): Error`);
    }
  }

  results.totalTime = Date.now() - startTime;
  results.avgResponseTime = responseTimes.length > 0 
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : 0;
  
  results.success = results.error429Count === 0 && results.otherErrors === 0;

  return results;
}

async function main() {
  console.log('🚀 Slow Rate Limit Test');
  console.log('Testing slower rates to find the actual working limit\n');

  const testLeads = loadTestLeads();
  
  if (testLeads.length === 0) {
    console.log('❌ No test leads found');
    process.exit(1);
  }

  console.log(`✅ Loaded ${testLeads.length} test leads\n`);

  const testResults: Array<{
    config: typeof RATE_LIMITS_TO_TEST[0];
    results: Awaited<ReturnType<typeof testRateLimit>>;
  }> = [];

  for (const config of RATE_LIMITS_TO_TEST) {
    const results = await testRateLimit(config.delayMs, testLeads, config.name);
    testResults.push({ config, results });

    // Wait longer between tests if we got errors
    if (results.error429Count > 0) {
      console.log(`\n⏳ Waiting 10 seconds before next test...`);
      await new Promise(resolve => setTimeout(resolve, 10000));
    } else {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 TEST RESULTS SUMMARY');
  console.log(`${'='.repeat(60)}\n`);

  console.log('Rate Limit | Success | 429 Errors | Other Errors | Avg Time | Total Time');
  console.log('-'.repeat(80));

  let bestConfig: typeof testResults[0] | null = null;

  for (const test of testResults) {
    const { config, results } = test;
    const successRate = results.totalRequests > 0 
      ? Math.round((results.successCount / results.totalRequests) * 100)
      : 0;
    
    const status = results.error429Count === 0 && results.otherErrors === 0 ? '✅' : 
                   results.error429Count === 0 ? '⚠️' : '❌';
    
    console.log(
      `${config.name.padEnd(25)} | ${status} ${successRate.toString().padStart(3)}% | ` +
      `${results.error429Count.toString().padStart(6)} | ${results.otherErrors.toString().padStart(7)} | ` +
      `${results.avgResponseTime.toString().padStart(4)}ms | ${Math.round(results.totalTime/1000).toString().padStart(5)}s`
    );

    if (results.error429Count === 0) {
      if (!bestConfig || config.delayMs < bestConfig.config.delayMs) {
        bestConfig = test;
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎯 RECOMMENDATION');
  console.log('='.repeat(60));

  if (bestConfig) {
    console.log(`\n✅ OPTIMAL RATE LIMIT: ${bestConfig.config.name}`);
    console.log(`   Delay: ${bestConfig.config.delayMs}ms`);
    console.log(`   Rate: ${(1000/bestConfig.config.delayMs).toFixed(2)} req/sec`);
    console.log(`   Status: No 429 errors`);
    console.log(`\n💡 Update enrichData.ts:`);
    console.log(`   private readonly minDelayMs: number = ${bestConfig.config.delayMs};`);
  } else {
    console.log(`\n❌ All tests had 429 errors. The API may have a burst limit or daily quota.`);
    console.log(`   Consider using ${RATE_LIMITS_TO_TEST[RATE_LIMITS_TO_TEST.length - 1].delayMs}ms delay as a safe fallback.`);
  }

  console.log('\n✅ Testing complete!\n');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
