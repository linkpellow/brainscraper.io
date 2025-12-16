/**
 * Test different API request structures to find what works
 * The API might require different parameters or structure
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_BASE_URL = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com';

async function testRequest(name: string, requestBody: any) {
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
    const results = result?.response?.data || result?.data?.response?.data || result?.data?.data || [];
    const resultsCount = Array.isArray(results) ? results.length : 0;
    
    console.log(`Status: ${response.status}, Results: ${resultsCount}`);
    
    if (resultsCount > 0 && Array.isArray(results)) {
      const matching = results.filter((r: any) => {
        const location = (r.geoRegion || r.location || '').toLowerCase();
        return location.includes('maryland') || location.includes('md');
      });
      const accuracy = (matching.length / resultsCount) * 100;
      console.log(`📍 Location Accuracy: ${accuracy.toFixed(1)}% (${matching.length}/${resultsCount})`);
      
      if (matching.length === 0 && results.length > 0) {
        console.log(`   Sample locations: ${results.slice(0, 3).map((r: any) => r.geoRegion || r.location).join(', ')}`);
      }
    }
    
    return { status: response.status, resultsCount, accuracy: resultsCount > 0 ? (matching.length / resultsCount) * 100 : 0 };
  } catch (error) {
    console.error(`❌ Error:`, error);
    return { status: 0, resultsCount: 0, accuracy: 0 };
  }
}

async function runTests() {
  if (!RAPIDAPI_KEY) {
    console.error('❌ RAPIDAPI_KEY not found');
    process.exit(1);
  }

  console.log('🔍 Testing Different API Request Structures\n');

  // Test 1: Current format
  await testRequest('Current Format', {
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
  });

  // Test 2: With geoUrn parameter (alternative)
  await testRequest('With geoUrn Parameter', {
    geoUrn: 'urn:li:fs_geo:103644278',
    filters: [],
    keywords: '',
    page: 1,
    limit: 10
  });

  // Test 3: Location in different format
  await testRequest('Location as Direct Parameter', {
    location: 'urn:li:fs_geo:103644278',
    filters: [],
    keywords: '',
    page: 1,
    limit: 10
  });

  // Test 4: Combined with company filter (maybe location only works with other filters)
  await testRequest('LOCATION + CURRENT_COMPANY Filters', {
    filters: [
      {
        type: 'LOCATION',
        values: [{
          id: 'urn:li:fs_geo:103644278',
          text: 'Maryland',
          selectionType: 'INCLUDED'
        }]
      },
      {
        type: 'CURRENT_COMPANY',
        values: [{
          id: 'apple',
          text: 'Apple',
          selectionType: 'INCLUDED'
        }]
      }
    ],
    keywords: '',
    page: 1,
    limit: 10
  });

  // Test 5: Check if API response has any error messages
  await testRequest('Check Response for Errors', {
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
  });

  console.log('\n' + '='.repeat(80));
  console.log('📊 Summary: If all tests show 0% accuracy, the API is ignoring LOCATION filters');
  console.log('Next step: Contact RapidAPI support or check if this is a known API limitation');
}

runTests().catch(console.error);

