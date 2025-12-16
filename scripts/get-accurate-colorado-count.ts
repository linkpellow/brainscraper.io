/**
 * Get accurate count: Self-employed in Colorado
 * Uses direct endpoint with filters + post-filtering (NO KEYWORDS)
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_BASE_URL = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com';

async function getAccurateCount() {
  console.log('🔍 Getting accurate count: Self-employed in Colorado\n');
  console.log('📋 Using filters + post-filtering (NO KEYWORDS)\n');

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
  const limit = 100;
  const maxPages = 100; // Process 100 pages = 10,000 results
  let hasMore = true;

  console.log('📄 Processing pages with filters + post-filtering...\n');

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
        keywords: '', // NO KEYWORDS - filters only
      }),
    });

    const result = await searchResponse.json();
    const results = result?.response?.data || result?.data?.response?.data || [];
    const pagination = result?.response?.pagination || result?.data?.response?.pagination;

    // Post-filter: Count Colorado matches (API doesn't apply filters correctly)
    const coloradoMatches = results.filter((lead: any) => {
      const location = (lead.location || lead.geoRegion || lead.currentLocation || '').toLowerCase();
      return location.includes('colorado') || location.includes('co,') || location.includes(', co');
    });

    totalColoradoMatches += coloradoMatches.length;
    totalProcessed += results.length;

    const accuracy = results.length > 0 ? ((coloradoMatches.length / results.length) * 100).toFixed(1) : '0.0';
    
    if (page % 10 === 0 || coloradoMatches.length > 0) {
      console.log(`   Page ${page}: ${coloradoMatches.length} / ${results.length} Colorado matches (${accuracy}% accuracy)`);
    }

    if (pagination) {
      hasMore = pagination.hasMore !== false && (pagination.total ? (pagination.start + pagination.count) < pagination.total : true);
    } else {
      hasMore = results.length === limit;
    }

    page++;

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  const sampleRate = totalProcessed > 0 ? (totalColoradoMatches / totalProcessed) : 0;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 FINAL RESULTS:');
  console.log('='.repeat(60));
  console.log(`✅ Pages processed: ${page - 1}`);
  console.log(`✅ Results processed: ${totalProcessed}`);
  console.log(`✅ Accurate Colorado self-employed: ${totalColoradoMatches}`);
  console.log(`📊 Sample accuracy: ${(sampleRate * 100).toFixed(2)}%`);
  console.log('='.repeat(60));
  console.log(`\n📊 ACCURATE COUNT: ${totalColoradoMatches} self-employed people in Colorado`);
  console.log(`   (Based on ${totalProcessed} results processed with post-filtering)`);
  console.log('='.repeat(60));
}

getAccurateCount().catch(console.error);
