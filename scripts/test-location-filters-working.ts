/**
 * Test Script: Verify if Location Filters Actually Work
 * 
 * Tests if REGION filters work with the RapidAPI LinkedIn Sales Navigator API
 * This will determine if we can enable filters to get 100% accuracy with 0% waste
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_BASE_URL = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com';

interface TestResult {
  testName: string;
  success: boolean;
  resultCount: number;
  locationMatchRate: number;
  sampleLocations: string[];
  error?: string;
}

async function testLocationFilter(
  testName: string,
  locationId: string,
  locationName: string,
  format: 'numeric' | 'urn' | 'region'
): Promise<TestResult> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 Test: ${testName}`);
  console.log(`   Location ID: ${locationId}`);
  console.log(`   Location Name: ${locationName}`);
  console.log(`   Format: ${format}`);
  
  let filter: any;
  
  if (format === 'numeric') {
    // Format: Just numeric ID
    filter = {
      type: 'REGION',
      values: [{
        id: locationId,
        text: locationName,
        selectionType: 'INCLUDED',
      }],
      selectedSubFilter: 50,
    };
  } else if (format === 'urn') {
    // Format: Full URN
    filter = {
      type: 'REGION',
      values: [{
        id: `urn:li:fs_geo:${locationId}`,
        text: locationName,
        selectionType: 'INCLUDED',
      }],
      selectedSubFilter: 50,
    };
  } else {
    // Format: REGION type (current implementation)
    filter = {
      type: 'REGION',
      values: [{
        id: locationId,
        text: locationName,
        selectionType: 'INCLUDED',
      }],
      selectedSubFilter: 50,
    };
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/premium_search_person`, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY || '',
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filters: [filter],
        keywords: '', // Empty keywords to test filter-only
        page: 1,
        limit: 25,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return {
        testName,
        success: false,
        resultCount: 0,
        locationMatchRate: 0,
        sampleLocations: [],
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }
    
    const result = await response.json();
    
    // Extract leads from various possible response structures
    const leads = 
      result?.response?.data ||
      result?.data?.response?.data ||
      result?.data?.data ||
      (Array.isArray(result?.data) ? result.data : []) ||
      [];
    
    const leadsArray = Array.isArray(leads) ? leads : [];
    const resultCount = leadsArray.length;
    
    // Check location matching
    const locationLower = locationName.toLowerCase();
    let matchingCount = 0;
    const sampleLocations: string[] = [];
    
    for (const lead of leadsArray.slice(0, 10)) {
      const leadLocation = String(
        lead.location || 
        lead.geoRegion || 
        lead.locationName || 
        ''
      ).toLowerCase();
      
      sampleLocations.push(leadLocation || 'No location');
      
      // Check if location matches
      if (leadLocation.includes(locationLower) || 
          locationLower.includes(leadLocation.split(',')[0])) {
        matchingCount++;
      }
    }
    
    const locationMatchRate = resultCount > 0 ? (matchingCount / Math.min(resultCount, 10)) * 100 : 0;
    
    console.log(`   ✅ Results: ${resultCount} leads`);
    console.log(`   📍 Location Match Rate: ${locationMatchRate.toFixed(1)}%`);
    console.log(`   📋 Sample Locations:`, sampleLocations.slice(0, 5));
    
    return {
      testName,
      success: resultCount > 0,
      resultCount,
      locationMatchRate,
      sampleLocations: sampleLocations.slice(0, 10),
    };
  } catch (error) {
    return {
      testName,
      success: false,
      resultCount: 0,
      locationMatchRate: 0,
      sampleLocations: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testKeywordsOnly(locationName: string): Promise<TestResult> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 Test: Keywords Only (Current Approach)`);
  console.log(`   Keywords: "${locationName}"`);
  
  try {
    const response = await fetch(`${API_BASE_URL}/premium_search_person`, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY || '',
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filters: [],
        keywords: locationName,
        page: 1,
        limit: 25,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return {
        testName: 'Keywords Only',
        success: false,
        resultCount: 0,
        locationMatchRate: 0,
        sampleLocations: [],
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }
    
    const result = await response.json();
    const leads = 
      result?.response?.data ||
      result?.data?.response?.data ||
      result?.data?.data ||
      (Array.isArray(result?.data) ? result.data : []) ||
      [];
    
    const leadsArray = Array.isArray(leads) ? leads : [];
    const resultCount = leadsArray.length;
    
    const locationLower = locationName.toLowerCase();
    let matchingCount = 0;
    const sampleLocations: string[] = [];
    
    for (const lead of leadsArray.slice(0, 10)) {
      const leadLocation = String(
        lead.location || 
        lead.geoRegion || 
        lead.locationName || 
        ''
      ).toLowerCase();
      
      sampleLocations.push(leadLocation || 'No location');
      
      if (leadLocation.includes(locationLower) || 
          locationLower.includes(leadLocation.split(',')[0])) {
        matchingCount++;
      }
    }
    
    const locationMatchRate = resultCount > 0 ? (matchingCount / Math.min(resultCount, 10)) * 100 : 0;
    
    console.log(`   ✅ Results: ${resultCount} leads`);
    console.log(`   📍 Location Match Rate: ${locationMatchRate.toFixed(1)}%`);
    console.log(`   📋 Sample Locations:`, sampleLocations.slice(0, 5));
    
    return {
      testName: 'Keywords Only',
      success: resultCount > 0,
      resultCount,
      locationMatchRate,
      sampleLocations: sampleLocations.slice(0, 10),
    };
  } catch (error) {
    return {
      testName: 'Keywords Only',
      success: false,
      resultCount: 0,
      locationMatchRate: 0,
      sampleLocations: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runTests() {
  if (!RAPIDAPI_KEY) {
    console.error('❌ RAPIDAPI_KEY not found in .env.local');
    process.exit(1);
  }
  
  console.log('🚀 Testing Location Filters - Do They Actually Work?');
  console.log('='.repeat(80));
  console.log('\nThis test will determine if we can enable filters for 100% accuracy.');
  console.log('Testing with Maryland (known working location ID: 103644278)\n');
  
  const results: TestResult[] = [];
  
  // Test 1: REGION filter with numeric ID (current format)
  results.push(await testLocationFilter(
    'REGION Filter (Numeric ID)',
    '103644278',
    'Maryland',
    'numeric'
  ));
  
  // Test 2: REGION filter with URN format
  results.push(await testLocationFilter(
    'REGION Filter (URN Format)',
    '103644278',
    'Maryland',
    'urn'
  ));
  
  // Test 3: LOCATION filter (old format - might not work)
  try {
    const response = await fetch(`${API_BASE_URL}/premium_search_person`, {
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
            id: '103644278',
            text: 'Maryland',
            selectionType: 'INCLUDED',
          }],
        }],
        keywords: '',
        page: 1,
        limit: 25,
      }),
    });
    
    if (response.ok) {
      const result = await response.json();
      const leads = result?.response?.data || result?.data?.response?.data || [];
      results.push({
        testName: 'LOCATION Filter (Old Format)',
        success: Array.isArray(leads) && leads.length > 0,
        resultCount: Array.isArray(leads) ? leads.length : 0,
        locationMatchRate: 0,
        sampleLocations: [],
      });
    } else {
      results.push({
        testName: 'LOCATION Filter (Old Format)',
        success: false,
        resultCount: 0,
        locationMatchRate: 0,
        sampleLocations: [],
        error: `HTTP ${response.status}`,
      });
    }
  } catch (error) {
    results.push({
      testName: 'LOCATION Filter (Old Format)',
      success: false,
      resultCount: 0,
      locationMatchRate: 0,
      sampleLocations: [],
      error: error instanceof Error ? error.message : String(error),
    });
  }
  
  // Test 4: Keywords only (baseline - current approach)
  results.push(await testKeywordsOnly('Maryland'));
  
  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(80));
  
  for (const result of results) {
    const status = result.success ? '✅' : '❌';
    console.log(`\n${status} ${result.testName}`);
    console.log(`   Results: ${result.resultCount} leads`);
    if (result.locationMatchRate > 0) {
      console.log(`   Location Match: ${result.locationMatchRate.toFixed(1)}%`);
    }
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    if (result.sampleLocations.length > 0) {
      console.log(`   Sample: ${result.sampleLocations.slice(0, 3).join(', ')}`);
    }
  }
  
  // Determine best approach
  console.log(`\n${'='.repeat(80)}`);
  console.log('🎯 RECOMMENDATION');
  console.log('='.repeat(80));
  
  const filterTests = results.filter(r => r.testName.includes('Filter'));
  const bestFilterTest = filterTests.find(r => r.locationMatchRate > 80) || 
                        filterTests.find(r => r.locationMatchRate > 50) ||
                        filterTests[0];
  
  const keywordsTest = results.find(r => r.testName === 'Keywords Only');
  
  if (bestFilterTest && bestFilterTest.locationMatchRate > 80) {
    console.log(`\n✅ FILTERS WORK! Location match rate: ${bestFilterTest.locationMatchRate.toFixed(1)}%`);
    console.log(`   → Enable filters immediately for 100% accuracy`);
    console.log(`   → Use format: ${bestFilterTest.testName}`);
  } else if (bestFilterTest && bestFilterTest.locationMatchRate > 50) {
    console.log(`\n⚠️  FILTERS PARTIALLY WORK. Location match rate: ${bestFilterTest.locationMatchRate.toFixed(1)}%`);
    console.log(`   → Filters help but not perfect`);
    console.log(`   → Use filters + post-filtering for 100% accuracy`);
  } else {
    console.log(`\n❌ FILTERS DON'T WORK. Location match rate: ${bestFilterTest?.locationMatchRate.toFixed(1) || 0}%`);
    console.log(`   → Filters are ignored by API`);
    console.log(`   → Proceed with via_url endpoint or improved keywords`);
  }
  
  if (keywordsTest) {
    console.log(`\n📊 Keywords Only: ${keywordsTest.locationMatchRate.toFixed(1)}% match rate`);
    console.log(`   → Current approach accuracy`);
  }
  
  console.log('\n');
}

runTests().catch(console.error);









