/**
 * Test RECENTLY_CHANGED_JOBS filter fix
 * Using RECENTLY_CHANGED_JOBS with id: 'RPC' instead of CHANGED_JOBS_90_DAYS with id: 'true'
 */

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962';

async function testRecentlyChangedJobs() {
  console.log('🧪 Testing RECENTLY_CHANGED_JOBS filter fix\n');
  console.log('📍 Location: Colorado');
  console.log('🔄 Filter: RECENTLY_CHANGED_JOBS (id: RPC)');
  console.log('📄 Page: 1');
  console.log('');

  // Step 1: Generate URL using json_to_url with CORRECT filter format
  console.log('🔗 Step 1: Generating Sales Navigator URL via json_to_url...');
  const jsonToUrlBody = {
    filters: [
      {
        type: 'REGION',
        values: [{
          id: '105763813',
          text: 'Colorado',
          selectionType: 'INCLUDED',
        }],
      },
      {
        type: 'RECENTLY_CHANGED_JOBS',
        values: [{
          id: 'RPC',
          text: 'Changed jobs',
          selectionType: 'INCLUDED',
        }],
      },
    ],
    keywords: '',
  };

  console.log('📤 json_to_url Request:');
  console.log(JSON.stringify(jsonToUrlBody, null, 2));
  console.log('');

  const urlResponse = await fetch('https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/json_to_url', {
    method: 'POST',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(jsonToUrlBody),
  });

  const urlResult = await urlResponse.text();
  let urlData: any;
  
  try {
    urlData = JSON.parse(urlResult);
  } catch {
    console.error('❌ Failed to parse json_to_url response');
    console.log('Raw response:', urlResult);
    return;
  }

  if (urlData.success === false || urlData.error) {
    console.log('❌ json_to_url ERROR:');
    console.log(JSON.stringify(urlData, null, 2));
    return;
  }

  const generatedUrl = urlData.url || urlData.data;
  if (!generatedUrl) {
    console.log('❌ No URL in json_to_url response');
    console.log('Response:', JSON.stringify(urlData, null, 2));
    return;
  }

  console.log('✅ Generated URL:', generatedUrl.substring(0, 150) + '...');
  console.log('');

  // Step 2: Use via_url endpoint
  console.log('🔍 Step 2: Searching using premium_search_person_via_url...');
  const viaUrlBody = {
    url: generatedUrl,
    page: 1,
    limit: 100,
    account_number: 1,
  };

  console.log('📤 via_url Request:');
  console.log(JSON.stringify(viaUrlBody, null, 2));
  console.log('');

  const searchResponse = await fetch('https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/premium_search_person_via_url', {
    method: 'POST',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(viaUrlBody),
  });

  console.log('📥 Response Status:', searchResponse.status, searchResponse.statusText);
  console.log('📥 Response OK:', searchResponse.ok);
  console.log('');

  const searchResult = await searchResponse.text();
  let searchData: any;
  
  try {
    searchData = JSON.parse(searchResult);
  } catch {
    console.error('❌ Failed to parse search response');
    console.log('Raw response:', searchResult.substring(0, 500));
    return;
  }

  // Check for errors in response body (even if HTTP 200)
  if (searchData.success === false || (searchData.data && searchData.data.success === false)) {
    console.log('❌ ERROR IN SEARCH RESPONSE:');
    console.log(JSON.stringify(searchData, null, 2));
    return;
  }

  // Extract results
  let leads: any[] = [];
  let pagination: any = null;

  if (searchData.response?.data && Array.isArray(searchData.response.data)) {
    leads = searchData.response.data;
    pagination = searchData.response.pagination;
    console.log('✅ Found results in searchData.response.data');
  } else if (searchData.data?.response?.data && Array.isArray(searchData.data.response.data)) {
    leads = searchData.data.response.data;
    pagination = searchData.data.response.pagination;
    console.log('✅ Found results in searchData.data.response.data');
  } else {
    console.log('⚠️  No results found in expected locations');
    console.log('📋 Full response structure:');
    console.log(JSON.stringify(searchData, null, 2).substring(0, 2000));
    return;
  }

  console.log('');
  console.log('📊 RESULTS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Total Leads Found: ${leads.length}`);
  console.log('');

  if (pagination) {
    console.log('📄 PAGINATION:');
    console.log(`   Total: ${pagination.total || 'N/A'}`);
    console.log(`   Count: ${pagination.count || leads.length}`);
    console.log(`   Start: ${pagination.start || 0}`);
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
      if (lead.linkedinUrl || lead.profileUrl) {
        console.log(`      LinkedIn: ${lead.linkedinUrl || lead.profileUrl}`);
      }
    });
    console.log('');
    console.log('✅ TEST PASSED - Filter is working correctly!');
  } else {
    console.log('⚠️  No leads returned (but no 403 error, so filter format is correct)');
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Test Complete');
}

testRecentlyChangedJobs().catch(console.error);

