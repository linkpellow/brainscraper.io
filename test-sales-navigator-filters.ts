/**
 * Test LinkedIn Sales Navigator API - State and Job Title Filtering
 * 
 * This script tests the exact API implementation to verify:
 * 1. State filtering works accurately
 * 2. Job title filtering works accurately
 * 3. Combined filtering works
 * 4. Response parsing is 100% accurate
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_BASE_URL = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com';

interface TestResult {
  name: string;
  success: boolean;
  resultsCount: number;
  error?: string;
  requestBody?: any;
  responseStructure?: any;
  filtersApplied?: string[];
}

async function testAPI(
  name: string,
  endpoint: string,
  requestBody: any
): Promise<TestResult> {
  console.log(`\n🧪 Testing: ${name}`);
  console.log('Request Body:', JSON.stringify(requestBody, null, 2));
  
  try {
    const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY || '',
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const resultText = await response.text();
    let result: any;
    
    try {
      result = JSON.parse(resultText);
    } catch {
      result = { raw: resultText };
    }

    console.log('Response Status:', response.status);
    console.log('Full Response Structure:', JSON.stringify(result, null, 2).substring(0, 2000));
    console.log('Response Keys:', result && typeof result === 'object' ? Object.keys(result) : []);
    
    // Check all possible response structures
    console.log('\n📋 Response Structure Analysis:');
    console.log('  result.response exists:', !!result.response);
    console.log('  result.data exists:', !!result.data);
    console.log('  result.response?.data exists:', !!result.response?.data);
    console.log('  result.response?.data is array:', Array.isArray(result.response?.data));
    console.log('  result.data?.response exists:', !!result.data?.response);
    console.log('  result.data?.response?.data exists:', !!result.data?.response?.data);
    console.log('  result.data?.data exists:', !!result.data?.data);
    console.log('  result.data is array:', Array.isArray(result.data));
    console.log('  result.response?.results exists:', !!result.response?.results);
    console.log('  result.response?.leads exists:', !!result.response?.leads);

    // Extract results count - check ALL possible paths
    let resultsCount = 0;
    let responsePath = 'unknown';
    let actualResults: any[] = [];
    
    // Path 1: result.response.data (most common based on test output)
    if (result.response?.data && Array.isArray(result.response.data)) {
      resultsCount = result.response.data.length;
      responsePath = 'response.data';
      actualResults = result.response.data;
    }
    // Path 2: result.data.response.data
    else if (result.data?.response?.data && Array.isArray(result.data.response.data)) {
      resultsCount = result.data.response.data.length;
      responsePath = 'data.response.data';
      actualResults = result.data.response.data;
    }
    // Path 3: result.data.data
    else if (result.data?.data && Array.isArray(result.data.data)) {
      resultsCount = result.data.data.length;
      responsePath = 'data.data';
      actualResults = result.data.data;
    }
    // Path 4: result.data (direct array)
    else if (Array.isArray(result.data)) {
      resultsCount = result.data.length;
      responsePath = 'data (array)';
      actualResults = result.data;
    }
    // Path 5: result.response.results
    else if (result.response?.results && Array.isArray(result.response.results)) {
      resultsCount = result.response.results.length;
      responsePath = 'response.results';
      actualResults = result.response.results;
    }
    // Path 6: result.response.leads
    else if (result.response?.leads && Array.isArray(result.response.leads)) {
      resultsCount = result.response.leads.length;
      responsePath = 'response.leads';
      actualResults = result.response.leads;
    }
    // Path 7: result.data.leads
    else if (result.data?.leads && Array.isArray(result.data.leads)) {
      resultsCount = result.data.leads.length;
      responsePath = 'data.leads';
      actualResults = result.data.leads;
    }
    // Path 8: result.data.results
    else if (result.data?.results && Array.isArray(result.data.results)) {
      resultsCount = result.data.results.length;
      responsePath = 'data.results';
      actualResults = result.data.results;
    }
    // Path 9: result.response (if it's an array)
    else if (Array.isArray(result.response)) {
      resultsCount = result.response.length;
      responsePath = 'response (array)';
      actualResults = result.response;
    }

    console.log(`\n✅ Found ${resultsCount} results via path: ${responsePath}`);
    
    if (resultsCount > 0 && actualResults.length > 0) {
      const firstResult = actualResults[0];
      console.log('First Result Keys:', Object.keys(firstResult));
      console.log('First Result Sample:', {
        name: firstResult.fullName || firstResult.name || firstResult.firstName || firstResult.profileName,
        location: firstResult.geoRegion || firstResult.location || firstResult.locationName || firstResult.currentLocation,
        title: firstResult.title || firstResult.job_title || firstResult.currentPosition?.title || firstResult.headline,
        profileUrl: firstResult.profileUrl || firstResult.profile_url || firstResult.linkedinUrl
      });
      
      // Validate filter accuracy
      if (requestBody.filters && Array.isArray(requestBody.filters)) {
        const locationFilter = requestBody.filters.find((f: any) => f.type === 'LOCATION');
        const jobTitleFilter = requestBody.filters.find((f: any) => f.type === 'JOB_TITLE');
        
        if (locationFilter) {
          const expectedLocation = locationFilter.values[0]?.text || locationFilter.values[0]?.id;
          const matchingLocations = actualResults.filter((r: any) => {
            const location = r.geoRegion || r.location || r.locationName || r.currentLocation || '';
            return location.toLowerCase().includes(expectedLocation.toLowerCase());
          });
          const matchRate = (matchingLocations.length / actualResults.length) * 100;
          console.log(`\n📍 Location Filter Validation:`);
          console.log(`   Expected: ${expectedLocation}`);
          console.log(`   Matching: ${matchingLocations.length}/${actualResults.length} (${matchRate.toFixed(1)}%)`);
          if (matchRate < 50) {
            console.warn(`   ⚠️  Low match rate! First 3 locations:`, actualResults.slice(0, 3).map((r: any) => r.geoRegion || r.location));
          }
        }
        
        if (jobTitleFilter) {
          const expectedTitles = jobTitleFilter.values.map((v: any) => v.text.toLowerCase());
          const matchingTitles = actualResults.filter((r: any) => {
            const title = (r.currentPosition?.title || r.title || r.job_title || '').toLowerCase();
            return expectedTitles.some((et: string) => title.includes(et));
          });
          const matchRate = (matchingTitles.length / actualResults.length) * 100;
          console.log(`\n💼 Job Title Filter Validation:`);
          console.log(`   Expected: ${expectedTitles.join(', ')}`);
          console.log(`   Matching: ${matchingTitles.length}/${actualResults.length} (${matchRate.toFixed(1)}%)`);
          if (matchRate < 50) {
            console.warn(`   ⚠️  Low match rate! First 3 titles:`, actualResults.slice(0, 3).map((r: any) => r.currentPosition?.title || r.title));
          }
        }
      }
    } else if (result.response) {
      console.log('Response object structure:', {
        keys: Object.keys(result.response),
        type: typeof result.response,
        isArray: Array.isArray(result.response),
        sample: JSON.stringify(result.response).substring(0, 500)
      });
    }

    // Calculate filter accuracy
  let filterAccuracy: Record<string, number> = {};
  if (resultsCount > 0 && actualResults.length > 0 && requestBody.filters) {
    const locationFilter = requestBody.filters.find((f: any) => f.type === 'LOCATION');
    const jobTitleFilter = requestBody.filters.find((f: any) => f.type === 'JOB_TITLE');
    
    if (locationFilter) {
      const expectedLocation = locationFilter.values[0]?.text || locationFilter.values[0]?.id;
      const matching = actualResults.filter((r: any) => {
        const location = r.geoRegion || r.location || r.locationName || r.currentLocation || '';
        return location.toLowerCase().includes(expectedLocation.toLowerCase());
      });
      filterAccuracy.location = (matching.length / actualResults.length) * 100;
    }
    
    if (jobTitleFilter) {
      const expectedTitles = jobTitleFilter.values.map((v: any) => v.text.toLowerCase());
      const matching = actualResults.filter((r: any) => {
        const title = (r.currentPosition?.title || r.title || r.job_title || '').toLowerCase();
        return expectedTitles.some((et: string) => title.includes(et));
      });
      filterAccuracy.jobTitle = (matching.length / actualResults.length) * 100;
    }
  }

  return {
      name,
      success: response.ok && resultsCount >= 0,
      resultsCount,
      requestBody,
      responseStructure: {
        path: responsePath,
        hasPagination: !!(result.response?.pagination || result.data?.response?.pagination || result.data?.data?.response?.pagination),
        structure: result
      },
      filtersApplied: requestBody.filters?.map((f: any) => f.type) || [],
      filterAccuracy
    };
  } catch (error) {
    console.error('❌ Test failed:', error);
    return {
      name,
      success: false,
      resultsCount: 0,
      error: error instanceof Error ? error.message : String(error),
      requestBody
    };
  }
}

async function runTests() {
  if (!RAPIDAPI_KEY) {
    console.error('❌ RAPIDAPI_KEY not found in .env.local');
    process.exit(1);
  }

  console.log('🚀 Starting LinkedIn Sales Navigator API Tests\n');
  console.log('='.repeat(80));

  const results: TestResult[] = [];

  // Test 1: State Filter Only (Maryland)
  results.push(await testAPI(
    'State Filter: Maryland',
    'premium_search_person',
    {
      filters: [
        {
          type: 'LOCATION',
          values: [{
            id: 'urn:li:fs_geo:103644278',
            text: 'Maryland',
            selectionType: 'INCLUDED'
          }]
        }
      ],
      keywords: '',
      page: 1,
      limit: 10
    }
  ));

  // Test 2: Job Title Filter Only
  results.push(await testAPI(
    'Job Title Filter: Director',
    'premium_search_person',
    {
      filters: [
        {
          type: 'JOB_TITLE',
          values: [{
            id: 'director',
            text: 'Director',
            selectionType: 'INCLUDED'
          }]
        }
      ],
      keywords: '',
      page: 1,
      limit: 10
    }
  ));

  // Test 3: Combined State + Job Title
  results.push(await testAPI(
    'Combined: Maryland + Director',
    'premium_search_person',
    {
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
          type: 'JOB_TITLE',
          values: [{
            id: 'director',
            text: 'Director',
            selectionType: 'INCLUDED'
          }]
        }
      ],
      keywords: '',
      page: 1,
      limit: 10
    }
  ));

  // Test 4: Keywords Only (Fallback)
  results.push(await testAPI(
    'Keywords: Maryland Director',
    'premium_search_person',
    {
      filters: [],
      keywords: 'Maryland Director',
      page: 1,
      limit: 10
    }
  ));

  // Test 5: Multiple Job Titles
  results.push(await testAPI(
    'Multiple Job Titles: Director, VP',
    'premium_search_person',
    {
      filters: [
        {
          type: 'JOB_TITLE',
          values: [
            {
              id: 'director',
              text: 'Director',
              selectionType: 'INCLUDED'
            },
            {
              id: 'vp',
              text: 'VP',
              selectionType: 'INCLUDED'
            }
          ]
        }
      ],
      keywords: '',
      page: 1,
      limit: 10
    }
  ));

  // Test 6: State + Company + Job Title (Complex)
  results.push(await testAPI(
    'Complex: Maryland + Apple + Director',
    'premium_search_person',
    {
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
        },
        {
          type: 'JOB_TITLE',
          values: [{
            id: 'director',
            text: 'Director',
            selectionType: 'INCLUDED'
          }]
        }
      ],
      keywords: '',
      page: 1,
      limit: 10
    }
  ));

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST RESULTS SUMMARY\n');
  
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} Test ${index + 1}: ${result.name}`);
    console.log(`   Results: ${result.resultsCount}`);
    console.log(`   Filters: ${result.filtersApplied?.join(', ') || 'None'}`);
    if (result.responseStructure) {
      console.log(`   Response Path: ${result.responseStructure.path}`);
    }
    if (result.filterAccuracy && Object.keys(result.filterAccuracy).length > 0) {
      console.log(`   Filter Accuracy:`);
      if (result.filterAccuracy.location !== undefined) {
        const accuracy = result.filterAccuracy.location;
        const status = accuracy >= 80 ? '✅' : accuracy >= 50 ? '⚠️' : '❌';
        console.log(`     ${status} Location: ${accuracy.toFixed(1)}%`);
      }
      if (result.filterAccuracy.jobTitle !== undefined) {
        const accuracy = result.filterAccuracy.jobTitle;
        const status = accuracy >= 80 ? '✅' : accuracy >= 50 ? '⚠️' : '❌';
        console.log(`     ${status} Job Title: ${accuracy.toFixed(1)}%`);
      }
    }
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    console.log('');
  });

  const successCount = results.filter(r => r.success).length;
  const totalResults = results.reduce((sum, r) => sum + r.resultsCount, 0);
  
  console.log('='.repeat(80));
  console.log(`✅ Passed: ${successCount}/${results.length}`);
  console.log(`📊 Total Results Found: ${totalResults}`);
  console.log('='.repeat(80));

  // Save results
  const fs = require('fs');
  fs.writeFileSync(
    'sales-navigator-test-results.json',
    JSON.stringify(results, null, 2)
  );
  console.log('\n💾 Results saved to: sales-navigator-test-results.json');
}

// Run tests
runTests().catch(console.error);

