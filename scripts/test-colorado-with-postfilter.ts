/**
 * Test: Search self-employed people in Colorado with post-filtering
 * Uses the main API route which applies post-filtering for accuracy
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function searchWithPostFiltering() {
  console.log('🔍 Searching for self-employed people in Colorado...');
  console.log('📋 Using main API route with post-filtering enabled\n');

  try {
    // Call the main API route
    const response = await fetch('http://localhost:3000/api/linkedin-sales-navigator', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint: 'premium_search_person',
        location: 'Colorado',
        company_headcount_min: 0, // Self-employed (maps to "A")
        company_headcount_max: 0,  // Self-employed (maps to "A")
        page: 1,
        limit: 100, // Get more results for better count
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ API Error:', error);
      process.exit(1);
    }

    const result = await response.json();

    if (!result.success) {
      console.error('❌ Search failed:', result.error || result.message);
      process.exit(1);
    }

    // Extract results
    let results: any[] = [];
    let pagination: any = null;

    if (result.data?.response?.data && Array.isArray(result.data.response.data)) {
      results = result.data.response.data;
      pagination = result.data.response.pagination;
    } else if (result.data?.data?.response?.data && Array.isArray(result.data.data.response.data)) {
      results = result.data.data.response.data;
      pagination = result.data.data.response.pagination;
    } else if (Array.isArray(result.data?.data)) {
      results = result.data.data;
      pagination = result.data.pagination;
    } else if (Array.isArray(result.data)) {
      results = result.data;
      pagination = result.pagination;
    }

    // Display results
    console.log('📊 RESULTS:');
    console.log('='.repeat(60));
    console.log(`✅ Results after post-filtering: ${results.length}`);
    
    if (pagination) {
      console.log(`📄 API reported total: ${pagination.total || 'unknown'}`);
      console.log(`📄 Results on this page: ${pagination.count || results.length}`);
      console.log(`📄 Start: ${pagination.start || 0}`);
      console.log(`📄 Has more: ${pagination.hasMore ? 'Yes' : 'No'}`);
    }

    // Count Colorado matches
    const coloradoMatches = results.filter(lead => {
      const location = (lead.location || lead.geoRegion || lead.currentLocation || '').toLowerCase();
      return location.includes('colorado') || location.includes('co,');
    });

    console.log(`\n📍 Colorado matches in results: ${coloradoMatches.length} / ${results.length}`);

    // Show sample results
    if (results.length > 0) {
      console.log('\n📋 Sample Results (first 5):');
      results.slice(0, 5).forEach((lead, idx) => {
        const location = lead.location || lead.geoRegion || lead.currentLocation || 'N/A';
        const isColorado = location.toLowerCase().includes('colorado') || location.toLowerCase().includes('co,');
        console.log(`\n   ${idx + 1}. ${lead.firstName || ''} ${lead.lastName || ''}`);
        console.log(`      Title: ${lead.headline || lead.title || 'N/A'}`);
        console.log(`      Location: ${location} ${isColorado ? '✅' : '❌'}`);
        console.log(`      Company: ${lead.currentCompany || lead.company || 'Self-employed'}`);
      });
    }

    // Check if location validation stats are available
    if (result.locationValidationStats) {
      console.log('\n📊 Location Validation Stats:');
      console.log(`   Total results from API: ${result.locationValidationStats.total || 'unknown'}`);
      console.log(`   Kept (Colorado): ${result.locationValidationStats.kept || results.length}`);
      console.log(`   Removed (not Colorado): ${result.locationValidationStats.removed || 0}`);
      console.log(`   Accuracy: ${result.locationValidationStats.accuracy || 'N/A'}%`);
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Search complete!`);
    console.log(`📊 Accurate Colorado self-employed count: ${results.length} (on this page)`);
    console.log(`\n💡 Note: This is the count after post-filtering.`);
    console.log(`   The API may return more pages - check pagination.hasMore for total count.`);
    
  } catch (error) {
    console.error('\n❌ Search failed:', error);
    console.log('\n💡 Make sure the Next.js dev server is running: npm run dev');
    process.exit(1);
  }
}

searchWithPostFiltering()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
