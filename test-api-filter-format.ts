/**
 * Diagnostic test to find the correct filter format for LinkedIn Sales Navigator API
 * Tests different filter formats to see which one the API actually accepts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_BASE_URL = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com';

interface TestCase {
  name: string;
  requestBody: any;
}

const testCases: TestCase[] = [
  // Test 1: Current format (what we're using)
  {
    name: 'Current Format - LOCATION filter with URN',
    requestBody: {
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
  
  // Test 2: LOCATION filter with just numeric ID
  {
    name: 'LOCATION filter with numeric ID only',
    requestBody: {
      filters: [{
        type: 'LOCATION',
        values: [{
          id: '103644278',
          text: 'Maryland',
          selectionType: 'INCLUDED'
        }]
      }],
      keywords: '',
      page: 1,
      limit: 10
    }
  },
  
  // Test 3: LOCATION filter with different structure
  {
    name: 'LOCATION filter - alternative structure',
    requestBody: {
      filters: [{
        type: 'LOCATION',
        values: [{
          id: 'urn:li:fs_geo:103644278',
          text: 'Maryland, United States',
          selectionType: 'INCLUDED'
        }]
      }],
      keywords: '',
      page: 1,
      limit: 10
    }
  },
  
  // Test 4: Keywords only (baseline)
  {
    name: 'Keywords only - Maryland',
    requestBody: {
      filters: [],
      keywords: 'Maryland',
      page: 1,
      limit: 10
    }
  },
  
  // Test 5: JOB_TITLE filter
  {
    name: 'JOB_TITLE filter',
    requestBody: {
      filters: [{
        type: 'JOB_TITLE',
        values: [{
          id: 'director',
          text: 'Director',
          selectionType: 'INCLUDED'
        }]
      }],
      keywords: '',
      page: 1,
      limit: 10
    }
  },
  
  // Test 6: TITLE filter (alternative name)
  {
    name: 'TITLE filter (alternative)',
    requestBody: {
      filters: [{
        type: 'TITLE',
        values: [{
          id: 'director',
          text: 'Director',
          selectionType: 'INCLUDED'
        }]
      }],
      keywords: '',
      page: 1,
      limit: 10
    }
  },
  
  // Test 7: JOB_FUNCTION filter
  {
    name: 'JOB_FUNCTION filter',
    requestBody: {
      filters: [{
        type: 'JOB_FUNCTION',
        values: [{
          id: 'director',
          text: 'Director',
          selectionType: 'INCLUDED'
        }]
      }],
      keywords: '',
      page: 1,
      limit: 10
    }
  },
  
  // Test 8: Keywords with job title
  {
    name: 'Keywords - Director',
    requestBody: {
      filters: [],
      keywords: 'Director',
      page: 1,
      limit: 10
    }
  },
  
  // Test 9: Combined LOCATION + keywords
  {
    name: 'LOCATION filter + keywords',
    requestBody: {
      filters: [{
        type: 'LOCATION',
        values: [{
          id: 'urn:li:fs_geo:103644278',
          text: 'Maryland',
          selectionType: 'INCLUDED'
        }]
      }],
      keywords: 'Director',
      page: 1,
      limit: 10
    }
  }
];

async function testFormat(testCase: TestCase): Promise<void> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 Testing: ${testCase.name}`);
  console.log('Request:', JSON.stringify(testCase.requestBody, null, 2));
  
  try {
    const response = await fetch(`${API_BASE_URL}/premium_search_person`, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY || '',
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testCase.requestBody),
    });

    const resultText = await response.text();
    let result: any;
    
    try {
      result = JSON.parse(resultText);
    } catch {
      result = { raw: resultText };
    }

    const results = result?.response?.data || result?.data?.response?.data || result?.data?.data || [];
    const resultsCount = Array.isArray(results) ? results.length : 0;
    
    console.log(`Status: ${response.status}`);
    console.log(`Results: ${resultsCount}`);
    
    if (resultsCount > 0 && Array.isArray(results)) {
      // Check location accuracy for location tests
      if (testCase.requestBody.filters?.some((f: any) => f.type === 'LOCATION') || testCase.requestBody.keywords?.includes('Maryland')) {
        const matching = results.filter((r: any) => {
          const location = r.geoRegion || r.location || '';
          return location.toLowerCase().includes('maryland');
        });
        const accuracy = (matching.length / resultsCount) * 100;
        console.log(`📍 Location Accuracy: ${accuracy.toFixed(1)}% (${matching.length}/${resultsCount} match Maryland)`);
        if (matching.length > 0) {
          console.log(`   Sample matching location: ${matching[0].geoRegion || matching[0].location}`);
        }
        if (matching.length < resultsCount) {
          console.log(`   Sample non-matching: ${results.find((r: any) => !(r.geoRegion || r.location || '').toLowerCase().includes('maryland'))?.geoRegion || 'N/A'}`);
        }
      }
      
      // Check job title accuracy for job title tests
      if (testCase.requestBody.filters?.some((f: any) => f.type === 'JOB_TITLE' || f.type === 'TITLE' || f.type === 'JOB_FUNCTION') || testCase.requestBody.keywords?.toLowerCase().includes('director')) {
        const matching = results.filter((r: any) => {
          const title = (r.currentPosition?.title || r.title || '').toLowerCase();
          return title.includes('director');
        });
        const accuracy = (matching.length / resultsCount) * 100;
        console.log(`💼 Job Title Accuracy: ${accuracy.toFixed(1)}% (${matching.length}/${resultsCount} contain "director")`);
        if (matching.length > 0) {
          console.log(`   Sample matching title: ${matching[0].currentPosition?.title || matching[0].title}`);
        }
        if (matching.length < resultsCount) {
          console.log(`   Sample non-matching: ${results.find((r: any) => !(r.currentPosition?.title || r.title || '').toLowerCase().includes('director'))?.currentPosition?.title || 'N/A'}`);
        }
      }
      
      // Show first result structure
      if (results.length > 0) {
        console.log(`\nFirst Result:`);
        console.log(`  Name: ${results[0].fullName || results[0].firstName}`);
        console.log(`  Location: ${results[0].geoRegion || results[0].location || 'N/A'}`);
        console.log(`  Title: ${results[0].currentPosition?.title || results[0].title || 'N/A'}`);
      }
    } else {
      console.log('⚠️  No results returned');
      if (result.error) {
        console.log(`Error: ${JSON.stringify(result.error)}`);
      }
    }
  } catch (error) {
    console.error(`❌ Test failed:`, error);
  }
}

async function runAllTests() {
  if (!RAPIDAPI_KEY) {
    console.error('❌ RAPIDAPI_KEY not found');
    process.exit(1);
  }

  console.log('🔍 Diagnostic Test: Finding Correct Filter Format\n');
  
  for (const testCase of testCases) {
    await testFormat(testCase);
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log('✅ Diagnostic tests complete');
  console.log('Review results above to determine which filter format works best');
}

runAllTests().catch(console.error);

