/**
 * Verify if location ID 103644278 is correct for Maryland
 * Test with different location IDs to find the correct one
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_BASE_URL = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com';

async function testLocationId(locationId: string, locationName: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 Testing Location ID: ${locationId} (${locationName})`);
  
  const filters = [{
    type: 'LOCATION',
    values: [{
      id: `urn:li:fs_geo:${locationId}`,
      text: locationName,
      selectionType: 'INCLUDED'
    }]
  }];
  
  try {
    const response = await fetch(`${API_BASE_URL}/premium_search_person`, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY || '',
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filters, keywords: '', page: 1, limit: 25 }),
    });

    const result = await response.json();
    const results = result?.response?.data || result?.data?.response?.data || result?.data?.data || [];
    const resultsCount = Array.isArray(results) ? results.length : 0;
    
    if (resultsCount > 0 && Array.isArray(results)) {
      const matching = results.filter((r: any) => {
        const location = (r.geoRegion || r.location || '').toLowerCase();
        return location.includes('maryland') || location.includes('md');
      });
      const accuracy = (matching.length / resultsCount) * 100;
      
      console.log(`Results: ${resultsCount}`);
      console.log(`📍 Location Accuracy: ${accuracy.toFixed(1)}% (${matching.length}/${resultsCount} match Maryland)`);
      
      if (matching.length > 0) {
        console.log(`✅ SUCCESS! Found ${matching.length} Maryland results`);
        console.log(`   Sample: ${matching[0].fullName} - ${matching[0].geoRegion || matching[0].location}`);
        return true;
      } else {
        console.log(`❌ No Maryland results found`);
        if (results.length > 0) {
          console.log(`   Sample locations: ${results.slice(0, 3).map((r: any) => r.geoRegion || r.location).join(', ')}`);
        }
      }
    } else {
      console.log(`⚠️  No results returned`);
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

  console.log('🔍 Verifying Location IDs for Maryland\n');
  
  // Test known location IDs that might be Maryland
  // These are common US state location IDs (need to verify)
  const testIds = [
    { id: '103644278', name: 'Maryland (current)' },
    { id: '103644279', name: 'Maryland +1' },
    { id: '103644277', name: 'Maryland -1' },
    { id: '90000084', name: 'Maryland (alternative)' }, // Common US state pattern
    { id: '90000085', name: 'Maryland (alternative +1)' },
  ];
  
  let foundWorking = false;
  for (const test of testIds) {
    const works = await testLocationId(test.id, test.name);
    if (works) {
      foundWorking = true;
      console.log(`\n✅ FOUND WORKING LOCATION ID: ${test.id}`);
      break;
    }
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  if (!foundWorking) {
    console.log('\n❌ None of the tested location IDs worked');
    console.log('The API might be ignoring LOCATION filters entirely, or we need to find the correct ID format');
  }
}

runTests().catch(console.error);

