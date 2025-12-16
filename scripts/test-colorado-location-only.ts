/**
 * Test: Colorado location only (no company filter)
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_BASE_URL = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com';

async function testLocationOnly() {
  console.log('🔍 Testing: People in Colorado (location only)\n');

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

  // Generate URL with location only
  const jsonToUrlResponse = await fetch(`${API_BASE_URL}/json_to_url`, {
    method: 'POST',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY!,
      'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filters: [{
        type: 'LOCATION',
        values: [{
          id: coloradoUrn,
          text: 'Colorado',
          selectionType: 'INCLUDED',
        }],
      }],
      keywords: '',
    }),
  });

  const urlData = await jsonToUrlResponse.json();
  const generatedUrl = urlData.url || urlData.data;

  console.log(`🔗 Generated URL\n`);

  // Search via URL
  const viaUrlResponse = await fetch(`${API_BASE_URL}/premium_search_person_via_url`, {
    method: 'POST',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY!,
      'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: generatedUrl,
      account_number: 1,
      page: 1,
      limit: 25,
    }),
  });

  const result = await viaUrlResponse.json();
  const results = result?.response?.data || result?.data?.response?.data || [];
  const pagination = result?.response?.pagination || result?.data?.response?.pagination;

  const coloradoMatches = results.filter((lead: any) => {
    const location = (lead.location || lead.geoRegion || lead.currentLocation || '').toLowerCase();
    return location.includes('colorado') || location.includes('co,') || location.includes(', co');
  });

  console.log('📊 RESULTS:');
  console.log(`✅ Total results: ${results.length}`);
  console.log(`📍 Colorado matches: ${coloradoMatches.length} / ${results.length}`);
  if (pagination) {
    console.log(`📄 Total available: ${pagination.total || 'unknown'}`);
  }

  if (results.length > 0) {
    console.log('\n📋 Sample Results:');
    results.slice(0, 3).forEach((lead: any, idx: number) => {
      const location = lead.location || lead.geoRegion || lead.currentLocation || 'N/A';
      console.log(`   ${idx + 1}. ${lead.firstName || ''} ${lead.lastName || ''} - ${location}`);
    });
  }
}

testLocationOnly().catch(console.error);
