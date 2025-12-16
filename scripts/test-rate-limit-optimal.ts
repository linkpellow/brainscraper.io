/**
 * Test script to find optimal rate limit for skip-tracing API
 * Tests different delays and monitors for 429 errors
 */

import * as fs from 'fs';
import * as path from 'path';

// Test different rate limits
const RATE_LIMITS_TO_TEST = [
  { delayMs: 200, name: '5 req/sec (200ms)', expectedRate: 5 },
  { delayMs: 250, name: '4 req/sec (250ms)', expectedRate: 4 },
  { delayMs: 333, name: '3 req/sec (333ms)', expectedRate: 3 },
  { delayMs: 500, name: '2 req/sec (500ms)', expectedRate: 2 },
  { delayMs: 1000, name: '1 req/sec (1000ms)', expectedRate: 1 },
];

// Load a few test leads
function loadTestLeads(): any[] {
  const resultsDir = path.join(process.cwd(), 'data', 'api-results');
  const allLeads: any[] = [];
  
  if (!fs.existsSync(resultsDir)) {
    console.log('📁 No api-results directory found');
    return [];
  }
  
  const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.json') && f.startsWith('20')).sort().reverse();
  
  for (const file of files.slice(0, 3)) { // Just use first 3 files
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
      console.error(`❌ Error reading ${file}:`, error);
    }
  }
  
  return allLeads.slice(0, 10); // Use first 10 leads for testing
}

function normalizeName(name: string): string {
  if (!name) return '';
  const firstPart = name.split(',')[0].trim();
  return firstPart.replace(/\.$/, '').trim();
}

function cleanNameForAPI(name: string): string {
  if (!name) return '';
  // Remove emojis and special characters
  return name
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Emojis
    .replace(/[^\w\s-]/g, '') // Special chars except hyphens
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
  console.log(`   Expected rate: ${Math.round(1000/delayMs)} req/sec`);
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
      console.log(`  ⏭️  Lead ${i + 1}: Skipping (no name)`);
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
      // Make API call
      const url = `http://localhost:3000/api/skip-tracing?name=${encodeURIComponent(fullNameClean)}&page=1`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      const responseTime = Date.now() - requestStart;
      responseTimes.push(responseTime);

      if (response.status === 429) {
        results.error429Count++;
        const errorText = await response.text().catch(() => 'Rate limit exceeded');
        results.errors.push(`Lead ${i + 1} (${fullNameClean}): 429 - ${errorText.substring(0, 100)}`);
        console.log(`  ❌ Lead ${i + 1} (${fullNameClean}): 429 Rate Limit (${responseTime}ms)`);
      } else if (response.ok) {
        results.successCount++;
        const data = await response.json().catch(() => ({}));
        const hasResults = data?.data?.PeopleDetails?.length > 0 || data?.PeopleDetails?.length > 0;
        console.log(`  ✅ Lead ${i + 1} (${fullNameClean}): Success (${responseTime}ms) ${hasResults ? '✓ Results' : '✗ No results'}`);
      } else {
        results.otherErrors++;
        const errorText = await response.text().catch(() => `HTTP ${response.status}`);
        results.errors.push(`Lead ${i + 1} (${fullNameClean}): ${response.status} - ${errorText.substring(0, 100)}`);
        console.log(`  ⚠️  Lead ${i + 1} (${fullNameClean}): HTTP ${response.status} (${responseTime}ms)`);
      }
    } catch (error) {
      results.otherErrors++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.errors.push(`Lead ${i + 1} (${fullNameClean}): ${errorMsg}`);
      console.log(`  ❌ Lead ${i + 1} (${fullNameClean}): Error - ${errorMsg}`);
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
  console.log('🚀 Rate Limit Optimization Test');
  console.log('================================\n');
  console.log('This will test different rate limits to find the optimal speed');
  console.log('Make sure your dev server is running (npm run dev)\n');

  // Load test leads
  console.log('📥 Loading test leads...');
  const testLeads = loadTestLeads();
  
  if (testLeads.length === 0) {
    console.log('❌ No test leads found');
    process.exit(1);
  }

  console.log(`✅ Loaded ${testLeads.length} test leads\n`);

  // Test each rate limit
  const testResults: Array<{
    config: typeof RATE_LIMITS_TO_TEST[0];
    results: Awaited<ReturnType<typeof testRateLimit>>;
  }> = [];

  for (const config of RATE_LIMITS_TO_TEST) {
    const results = await testRateLimit(config.delayMs, testLeads, config.name);
    testResults.push({ config, results });

    // If we got 429 errors, wait a bit before next test
    if (results.error429Count > 0) {
      console.log(`\n⏳ Waiting 5 seconds before next test (429 errors detected)...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Print summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 TEST RESULTS SUMMARY');
  console.log(`${'='.repeat(60)}\n`);

  console.log('Rate Limit | Success | 429 Errors | Other Errors | Avg Time | Total Time');
  console.log('-'.repeat(80));

  let bestConfig: typeof testResults[0] | null = null;
  let fastestNoErrors: typeof testResults[0] | null = null;

  for (const test of testResults) {
    const { config, results } = test;
    const successRate = results.totalRequests > 0 
      ? Math.round((results.successCount / results.totalRequests) * 100)
      : 0;
    
    const status = results.error429Count === 0 && results.otherErrors === 0 ? '✅' : '❌';
    
    console.log(
      `${config.name.padEnd(20)} | ${status} ${successRate.toString().padStart(3)}% | ` +
      `${results.error429Count.toString().padStart(6)} | ${results.otherErrors.toString().padStart(7)} | ` +
      `${results.avgResponseTime.toString().padStart(4)}ms | ${Math.round(results.totalTime/1000).toString().padStart(5)}s`
    );

    // Track best config (fastest with no errors)
    if (results.error429Count === 0 && results.otherErrors === 0) {
      if (!fastestNoErrors || config.delayMs < fastestNoErrors.config.delayMs) {
        fastestNoErrors = test;
      }
    }

    // Track overall best (lowest delay with acceptable error rate)
    if (results.error429Count === 0) {
      if (!bestConfig || config.delayMs < bestConfig.config.delayMs) {
        bestConfig = test;
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎯 RECOMMENDATIONS');
  console.log('='.repeat(60));

  if (fastestNoErrors) {
    console.log(`\n✅ OPTIMAL RATE LIMIT: ${fastestNoErrors.config.name}`);
    console.log(`   Delay: ${fastestNoErrors.config.delayMs}ms`);
    console.log(`   Rate: ${fastestNoErrors.config.expectedRate} req/sec`);
    console.log(`   Status: No errors, fastest safe speed`);
    console.log(`\n💡 Use this in enrichData.ts:`);
    console.log(`   private readonly minDelayMs: number = ${fastestNoErrors.config.delayMs};`);
  } else if (bestConfig) {
    console.log(`\n⚠️  BEST AVAILABLE: ${bestConfig.config.name}`);
    console.log(`   Delay: ${bestConfig.config.delayMs}ms`);
    console.log(`   Rate: ${bestConfig.config.expectedRate} req/sec`);
    console.log(`   Status: No 429 errors, but some other errors occurred`);
  } else {
    console.log(`\n❌ All tests had 429 errors. Try slower rates or check API limits.`);
  }

  // Show detailed errors if any
  const testsWithErrors = testResults.filter(t => t.results.errors.length > 0);
  if (testsWithErrors.length > 0) {
    console.log(`\n📋 ERROR DETAILS:`);
    for (const test of testsWithErrors) {
      if (test.results.errors.length > 0) {
        console.log(`\n${test.config.name}:`);
        test.results.errors.slice(0, 3).forEach(err => console.log(`  - ${err}`));
        if (test.results.errors.length > 3) {
          console.log(`  ... and ${test.results.errors.length - 3} more`);
        }
      }
    }
  }

  console.log('\n✅ Testing complete!\n');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
