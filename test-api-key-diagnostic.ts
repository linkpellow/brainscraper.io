/**
 * Diagnostic script to test RapidAPI key validity and endpoint access
 */

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962';
const BASE_URL = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com';

interface TestResult {
  endpoint: string;
  status: number;
  success: boolean;
  error?: string;
  data?: any;
}

async function testEndpoint(endpoint: string, method: string = 'POST', body?: any): Promise<TestResult> {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data: any;
    
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return {
      endpoint,
      status: response.status,
      success: response.ok && data.success !== false,
      error: data.error || (response.ok ? undefined : `HTTP ${response.status}`),
      data: data,
    };
  } catch (error) {
    return {
      endpoint,
      status: 0,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runDiagnostics() {
  console.log('🔍 RapidAPI Key Diagnostic Test\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`API Key: ${RAPIDAPI_KEY.substring(0, 20)}...`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const tests: Array<{ name: string; endpoint: string; method: string; body?: any }> = [
    {
      name: 'Filter Suggestions - Company',
      endpoint: '/filter_company_suggestions',
      method: 'POST',
      body: { query: 'test' },
    },
    {
      name: 'Filter Suggestions - Location Region',
      endpoint: '/filter_geography_location_region_suggestions',
      method: 'POST',
      body: { query: 'colorado' },
    },
    {
      name: 'Filter - Recent Activities',
      endpoint: '/filter_recent_activities',
      method: 'POST',
      body: {},
    },
    {
      name: 'JSON to URL (simple)',
      endpoint: '/json_to_url',
      method: 'POST',
      body: {
        filters: [],
        keywords: 'test',
      },
    },
    {
      name: 'Premium Search Person (minimal)',
      endpoint: '/premium_search_person',
      method: 'POST',
      body: {
        account_number: 1,
        page: 1,
        keywords: 'test',
      },
    },
    {
      name: 'Premium Search Person via URL (simple)',
      endpoint: '/premium_search_person_via_url',
      method: 'POST',
      body: {
        account_number: 1,
        page: 1,
        url: 'https://www.linkedin.com/sales/search/people?keywords=test',
      },
    },
  ];

  const results: TestResult[] = [];

  for (const test of tests) {
    console.log(`🧪 Testing: ${test.name}...`);
    const result = await testEndpoint(test.endpoint, test.method, test.body);
    results.push(result);

    if (result.success) {
      console.log(`   ✅ SUCCESS (Status: ${result.status})`);
    } else {
      console.log(`   ❌ FAILED (Status: ${result.status})`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      if (result.data && typeof result.data === 'object') {
        console.log(`   Response: ${JSON.stringify(result.data).substring(0, 200)}`);
      }
    }
    console.log('');

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const status403 = results.filter(r => r.status === 403).length;
  const status401 = results.filter(r => r.status === 401).length;

  console.log(`✅ Successful: ${successful}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);
  console.log(`🚫 403 Forbidden: ${status403}`);
  console.log(`🔐 401 Unauthorized: ${status401}`);

  if (status401 > 0) {
    console.log('\n⚠️  401 Unauthorized suggests the API key is invalid or expired.');
  }

  if (status403 > 0 && status401 === 0) {
    console.log('\n⚠️  403 Forbidden suggests:');
    console.log('   - The API key is valid but the subscription tier may not include these endpoints');
    console.log('   - The subscription may have been downgraded');
    console.log('   - There may be billing/payment issues');
    console.log('   - The endpoints may require a higher subscription tier');
  }

  if (successful > 0 && failed > 0) {
    console.log('\n✅ Some endpoints work, suggesting partial access or tier limitations.');
  }

  if (failed === results.length) {
    console.log('\n❌ All endpoints failed. This strongly suggests:');
    console.log('   1. API key is invalid/expired');
    console.log('   2. Subscription is inactive or cancelled');
    console.log('   3. Billing/payment issue');
    console.log('   4. RapidAPI service outage (check their status page)');
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n💡 Next Steps:');
  console.log('   1. Check RapidAPI Dashboard: https://rapidapi.com/developer/billing');
  console.log('   2. Verify API key matches dashboard');
  console.log('   3. Check subscription tier and included endpoints');
  console.log('   4. Verify billing/payment status');
  console.log('   5. Contact RapidAPI support if subscription is active');
}

runDiagnostics().catch(console.error);
