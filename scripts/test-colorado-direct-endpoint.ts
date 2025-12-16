/**
 * Test: Direct premium_search_person with filters
 * Bypasses via_url to test if filters work directly
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_BASE_URL = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com';

async function testDirectEndpoint() {
  console.log('🔍 Testing: Self-employed in Colorado (direct endpoint)\n');

  // Get Colorado location ID
  const suggestionsResponse = await fetch(`${API_BASE_URL}/filter_geography_location_region_suggestions`, {
    method: 'POST',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY!,
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

  const coloradoUrn = `urn:li:fs_geo:${coloradoMatch.id}`;
  console.log(`📍 Colorado URN: ${coloradoUrn}\n`);

  // Direct search with filters
  const searchResponse = await fetch(`${API_BASE_URL}/premium_search_person`, {
    method: 'POST',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY!,
      'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      account_number: 1,
      page: 1,
      limit: 100,
      filters: [
        {
          type: 'REGION',  // Use REGION (not LOCATION) - verified from real LinkedIn URLs
          values: [{
            id: coloradoMatch.id,  // Numeric ID: "105763813" (not URN format)
            text: 'Colorado',
            selectionType: 'INCLUDED',
          }],
        },
        {
          type: 'COMPANY_HEADCOUNT',
          values: [{
            id: 'A',
            text: 'Self-employed',
            selectionType: 'INCLUDED',
          }],
        },
      ],
      keywords: '',
    }),
  });

  if (!searchResponse.ok) {
    const error = await searchResponse.text();
    console.error(`❌ Search failed (${searchResponse.status}):`, error);
    process.exit(1);
  }

  const result = await searchResponse.json();
  const results = result?.response?.data || result?.data?.response?.data || [];
  const pagination = result?.response?.pagination || result?.data?.response?.pagination;

  // Count Colorado matches
  const coloradoMatches = results.filter((lead: any) => {
    const location = (lead.location || lead.geoRegion || lead.currentLocation || '').toLowerCase();
    return location.includes('colorado') || location.includes('co,') || location.includes(', co');
  });

  console.log('📊 RESULTS:');
  console.log('='.repeat(60));
  console.log(`✅ Total results from API: ${results.length}`);
  console.log(`📍 Colorado matches: ${coloradoMatches.length} / ${results.length}`);
  console.log(`📊 Accuracy: ${results.length > 0 ? ((coloradoMatches.length / results.length) * 100).toFixed(1) : 0}%`);
  
  if (pagination) {
    console.log(`📄 Total available: ${pagination.total || 'unknown'}`);
    console.log(`📄 Has more: ${pagination.hasMore ? 'Yes' : 'No'}`);
  }

  if (results.length > 0) {
    console.log('\n📋 Sample Results (first 5):');
    results.slice(0, 5).forEach((lead: any, idx: number) => {
      const location = lead.location || lead.geoRegion || lead.currentLocation || 'N/A';
      const isColorado = location.toLowerCase().includes('colorado') || location.toLowerCase().includes('co,');
      console.log(`\n   ${idx + 1}. ${lead.firstName || ''} ${lead.lastName || ''}`);
      console.log(`      Location: ${location} ${isColorado ? '✅' : '❌'}`);
      console.log(`      Company: ${lead.currentCompany || lead.company || 'N/A'}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Test complete!`);
  console.log(`📊 Colorado self-employed: ${coloradoMatches.length} accurate results (on this page)`);
  if (pagination?.total) {
    console.log(`📊 API reports total: ${pagination.total}`);
    console.log(`⚠️  Note: API total may be inaccurate if filters aren't applied correctly`);
  }
}

testDirectEndpoint().catch(console.error);
