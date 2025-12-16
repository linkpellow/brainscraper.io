/**
 * Root Cause Analysis: Why is the API ignoring LOCATION filters?
 * 
 * Questions to answer:
 * 1. Is the location ID correct?
 * 2. Is the filter format correct?
 * 3. Does the API require additional parameters?
 * 4. Is there an error message we're missing?
 * 5. Does the API actually support location filtering?
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_BASE_URL = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com';

async function analyzeAPIResponse(filters: any[], keywords: string = '') {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 Analyzing API Response for Root Cause');
  console.log('Request:', JSON.stringify({ filters, keywords, page: 1, limit: 10 }, null, 2));
  
  try {
    const response = await fetch(`${API_BASE_URL}/premium_search_person`, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY || '',
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filters, keywords, page: 1, limit: 10 }),
    });

    const responseText = await response.text();
    let result: any;
    
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { raw: responseText };
    }

    console.log('\n📋 Response Analysis:');
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    console.log('Response Headers:', Object.fromEntries(response.headers.entries()));
    console.log('\nFull Response Structure:');
    console.log(JSON.stringify(result, null, 2).substring(0, 2000));
    
    // Check for error messages
    if (result.error || result.message || result.errors) {
      console.log('\n⚠️  ERROR DETECTED:');
      console.log('Error:', result.error || result.message || result.errors);
    }
    
    // Check if response indicates filter was applied
    if (result.response) {
      console.log('\n📊 Response Metadata:');
      console.log('Has pagination:', !!result.response.pagination);
      if (result.response.pagination) {
        console.log('Pagination:', result.response.pagination);
      }
      console.log('Has filters applied:', !!result.response.filtersApplied);
      console.log('Has search metadata:', !!result.response.metadata);
    }
    
    // Check results
    const results = result?.response?.data || result?.data?.response?.data || result?.data?.data || [];
    console.log(`\nResults Count: ${Array.isArray(results) ? results.length : 0}`);
    
    if (Array.isArray(results) && results.length > 0) {
      console.log('\nSample Results Locations:');
      results.slice(0, 5).forEach((r: any, i: number) => {
        console.log(`  ${i + 1}. ${r.geoRegion || r.location || 'N/A'}`);
      });
    }
    
    return { result, responseText };
  } catch (error) {
    console.error('❌ Error:', error);
    return { result: null, responseText: null };
  }
}

async function testLocationIdVerification() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 Testing Location ID Verification Methods');
  
  // Method 1: Use json_to_url to see what URL it generates
  console.log('\n1. Testing json_to_url to verify location ID format...');
  try {
    const response = await fetch(`${API_BASE_URL}/json_to_url`, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY || '',
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filters: [{
          type: 'LOCATION',
          values: [{
            id: 'urn:li:fs_geo:103644278',
            text: 'Maryland',
            selectionType: 'INCLUDED'
          }]
        }],
        keywords: ''
      }),
    });
    
    const result = await response.json();
    const url = result.url || result.data || result;
    console.log('Generated URL:', url);
    
    // Extract location from URL
    if (typeof url === 'string') {
      const decoded = decodeURIComponent(url);
      console.log('Decoded URL:', decoded.substring(0, 500));
      
      // Check if location ID appears in URL
      if (decoded.includes('103644278')) {
        console.log('✅ Location ID 103644278 found in generated URL');
      } else {
        console.log('❌ Location ID 103644278 NOT found in generated URL');
      }
      
      // Check what format the location appears in
      const locationMatch = decoded.match(/LOCATION[^)]*103644278[^)]*/);
      if (locationMatch) {
        console.log('Location filter in URL:', locationMatch[0].substring(0, 200));
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

async function testWithoutLocationFilter() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 Testing WITHOUT location filter (baseline)');
  
  const { result } = await analyzeAPIResponse([], '');
  
  const results = result?.response?.data || [];
  if (Array.isArray(results) && results.length > 0) {
    console.log('\nBaseline Results (no filters):');
    results.slice(0, 5).forEach((r: any, i: number) => {
      console.log(`  ${i + 1}. ${r.geoRegion || r.location || 'N/A'}`);
    });
  }
}

async function testWithLocationFilter() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 Testing WITH location filter');
  
  const filters = [{
    type: 'LOCATION',
    values: [{
      id: 'urn:li:fs_geo:103644278',
      text: 'Maryland',
      selectionType: 'INCLUDED'
    }]
  }];
  
  const { result } = await analyzeAPIResponse(filters, '');
  
  const results = result?.response?.data || [];
  if (Array.isArray(results) && results.length > 0) {
    console.log('\nResults WITH location filter:');
    results.slice(0, 5).forEach((r: any, i: number) => {
      console.log(`  ${i + 1}. ${r.geoRegion || r.location || 'N/A'}`);
    });
    
    // Compare with baseline
    console.log('\n⚠️  If these match the baseline, the API is ignoring the filter');
  }
}

async function checkAPIStatus() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 Checking API Status and Capabilities');
  
  // Test with a known working filter (company)
  console.log('\nTesting with CURRENT_COMPANY filter (should work)...');
  const companyFilters = [{
    type: 'CURRENT_COMPANY',
    values: [{
      id: 'apple',
      text: 'Apple',
      selectionType: 'INCLUDED'
    }]
  }];
  
  const { result } = await analyzeAPIResponse(companyFilters, '');
  
  const results = result?.response?.data || [];
  console.log(`Results with COMPANY filter: ${Array.isArray(results) ? results.length : 0}`);
  
  if (Array.isArray(results) && results.length > 0) {
    const appleMatches = results.filter((r: any) => {
      const company = (r.currentPosition?.companyName || '').toLowerCase();
      return company.includes('apple');
    });
    console.log(`Apple matches: ${appleMatches.length}/${results.length} (${(appleMatches.length / results.length * 100).toFixed(1)}%)`);
    
    if (appleMatches.length > 0) {
      console.log('✅ COMPANY filter appears to work');
    } else {
      console.log('❌ COMPANY filter also not working - API might have broader issues');
    }
  }
}

async function runRootCauseAnalysis() {
  if (!RAPIDAPI_KEY) {
    console.error('❌ RAPIDAPI_KEY not found');
    process.exit(1);
  }

  console.log('🔬 ROOT CAUSE ANALYSIS: Why LOCATION Filter is Ignored\n');
  console.log('='.repeat(80));
  
  // Test 1: Verify location ID format
  await testLocationIdVerification();
  
  // Test 2: Baseline (no filters)
  await testWithoutLocationFilter();
  
  // Test 3: With location filter
  await testWithLocationFilter();
  
  // Test 4: Check if other filters work
  await checkAPIStatus();
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 ROOT CAUSE SUMMARY:');
  console.log('\nPossible Causes:');
  console.log('1. API Bug: API accepts filter but doesn\'t apply it');
  console.log('2. Wrong Location ID: 103644278 might not be correct for Maryland');
  console.log('3. API Limitation: Location filtering might require premium/paid tier');
  console.log('4. Format Issue: Filter format might be correct but API expects different structure');
  console.log('5. Authentication: API might require LinkedIn session/auth we don\'t have');
  console.log('\nNext Steps:');
  console.log('- Verify location ID using LinkedIn Location ID Finder tool');
  console.log('- Check RapidAPI documentation for location filter requirements');
  console.log('- Contact RapidAPI support about location filter not working');
  console.log('- Use post-filtering as workaround (already implemented)');
}

runRootCauseAnalysis().catch(console.error);

