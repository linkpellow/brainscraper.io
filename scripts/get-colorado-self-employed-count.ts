/**
 * Get accurate count: Self-employed people in Colorado
 * Uses post-filtering and pagination to get accurate results
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_BASE_URL = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com';

async function getAccurateCount() {
  console.log('🔍 Getting accurate count: Self-employed people in Colorado\n');
  console.log('📋 Strategy: Paginate through results with post-filtering\n');

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

  let totalColoradoMatches = 0;
  let totalProcessed = 0;
  let page = 1;
  const limit = 100; // Process 100 at a time
  const maxPages = 10; // Limit to 10 pages to control API costs
  let hasMore = true;

  console.log('📄 Processing pages...\n');

  while (hasMore && page <= maxPages) {
    const searchResponse = await fetch(`${API_BASE_URL}/premium_search_person`, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY!,
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        account_number: 1,
        page: page,
        limit: limit,
        filters: [
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
              id: 'A',
              text: 'Self-employed',
              selectionType: 'INCLUDED',
            }],
          },
        ],
        keywords: '',
      }),
    });

    const result = await searchResponse.json();
    const results = result?.response?.data || result?.data?.response?.data || [];
    const pagination = result?.response?.pagination || result?.data?.response?.pagination;

    // Post-filter: Count Colorado matches
    const coloradoMatches = results.filter((lead: any) => {
      const location = (lead.location || lead.geoRegion || lead.currentLocation || '').toLowerCase();
      return location.includes('colorado') || location.includes('co,') || location.includes(', co');
    });

    totalColoradoMatches += coloradoMatches.length;
    totalProcessed += results.length;

    const accuracy = results.length > 0 ? ((coloradoMatches.length / results.length) * 100).toFixed(1) : '0.0';
    
    console.log(`   Page ${page}: ${coloradoMatches.length} / ${results.length} Colorado matches (${accuracy}% accuracy)`);

    if (pagination) {
      hasMore = pagination.hasMore || false;
    } else {
      hasMore = results.length === limit; // Assume more if we got full page
    }

    page++;

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 FINAL RESULTS:');
  console.log('='.repeat(60));
  console.log(`✅ Total pages processed: ${page - 1}`);
  console.log(`✅ Total results processed: ${totalProcessed}`);
  console.log(`✅ Accurate Colorado self-employed count: ${totalColoradoMatches}`);
  console.log(`📊 Accuracy rate: ${totalProcessed > 0 ? ((totalColoradoMatches / totalProcessed) * 100).toFixed(1) : 0}%`);
  console.log(`\n💡 Note: This is the count from ${page - 1} page(s).`);
  console.log(`   For complete count, process more pages (API reports ~12M total, but filters aren't applied).`);
  console.log('='.repeat(60));
}

getAccurateCount().catch(console.error);
