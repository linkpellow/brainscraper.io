/**
 * Test Colorado + Changed Jobs 90 Days Search - Direct API Test
 * Tests RapidAPI directly to verify the filter combination works
 */

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962';

async function testColorado90DaysDirect() {
  console.log('🧪 Testing Colorado + Changed Jobs 90 Days Search (Direct API)\n');
  console.log('📍 Location: Colorado');
  console.log('🔄 Filter: CHANGED_JOBS_90_DAYS');
  console.log('📄 Page: 1');
  console.log('📊 Limit: 100\n');

  // Step 1: Use known Colorado location ID
  // Colorado ID from previous tests: 105763813
  const coloradoId = '105763813';
  const coloradoUrn = `urn:li:fs_geo:${coloradoId}`;
  console.log(`📍 Step 1: Using Colorado location ID`);
  console.log(`   ✅ Colorado ID: ${coloradoId}`);
  console.log(`   ✅ Colorado URN: ${coloradoUrn}\n`);

  // Step 2: Build request with filters
  console.log('🔧 Step 2: Building request with filters...');
  // Try both REGION and LOCATION types to see which works
  const testConfigs = [
    { type: 'REGION', id: coloradoId },
    { type: 'LOCATION', id: coloradoUrn },
  ];

  for (const config of testConfigs) {
    console.log(`\n🧪 Testing with ${config.type} type...`);
    
    const requestBody = {
      filters: [
        {
          type: config.type,
          values: [{
            id: config.id,
            text: 'Colorado',
            selectionType: 'INCLUDED',
          }],
        },
        {
          type: 'CHANGED_JOBS_90_DAYS',
          values: [{
            id: 'true',
            text: 'Changed jobs in last 90 days',
            selectionType: 'INCLUDED',
          }],
        },
      ],
      keywords: '',
      page: 1,
      limit: 100,
      account_number: 1,
    };

    console.log('📤 Request Body:');
    console.log(JSON.stringify(requestBody, null, 2));
    console.log('');

    // Step 3: Make the API call
    console.log('🌐 Making API request to RapidAPI...');
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
      continue;
    }

    console.log('📦 Response Structure:');
    console.log('   Top-level keys:', Object.keys(data));
    console.log('');

    // Check for errors
    if (!response.ok) {
      console.log(`❌ HTTP ERROR (${response.status}):`);
      console.log(JSON.stringify(data, null, 2));
      continue;
    }

    // Check for error in response body
    if (data.success === false || (data.data && data.data.success === false)) {
      console.log(`❌ ERROR IN RESPONSE BODY (${config.type}):`);
      console.log(JSON.stringify(data, null, 2));
      continue;
    }

    // Extract results
    let leads: any[] = [];
    let pagination: any = null;

    if (data.response?.data && Array.isArray(data.response.data)) {
      leads = data.response.data;
      pagination = data.response.pagination;
      console.log('✅ Found results in data.response.data');
    } else if (data.data?.response?.data && Array.isArray(data.data.response.data)) {
      leads = data.data.response.data;
      pagination = data.data.response.pagination;
      console.log('✅ Found results in data.data.response.data');
    } else if (Array.isArray(data.data)) {
      leads = data.data;
      pagination = data.pagination;
      console.log('✅ Found results in data.data (direct array)');
    } else {
      console.log('⚠️  No results found in expected locations');
      console.log('📋 Full response structure:');
      console.log(JSON.stringify(data, null, 2).substring(0, 2000));
      continue;
    }

    console.log('');
    console.log('📊 RESULTS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Total Leads Found: ${leads.length}`);
    console.log(`✅ Filter Type Used: ${config.type}`);
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
        console.log(`\n   ${i + 1}. ${lead.name || lead.fullName || (lead.firstName && lead.lastName ? lead.firstName + ' ' + lead.lastName : 'Unknown')}`);
        console.log(`      Title: ${lead.title || lead.jobTitle || 'N/A'}`);
        console.log(`      Company: ${lead.company || lead.currentCompany || 'N/A'}`);
        console.log(`      Location: ${lead.location || lead.geoRegion || 'N/A'}`);
        if (lead.linkedinUrl || lead.profileUrl) {
          console.log(`      LinkedIn: ${lead.linkedinUrl || lead.profileUrl}`);
        }
      });
      
      console.log('');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ Test Complete - Found working configuration!');
      return; // Stop after first successful test
    } else {
      console.log('⚠️  No leads returned with this configuration');
    }
  }

  console.log('📤 Request Body:');
  console.log(JSON.stringify(requestBody, null, 2));
  console.log('');

  // Step 3: Make the API call
  console.log('🌐 Step 3: Making API request to RapidAPI...');
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

  console.log('📦 Response Structure:');
  console.log('   Top-level keys:', Object.keys(data));
  console.log('');

  // Check for errors
  if (!response.ok) {
    console.log('❌ HTTP ERROR RESPONSE:');
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Check for error in response body
  if (data.success === false || (data.data && data.data.success === false)) {
    console.log('❌ ERROR IN RESPONSE BODY:');
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Extract results
  let leads: any[] = [];
  let pagination: any = null;

  if (data.response?.data && Array.isArray(data.response.data)) {
    leads = data.response.data;
    pagination = data.response.pagination;
    console.log('✅ Found results in data.response.data');
  } else if (data.data?.response?.data && Array.isArray(data.data.response.data)) {
    leads = data.data.response.data;
    pagination = data.data.response.pagination;
    console.log('✅ Found results in data.data.response.data');
  } else if (Array.isArray(data.data)) {
    leads = data.data;
    pagination = data.pagination;
    console.log('✅ Found results in data.data (direct array)');
  } else {
    console.log('⚠️  No results found in expected locations');
    console.log('📋 Full response structure:');
    console.log(JSON.stringify(data, null, 2).substring(0, 2000));
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
      console.log(`\n   ${i + 1}. ${lead.name || lead.fullName || lead.firstName + ' ' + lead.lastName || 'Unknown'}`);
      console.log(`      Title: ${lead.title || lead.jobTitle || 'N/A'}`);
      console.log(`      Company: ${lead.company || lead.currentCompany || 'N/A'}`);
      console.log(`      Location: ${lead.location || lead.geoRegion || 'N/A'}`);
      if (lead.linkedinUrl || lead.profileUrl) {
        console.log(`      LinkedIn: ${lead.linkedinUrl || lead.profileUrl}`);
      }
    });
  } else {
    console.log('⚠️  No leads returned');
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Test Complete');
}

// Run the test
testColorado90DaysDirect().catch(console.error);
