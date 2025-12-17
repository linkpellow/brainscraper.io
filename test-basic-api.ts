/**
 * Test basic API access to verify API key works
 */

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962';

async function testBasic() {
  console.log('🧪 Testing Basic API Access\n');

  // Test 1: Empty request (should work)
  console.log('Test 1: Empty filters, keywords only');
  const response1 = await fetch('https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/premium_search_person', {
    method: 'POST',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filters: [],
      keywords: 'engineer',
      page: 1,
      limit: 10,
      account_number: 1,
    }),
  });

  const result1 = await response1.text();
  const data1 = JSON.parse(result1);
  console.log(`Status: ${response1.status}`);
  console.log(`Success: ${data1.success !== false ? 'YES' : 'NO'}`);
  if (data1.success === false) {
    console.log(`Error: ${data1.error}`);
  } else {
    const leads = data1.response?.data || data1.data?.response?.data || [];
    console.log(`Results: ${leads.length} leads`);
  }
  console.log('');

  // Test 2: CHANGED_JOBS_90_DAYS with keywords
  console.log('Test 2: CHANGED_JOBS_90_DAYS + keywords');
  const response2 = await fetch('https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/premium_search_person', {
    method: 'POST',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filters: [{
        type: 'CHANGED_JOBS_90_DAYS',
        values: [{ id: 'true', text: 'Changed jobs in last 90 days', selectionType: 'INCLUDED' }],
      }],
      keywords: 'Colorado',
      page: 1,
      limit: 10,
      account_number: 1,
    }),
  });

  const result2 = await response2.text();
  const data2 = JSON.parse(result2);
  console.log(`Status: ${response2.status}`);
  console.log(`Success: ${data2.success !== false ? 'YES' : 'NO'}`);
  if (data2.success === false) {
    console.log(`Error: ${data2.error}`);
  } else {
    const leads = data2.response?.data || data2.data?.response?.data || [];
    console.log(`Results: ${leads.length} leads`);
  }
}

testBasic().catch(console.error);
