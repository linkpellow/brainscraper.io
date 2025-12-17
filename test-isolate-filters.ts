/**
 * Test filters separately to isolate the 403 issue
 */

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962';
const coloradoId = '105763813';
const coloradoUrn = `urn:li:fs_geo:${coloradoId}`;

async function testFilter(filterName: string, requestBody: any) {
  console.log(`\n🧪 Testing: ${filterName}`);
  console.log('📤 Request:', JSON.stringify(requestBody, null, 2));
  
  const response = await fetch('https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/premium_search_person', {
    method: 'POST',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const result = await response.text();
  const data = JSON.parse(result);
  
  if (data.success === false || (data.data && data.data.success === false)) {
    console.log(`❌ ERROR: ${data.error || data.data?.error}`);
    return { success: false, error: data.error || data.data?.error };
  }

  const leads = data.response?.data || data.data?.response?.data || [];
  console.log(`✅ SUCCESS: Found ${leads.length} leads`);
  return { success: true, count: leads.length };
}

async function runTests() {
  console.log('🔍 Testing Filters Separately\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Test 1: CHANGED_JOBS_90_DAYS alone
  await testFilter('CHANGED_JOBS_90_DAYS alone', {
    filters: [{
      type: 'CHANGED_JOBS_90_DAYS',
      values: [{ id: 'true', text: 'Changed jobs in last 90 days', selectionType: 'INCLUDED' }],
    }],
    keywords: '',
    page: 1,
    limit: 100,
    account_number: 1,
  });

  // Test 2: Colorado REGION alone
  await testFilter('Colorado REGION alone', {
    filters: [{
      type: 'REGION',
      values: [{ id: coloradoId, text: 'Colorado', selectionType: 'INCLUDED' }],
    }],
    keywords: '',
    page: 1,
    limit: 100,
    account_number: 1,
  });

  // Test 3: Colorado LOCATION alone
  await testFilter('Colorado LOCATION alone', {
    filters: [{
      type: 'LOCATION',
      values: [{ id: coloradoUrn, text: 'Colorado', selectionType: 'INCLUDED' }],
    }],
    keywords: '',
    page: 1,
    limit: 100,
    account_number: 1,
  });

  // Test 4: Combined REGION + CHANGED_JOBS_90_DAYS
  await testFilter('REGION + CHANGED_JOBS_90_DAYS', {
    filters: [
      {
        type: 'REGION',
        values: [{ id: coloradoId, text: 'Colorado', selectionType: 'INCLUDED' }],
      },
      {
        type: 'CHANGED_JOBS_90_DAYS',
        values: [{ id: 'true', text: 'Changed jobs in last 90 days', selectionType: 'INCLUDED' }],
      },
    ],
    keywords: '',
    page: 1,
    limit: 100,
    account_number: 1,
  });

  // Test 5: Combined LOCATION + CHANGED_JOBS_90_DAYS
  await testFilter('LOCATION + CHANGED_JOBS_90_DAYS', {
    filters: [
      {
        type: 'LOCATION',
        values: [{ id: coloradoUrn, text: 'Colorado', selectionType: 'INCLUDED' }],
      },
      {
        type: 'CHANGED_JOBS_90_DAYS',
        values: [{ id: 'true', text: 'Changed jobs in last 90 days', selectionType: 'INCLUDED' }],
      },
    ],
    keywords: '',
    page: 1,
    limit: 100,
    account_number: 1,
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ All tests complete');
}

runTests().catch(console.error);
