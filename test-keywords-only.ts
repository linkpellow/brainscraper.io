/**
 * Test Colorado + Changed Jobs using keywords instead of filters
 */

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962';

async function testKeywordsOnly() {
  console.log('🧪 Testing Colorado + Changed Jobs using KEYWORDS\n');
  console.log('📍 Location: Colorado (in keywords)');
  console.log('🔄 Filter: changed_jobs_90_days (as filter)');
  console.log('📄 Page: 1');
  console.log('📊 Limit: 100\n');

  // Test: CHANGED_JOBS_90_DAYS filter + Colorado in keywords
  const requestBody = {
    filters: [{
      type: 'CHANGED_JOBS_90_DAYS',
      values: [{ id: 'true', text: 'Changed jobs in last 90 days', selectionType: 'INCLUDED' }],
    }],
    keywords: 'Colorado',
    page: 1,
    limit: 100,
    account_number: 1,
  };

  console.log('📤 Request Body:');
  console.log(JSON.stringify(requestBody, null, 2));
  console.log('');

  const response = await fetch('https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/premium_search_person', {
    method: 'POST',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  console.log('📥 Response Status:', response.status, response.statusText);
  console.log('📥 Response OK:', response.ok);
  console.log('');

  const result = await response.text();
  let data: any;
  
  try {
    data = JSON.parse(result);
  } catch {
    console.error('❌ Failed to parse response as JSON');
    console.log('Raw response:', result.substring(0, 500));
    return;
  }

  if (data.success === false || (data.data && data.data.success === false)) {
    console.log('❌ ERROR IN RESPONSE:');
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Extract results
  let leads: any[] = [];
  let pagination: any = null;

  if (data.response?.data && Array.isArray(data.response.data)) {
    leads = data.response.data;
    pagination = data.response.pagination;
  } else if (data.data?.response?.data && Array.isArray(data.data.response.data)) {
    leads = data.data.response.data;
    pagination = data.data.response.pagination;
  }

  console.log('📊 RESULTS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Total Leads Found: ${leads.length}`);
  console.log('');

  if (pagination) {
    console.log('📄 PAGINATION:');
    console.log(`   Total: ${pagination.total || 'N/A'}`);
    console.log(`   Count: ${pagination.count || leads.length}`);
    console.log(`   Has More: ${pagination.hasMore !== undefined ? pagination.hasMore : 'N/A'}`);
    console.log('');
  }

  if (leads.length > 0) {
    console.log('👤 SAMPLE LEADS (first 5):');
    leads.slice(0, 5).forEach((lead, i) => {
      const name = lead.name || lead.fullName || (lead.firstName && lead.lastName ? `${lead.firstName} ${lead.lastName}` : 'Unknown');
      console.log(`\n   ${i + 1}. ${name}`);
      console.log(`      Title: ${lead.title || lead.jobTitle || 'N/A'}`);
      console.log(`      Company: ${lead.company || lead.currentCompany || 'N/A'}`);
      console.log(`      Location: ${lead.location || lead.geoRegion || 'N/A'}`);
    });
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Test Complete');
}

testKeywordsOnly().catch(console.error);
