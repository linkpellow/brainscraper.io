/**
 * Test alternative filter formats based on documentation patterns
 * Testing if the API expects different parameter names or structures
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_BASE_URL = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com';

async function testFilterFormat(name: string, requestBody: any) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 ${name}`);
  console.log('Request:', JSON.stringify(requestBody, null, 2));
  
  try {
    const response = await fetch(`${API_BASE_URL}/premium_search_person`, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY || '',
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json();
    const results = result?.response?.data || [];
    const resultsCount = Array.isArray(results) ? results.length : 0;
    
    console.log(`Status: ${response.status}, Results: ${resultsCount}`);
    
    if (result.error || result.message) {
      console.log(`Error/Message: ${result.error || result.message}`);
    }
    
    if (resultsCount > 0 && Array.isArray(results)) {
      const matching = results.filter((r: any) => {
        const location = (r.geoRegion || r.location || '').toLowerCase();
        return location.includes('maryland') || location.includes('md');
      });
      const accuracy = (matching.length / resultsCount) * 100;
      console.log(`📍 Maryland Accuracy: ${accuracy.toFixed(1)}% (${matching.length}/${resultsCount})`);
      
      if (accuracy > 0) {
        console.log(`✅ SUCCESS! This format works!`);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Error:`, error);
    return false;
  }
}

async function runTests() {
  if (!RAPIDAPI_KEY) {
    console.error('❌ RAPIDAPI_KEY not found');
    process.exit(1);
  }

  console.log('🔍 Testing Alternative Filter Formats\n');

  const tests = [
    // Test 1: Current format
    {
      name: 'Current Format: filters array with LOCATION type',
      body: {
        filters: [{
          type: 'LOCATION',
          values: [{
            id: 'urn:li:fs_geo:103644278',
            text: 'Maryland',
            selectionType: 'INCLUDED'
          }]
        }],
        keywords: '',
        page: 1,
        limit: 10
      }
    },
    
    // Test 2: Try REGION instead of LOCATION
    {
      name: 'Alternative: REGION type instead of LOCATION',
      body: {
        filters: [{
          type: 'REGION',
          values: [{
            id: 'urn:li:fs_geo:103644278',
            text: 'Maryland',
            selectionType: 'INCLUDED'
          }]
        }],
        keywords: '',
        page: 1,
        limit: 10
      }
    },
    
    // Test 3: Try GEO type
    {
      name: 'Alternative: GEO type',
      body: {
        filters: [{
          type: 'GEO',
          values: [{
            id: 'urn:li:fs_geo:103644278',
            text: 'Maryland',
            selectionType: 'INCLUDED'
          }]
        }],
        keywords: '',
        page: 1,
        limit: 10
      }
    },
    
    // Test 4: Try geoUrn as direct parameter
    {
      name: 'Alternative: geoUrn as direct parameter',
      body: {
        geoUrn: ['urn:li:fs_geo:103644278'],
        keywords: '',
        page: 1,
        limit: 10
      }
    },
    
    // Test 5: Try regionUrn
    {
      name: 'Alternative: regionUrn parameter',
      body: {
        regionUrn: ['urn:li:fs_geo:103644278'],
        keywords: '',
        page: 1,
        limit: 10
      }
    },
    
    // Test 6: Try locations array (like LinkedIn API)
    {
      name: 'Alternative: locations array',
      body: {
        locations: ['urn:li:fs_geo:103644278'],
        keywords: '',
        page: 1,
        limit: 10
      }
    },
    
    // Test 7: Try with urn:li:region instead of urn:li:fs_geo
    {
      name: 'Alternative: urn:li:region format',
      body: {
        filters: [{
          type: 'LOCATION',
          values: [{
            id: 'urn:li:region:103644278',
            text: 'Maryland',
            selectionType: 'INCLUDED'
          }]
        }],
        keywords: '',
        page: 1,
        limit: 10
      }
    },
    
    // Test 8: Try with filter instead of filters
    {
      name: 'Alternative: filter (singular) instead of filters',
      body: {
        filter: {
          type: 'LOCATION',
          values: [{
            id: 'urn:li:fs_geo:103644278',
            text: 'Maryland',
            selectionType: 'INCLUDED'
          }]
        },
        keywords: '',
        page: 1,
        limit: 10
      }
    },
    
    // Test 9: Try nested filter structure
    {
      name: 'Alternative: Nested filter structure',
      body: {
        filter: {
          location: {
            id: 'urn:li:fs_geo:103644278',
            text: 'Maryland'
          }
        },
        keywords: '',
        page: 1,
        limit: 10
      }
    },
    
    // Test 10: Test if keywords + specific formatting helps
    {
      name: 'Keywords only with Maryland (baseline comparison)',
      body: {
        keywords: 'Maryland',
        page: 1,
        limit: 25
      }
    }
  ];

  let workingFormat = null;
  
  for (const test of tests) {
    const works = await testFilterFormat(test.name, test.body);
    if (works) {
      workingFormat = test;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '='.repeat(80));
  console.log('📊 RESULTS:');
  
  if (workingFormat) {
    console.log(`\n✅ FOUND WORKING FORMAT: ${workingFormat.name}`);
    console.log('Working Request Body:');
    console.log(JSON.stringify(workingFormat.body, null, 2));
  } else {
    console.log('\n❌ NO WORKING FORMAT FOUND');
    console.log('\nConclusion: The API does not support location filtering,');
    console.log('or requires authentication/parameters we don\'t have access to.');
    console.log('\nRecommendation: Use keywords + post-filtering for 100% accuracy.');
  }
}

runTests().catch(console.error);

