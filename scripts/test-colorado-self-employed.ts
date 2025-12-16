/**
 * Test: Search self-employed people in Colorado
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_BASE_URL = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com';

async function searchSelfEmployedInColorado() {
  if (!RAPIDAPI_KEY) {
    console.error('❌ RAPIDAPI_KEY not found in .env.local');
    process.exit(1);
  }

  console.log('🔍 Searching for self-employed people in Colorado...\n');

  // Step 1: Get Colorado location ID
  console.log('📍 Step 1: Getting Colorado location ID...');
  let coloradoLocationId: string | null = null;
  let coloradoFullId: string | null = null;

  try {
    // Try location suggestions API first
    const suggestionsResponse = await fetch(`${API_BASE_URL}/filter_geography_location_region_suggestions`, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: 'Colorado' }),
    });

    if (suggestionsResponse.ok) {
      const suggestionsData = await suggestionsResponse.json();
      const suggestions = suggestionsData.data || suggestionsData.suggestions || [];
      
      // Find exact match for Colorado
      const coloradoMatch = suggestions.find((s: any) => 
        s.displayValue?.toLowerCase().includes('colorado') ||
        s.headline?.toLowerCase().includes('colorado') ||
        s.text?.toLowerCase().includes('colorado')
      );

      if (coloradoMatch && coloradoMatch.id) {
        coloradoLocationId = coloradoMatch.id;
        coloradoFullId = `urn:li:fs_geo:${coloradoLocationId}`;
        console.log(`   ✅ Found Colorado location ID: ${coloradoLocationId}`);
        console.log(`   ✅ Full URN: ${coloradoFullId}`);
      }
    }
  } catch (error) {
    console.log(`   ⚠️ Location suggestions failed: ${error}`);
  }

  if (!coloradoLocationId) {
    console.log('   ⚠️ Could not get Colorado location ID, trying search anyway...');
  }

  // Step 2: Search with filters
  console.log('\n🔍 Step 2: Searching with filters...');
  console.log('   Filters:');
  console.log('   - LOCATION: Colorado');
  console.log('   - COMPANY_HEADCOUNT: A (Self-employed)');

  const searchBody = {
    account_number: 1,
    page: 1,
    limit: 25, // Small limit to get count quickly
    filters: [
      {
        type: 'COMPANY_HEADCOUNT',
        values: [{
          id: 'A', // Self-employed (verified format)
          text: 'Self-employed',
          selectionType: 'INCLUDED',
        }],
      },
    ],
    keywords: '',
  };

  // Add location filter if we have the ID
  if (coloradoFullId) {
    searchBody.filters.push({
      type: 'LOCATION',
      values: [{
        id: coloradoFullId,
        text: 'Colorado',
        selectionType: 'INCLUDED',
      }],
    });
  } else {
    // Fallback: add Colorado to keywords
    searchBody.keywords = 'Colorado';
  }

  try {
    const searchResponse = await fetch(`${API_BASE_URL}/premium_search_person`, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(searchBody),
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error(`\n❌ API Error (${searchResponse.status}):`);
      console.error(errorText);
      process.exit(1);
    }

    const result = await searchResponse.json();
    
    // Extract results
    let results: any[] = [];
    let pagination: any = null;

    if (result?.response?.data && Array.isArray(result.response.data)) {
      results = result.response.data;
      pagination = result.response.pagination;
    } else if (result?.data?.response?.data && Array.isArray(result.data.response.data)) {
      results = result.data.response.data;
      pagination = result.data.response.pagination;
    } else if (Array.isArray(result?.data)) {
      results = result.data;
      pagination = result.pagination;
    } else if (Array.isArray(result)) {
      results = result;
    }

    // Display results
    console.log('\n📊 RESULTS:');
    console.log('='.repeat(60));
    console.log(`✅ Results on this page: ${results.length}`);
    
    if (pagination) {
      console.log(`📄 Total results: ${pagination.total || 'unknown'}`);
      console.log(`📄 Count: ${pagination.count || results.length}`);
      console.log(`📄 Start: ${pagination.start || 0}`);
      console.log(`📄 Has more: ${pagination.hasMore ? 'Yes' : 'No'}`);
    } else {
      console.log(`📄 Total results: ${results.length} (pagination info not available)`);
    }

    // Show sample results
    if (results.length > 0) {
      console.log('\n📋 Sample Results (first 3):');
      results.slice(0, 3).forEach((lead, idx) => {
        console.log(`\n   ${idx + 1}. ${lead.firstName || ''} ${lead.lastName || ''}`);
        console.log(`      Title: ${lead.headline || lead.title || 'N/A'}`);
        console.log(`      Location: ${lead.location || lead.geoRegion || 'N/A'}`);
        console.log(`      Company: ${lead.currentCompany || lead.company || 'Self-employed'}`);
      });
    }

    // Save results
    try {
      const fs = require('fs');
      const path = require('path');
      const resultsDir = path.join(process.cwd(), 'data', 'api-results');
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `${timestamp}-colorado-self-employed.json`;
      const filepath = path.join(resultsDir, filename);
      
      fs.writeFileSync(filepath, JSON.stringify({
        searchParams: searchBody,
        results,
        pagination,
        totalCount: pagination?.total || results.length,
      }, null, 2));
      
      console.log(`\n💾 Results saved to: ${filepath}`);
    } catch (saveError) {
      console.log(`\n⚠️ Could not save results: ${saveError}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Search complete! Total results: ${pagination?.total || results.length}`);
    
  } catch (error) {
    console.error('\n❌ Search failed:', error);
    process.exit(1);
  }
}

searchSelfEmployedInColorado()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
