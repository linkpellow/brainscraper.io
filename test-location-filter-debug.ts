/**
 * Debug test to find why LOCATION filter isn't working
 * Tests json_to_url endpoint to see what URL it generates
 * Tests different location ID formats
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_BASE_URL = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com';

async function testJsonToUrl(filters: any[], keywords: string = '') {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Testing json_to_url endpoint');
  console.log('Request:', JSON.stringify({ filters, keywords }, null, 2));
  
  try {
    const response = await fetch(`${API_BASE_URL}/json_to_url`, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY || '',
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filters, keywords }),
    });

    const result = await response.json();
    console.log('Response Status:', response.status);
    console.log('Full Response:', JSON.stringify(result, null, 2));
    const generatedUrl = result.url || result.data || result;
    console.log('Generated URL:', generatedUrl);
    
    if (generatedUrl) {
      // Extract location ID from URL
      const urlStr = typeof generatedUrl === 'string' ? generatedUrl : String(generatedUrl);
      try {
        const urlObj = new URL(urlStr);
        console.log('URL Query Params:');
        urlObj.searchParams.forEach((value, key) => {
          console.log(`  ${key}: ${value.substring(0, 200)}...`);
        });
        
        // Check for location in URL
        const locationMatch = urlStr.match(/geo[=:](\d+)|urn:li:fs_geo:(\d+)|urn:li:geo:(\d+)/);
        if (locationMatch) {
          console.log(`📍 Found location ID in URL: ${locationMatch[1] || locationMatch[2] || locationMatch[3]}`);
        }
      } catch (e) {
        console.log('URL parsing error (might be encoded):', e);
      }
      
      return generatedUrl;
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  return null;
}

async function testViaUrl(url: string) {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Testing premium_search_person_via_url with generated URL');
  console.log('URL:', url);
  
  try {
    const response = await fetch(`${API_BASE_URL}/premium_search_person_via_url`, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY || '',
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    const result = await response.json();
    const results = result?.response?.data || result?.data?.response?.data || result?.data?.data || [];
    const resultsCount = Array.isArray(results) ? results.length : 0;
    
    console.log('Response Status:', response.status);
    console.log('Results:', resultsCount);
    
    if (resultsCount > 0 && Array.isArray(results)) {
      const matching = results.filter((r: any) => {
        const location = r.geoRegion || r.location || '';
        return location.toLowerCase().includes('maryland');
      });
      const accuracy = (matching.length / resultsCount) * 100;
      console.log(`📍 Location Accuracy: ${accuracy.toFixed(1)}% (${matching.length}/${resultsCount} match Maryland)`);
      
      if (matching.length > 0) {
        console.log(`   Sample matching: ${matching[0].geoRegion || matching[0].location}`);
      }
      if (matching.length < resultsCount) {
        const nonMatch = results.find((r: any) => !(r.geoRegion || r.location || '').toLowerCase().includes('maryland'));
        console.log(`   Sample non-matching: ${nonMatch?.geoRegion || nonMatch?.location || 'N/A'}`);
      }
    }
    
    return resultsCount;
  } catch (error) {
    console.error('❌ Error:', error);
    return 0;
  }
}

async function testDirectSearch(filters: any[], keywords: string = '') {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Testing premium_search_person with filters');
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

    const result = await response.json();
    const results = result?.response?.data || result?.data?.response?.data || result?.data?.data || [];
    const resultsCount = Array.isArray(results) ? results.length : 0;
    
    console.log('Response Status:', response.status);
    console.log('Results:', resultsCount);
    
    if (resultsCount > 0 && Array.isArray(results)) {
      const matching = results.filter((r: any) => {
        const location = r.geoRegion || r.location || '';
        return location.toLowerCase().includes('maryland');
      });
      const accuracy = (matching.length / resultsCount) * 100;
      console.log(`📍 Location Accuracy: ${accuracy.toFixed(1)}% (${matching.length}/${resultsCount} match Maryland)`);
    }
    
    return resultsCount;
  } catch (error) {
    console.error('❌ Error:', error);
    return 0;
  }
}

async function runTests() {
  if (!RAPIDAPI_KEY) {
    console.error('❌ RAPIDAPI_KEY not found');
    process.exit(1);
  }

  console.log('🔍 Debugging LOCATION Filter - Finding Correct Format\n');

  // Test 1: Current format (urn:li:fs_geo:103644278)
  const filter1 = [{
    type: 'LOCATION',
    values: [{
      id: 'urn:li:fs_geo:103644278',
      text: 'Maryland',
      selectionType: 'INCLUDED'
    }]
  }];
  
  const url1 = await testJsonToUrl(filter1);
  if (url1) {
    const urlStr = typeof url1 === 'string' ? url1 : (url1 as any).data || url1;
    console.log('\n🔗 Extracted URL:', urlStr);
    await testViaUrl(urlStr);
  }
  await testDirectSearch(filter1);
  
  // Test 2: Alternative format (urn:li:geo:103644278) - without "fs_"
  const filter2 = [{
    type: 'LOCATION',
    values: [{
      id: 'urn:li:geo:103644278',
      text: 'Maryland',
      selectionType: 'INCLUDED'
    }]
  }];
  
  const url2 = await testJsonToUrl(filter2);
  if (url2) {
    await testViaUrl(url2);
  }
  await testDirectSearch(filter2);
  
  // Test 3: Just numeric ID
  const filter3 = [{
    type: 'LOCATION',
    values: [{
      id: '103644278',
      text: 'Maryland',
      selectionType: 'INCLUDED'
    }]
  }];
  
  const url3 = await testJsonToUrl(filter3);
  if (url3) {
    await testViaUrl(url3);
  }
  await testDirectSearch(filter3);
  
  // Test 4: Check what json_to_url returns for a known working location
  // Let's also check if the API accepts the filter but just doesn't apply it
  console.log('\n' + '='.repeat(80));
  console.log('📊 Summary: Testing all formats to find which works');
}

runTests().catch(console.error);

