/**
 * Direct test: Self-employed in Colorado using via_url
 * Tests the complete flow to identify the issue
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_BASE_URL = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com';

async function testDirect() {
  if (!RAPIDAPI_KEY) {
    console.error('❌ RAPIDAPI_KEY not found');
    process.exit(1);
  }

  console.log('🔍 Testing: Self-employed people in Colorado\n');

  // Step 1: Get Colorado location ID
  console.log('📍 Step 1: Getting Colorado location ID...');
  const suggestionsResponse = await fetch(`${API_BASE_URL}/filter_geography_location_region_suggestions`, {
    method: 'POST',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: 'Colorado' }),
  });

  const suggestionsData = await suggestionsResponse.json();
  const coloradoMatch = (suggestionsData.data || []).find((s: any) => 
    s.displayValue?.toLowerCase().includes('colorado') && 
    !s.displayValue?.toLowerCase().includes('county')
  );

  if (!coloradoMatch) {
    console.error('❌ Could not find Colorado location');
    process.exit(1);
  }

  const coloradoId = coloradoMatch.id;
  const coloradoUrn = `urn:li:fs_geo:${coloradoId}`;
  console.log(`   ✅ Colorado ID: ${coloradoId}`);
  console.log(`   ✅ Colorado URN: ${coloradoUrn}\n`);

  // Step 2: Build filters for json_to_url
  console.log('🔧 Step 2: Building filters...');
  const filters = [
    {
      type: 'LOCATION',
      values: [{
        id: coloradoUrn,
        text: 'Colorado',
        selectionType: 'INCLUDED',
      }],
    },
    {
      type: 'COMPANY_HEADCOUNT',
      values: [{
        id: 'A', // Self-employed
        text: 'Self-employed',
        selectionType: 'INCLUDED',
      }],
    },
  ];

  console.log('   Filters:', JSON.stringify(filters, null, 2));
  console.log('');

  // Step 3: Generate URL
  console.log('🔗 Step 3: Generating Sales Navigator URL...');
  const jsonToUrlResponse = await fetch(`${API_BASE_URL}/json_to_url`, {
    method: 'POST',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filters: filters,
      keywords: '',
    }),
  });

  if (!jsonToUrlResponse.ok) {
    const error = await jsonToUrlResponse.text();
    console.error(`❌ json_to_url failed (${jsonToUrlResponse.status}):`, error);
    process.exit(1);
  }

  const urlData = await jsonToUrlResponse.json();
  const generatedUrl = urlData.url || urlData.data || (typeof urlData === 'string' ? urlData : null);
  
  if (!generatedUrl || typeof generatedUrl !== 'string') {
    console.error('❌ No URL in response:', urlData);
    process.exit(1);
  }

  console.log(`   ✅ Generated URL: ${generatedUrl.substring(0, 100)}...\n`);

  // Step 4: Use via_url endpoint
  console.log('🔍 Step 4: Searching via URL...');
  const viaUrlResponse = await fetch(`${API_BASE_URL}/premium_search_person_via_url`, {
    method: 'POST',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: generatedUrl,
      account_number: 1,
      page: 1,
      limit: 100,
    }),
  });

  if (!viaUrlResponse.ok) {
    const error = await viaUrlResponse.text();
    console.error(`❌ via_url failed (${viaUrlResponse.status}):`, error);
    process.exit(1);
  }

  const result = await viaUrlResponse.json();
  
  // Extract results
  let results: any[] = [];
  let pagination: any = null;

  if (result?.response?.data && Array.isArray(result.response.data)) {
    results = result.response.data;
    pagination = result.response.pagination;
  } else if (result?.data?.response?.data && Array.isArray(result.data.response.data)) {
    results = result.data.response.data;
    pagination = result.data.response.pagination;
  }

  // Count Colorado matches
  const coloradoMatches = results.filter(lead => {
    const location = (lead.location || lead.geoRegion || lead.currentLocation || '').toLowerCase();
    return location.includes('colorado') || location.includes('co,') || location.includes(', co');
  });

  // Display results
  console.log('📊 RESULTS:');
  console.log('='.repeat(60));
  console.log(`✅ Total results: ${results.length}`);
  console.log(`📍 Colorado matches: ${coloradoMatches.length} / ${results.length}`);
  
  if (pagination) {
    console.log(`📄 Total available: ${pagination.total || 'unknown'}`);
    console.log(`📄 Has more: ${pagination.hasMore ? 'Yes' : 'No'}`);
  }

  if (results.length > 0) {
    console.log('\n📋 Sample Results (first 5):');
    results.slice(0, 5).forEach((lead, idx) => {
      const location = lead.location || lead.geoRegion || lead.currentLocation || 'N/A';
      const isColorado = location.toLowerCase().includes('colorado') || location.toLowerCase().includes('co,');
      console.log(`\n   ${idx + 1}. ${lead.firstName || ''} ${lead.lastName || ''}`);
      console.log(`      Location: ${location} ${isColorado ? '✅' : '❌'}`);
      console.log(`      Company: ${lead.currentCompany || lead.company || 'Self-employed'}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Test complete!`);
  console.log(`📊 Colorado self-employed count: ${coloradoMatches.length} (on this page)`);
  if (pagination?.total) {
    console.log(`📊 Estimated total: ${pagination.total} (if filters are working correctly)`);
  }
}

testDirect()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
