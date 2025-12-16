/**
 * Get accurate count using keywords + post-filtering
 * Workaround for API not applying location filters
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_BASE_URL = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com';

async function getCountWithKeywords() {
  console.log('🔍 Getting count: Self-employed in Colorado\n');
  console.log('📋 Using keywords + post-filtering (API filters not working)\n');

  let totalColoradoMatches = 0;
  let totalProcessed = 0;
  let page = 1;
  const limit = 100;
  const maxPages = 50; // Process 50 pages = 5000 results for better accuracy
  let hasMore = true;

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
            type: 'COMPANY_HEADCOUNT',
            values: [{
              id: 'A',
              text: 'Self-employed',
              selectionType: 'INCLUDED',
            }],
          },
        ],
        keywords: 'Colorado CO', // Use keywords since location filter doesn't work
      }),
    });

    const result = await searchResponse.json();
    const results = result?.response?.data || result?.data?.response?.data || [];
    const pagination = result?.response?.pagination || result?.data?.response?.pagination;

    // Aggressive post-filtering for Colorado
    const coloradoMatches = results.filter((lead: any) => {
      const location = (lead.location || lead.geoRegion || lead.currentLocation || '').toLowerCase();
      const company = (lead.currentCompany || lead.company || '').toLowerCase();
      
      // Must be in Colorado
      const isColorado = location.includes('colorado') || 
                        location.includes('co,') || 
                        location.includes(', co') ||
                        location.includes('denver') ||
                        location.includes('boulder') ||
                        location.includes('colorado springs');
      
      // Must be self-employed (no company or "self-employed")
      const isSelfEmployed = !company || 
                            company === '' || 
                            company.includes('self-employed') ||
                            company.includes('self employed') ||
                            company.includes('freelance');
      
      return isColorado && isSelfEmployed;
    });

    totalColoradoMatches += coloradoMatches.length;
    totalProcessed += results.length;

    const accuracy = results.length > 0 ? ((coloradoMatches.length / results.length) * 100).toFixed(1) : '0.0';
    console.log(`   Page ${page}: ${coloradoMatches.length} / ${results.length} matches (${accuracy}% accuracy)`);

    if (pagination) {
      hasMore = pagination.hasMore !== false && (pagination.total ? (pagination.start + pagination.count) < pagination.total : true);
      if (!hasMore) {
        console.log(`   (No more pages - pagination indicates end)`);
      }
    } else {
      hasMore = results.length === limit; // Assume more if we got full page
    }

    page++;
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 RESULTS:');
  console.log('='.repeat(60));
  console.log(`✅ Pages processed: ${page - 1}`);
  console.log(`✅ Results processed: ${totalProcessed}`);
  console.log(`✅ Accurate Colorado self-employed: ${totalColoradoMatches}`);
  console.log(`📊 Sample rate: ${((totalColoradoMatches / totalProcessed) * 100).toFixed(2)}%`);
  console.log(`\n💡 Estimated total: ~${Math.round(totalColoradoMatches * (1000000 / totalProcessed))} (extrapolated)`);
  console.log('='.repeat(60));
}

getCountWithKeywords().catch(console.error);
