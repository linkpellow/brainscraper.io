/**
 * Comprehensive Sales Navigator API Verification
 * 
 * Tests all endpoints and filters with minimal API calls
 * Designed to be cost-efficient while ensuring accuracy
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_BASE_URL = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com';

interface TestResult {
  name: string;
  success: boolean;
  resultsCount?: number;
  accuracy?: number;
  error?: string;
  requestBody?: any;
  responseStructure?: any;
  filterAccuracy?: Record<string, number>;
  apiCallsUsed: number;
}

interface VerificationReport {
  totalApiCalls: number;
  passed: number;
  failed: number;
  warnings: number;
  results: TestResult[];
  recommendations: string[];
}

// Track API calls to minimize usage
let totalApiCalls = 0;
const MAX_RESULTS_PER_TEST = 10; // Small limit to save API calls

/**
 * Make API call with call tracking
 */
async function makeAPICall(endpoint: string, body: any): Promise<{ response: Response; result: any }> {
  totalApiCalls++;
  
  const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY || '',
      'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const resultText = await response.text();
  let result: any;
  
  try {
    result = JSON.parse(resultText);
  } catch {
    result = { raw: resultText };
  }

  return { response, result };
}

/**
 * Extract results from various response structures
 */
function extractResults(data: any): { results: any[]; path: string } {
  // Try all known response structures
  if (data?.response?.data && Array.isArray(data.response.data)) {
    return { results: data.response.data, path: 'response.data' };
  }
  if (data?.data?.response?.data && Array.isArray(data.data.response.data)) {
    return { results: data.data.response.data, path: 'data.response.data' };
  }
  if (data?.data?.data && Array.isArray(data.data.data)) {
    return { results: data.data.data, path: 'data.data' };
  }
  if (Array.isArray(data?.data)) {
    return { results: data.data, path: 'data (array)' };
  }
  if (data?.response?.results && Array.isArray(data.response.results)) {
    return { results: data.response.results, path: 'response.results' };
  }
  if (data?.response?.leads && Array.isArray(data.response.leads)) {
    return { results: data.response.leads, path: 'response.leads' };
  }
  if (Array.isArray(data?.response)) {
    return { results: data.response, path: 'response (array)' };
  }
  if (Array.isArray(data)) {
    return { results: data, path: 'root (array)' };
  }
  
  return { results: [], path: 'unknown' };
}

/**
 * Test filter helper endpoint (low cost - just returns options)
 */
async function testFilterHelper(
  name: string,
  endpoint: string,
  body: any = {}
): Promise<TestResult> {
  try {
    const { response, result } = await makeAPICall(endpoint, body);
    
    return {
      name,
      success: response.ok,
      resultsCount: Array.isArray(result) ? result.length : (result.data ? 1 : 0),
      responseStructure: result,
      apiCallsUsed: 1,
    };
  } catch (error) {
    return {
      name,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      apiCallsUsed: 1,
    };
  }
}

/**
 * Test search endpoint with filters (higher cost - returns leads)
 */
async function testSearchEndpoint(
  name: string,
  endpoint: string,
  requestBody: any,
  validateAccuracy: boolean = false
): Promise<TestResult> {
  try {
    // Use small limit to minimize API calls
    const testBody = {
      ...requestBody,
      page: 1,
      limit: MAX_RESULTS_PER_TEST,
      account_number: 1,
    };

    const { response, result } = await makeAPICall(endpoint, testBody);
    
    if (!response.ok) {
      return {
        name,
        success: false,
        error: `HTTP ${response.status}: ${JSON.stringify(result).substring(0, 200)}`,
        requestBody: testBody,
        apiCallsUsed: 1,
      };
    }

    const { results, path } = extractResults(result);
    const resultsCount = results.length;

    // Calculate accuracy if requested
    let accuracy: number | undefined;
    let filterAccuracy: Record<string, number> | undefined;

    if (validateAccuracy && resultsCount > 0 && requestBody.filters) {
      filterAccuracy = {};
      
      // Check location filter accuracy
      const locationFilter = requestBody.filters.find((f: any) => f.type === 'LOCATION');
      if (locationFilter) {
        const expectedLocation = locationFilter.values[0]?.text || '';
        const matching = results.filter((r: any) => {
          const location = (r.geoRegion || r.location || r.locationName || r.currentLocation || '').toLowerCase();
          return location.includes(expectedLocation.toLowerCase());
        });
        filterAccuracy.location = (matching.length / resultsCount) * 100;
      }

      // Check company filter accuracy
      const companyFilter = requestBody.filters.find((f: any) => f.type === 'CURRENT_COMPANY');
      if (companyFilter) {
        const expectedCompany = companyFilter.values[0]?.text || '';
        const matching = results.filter((r: any) => {
          const company = (r.currentCompany || r.company || r.companyName || '').toLowerCase();
          return company.includes(expectedCompany.toLowerCase());
        });
        filterAccuracy.company = (matching.length / resultsCount) * 100;
      }

      accuracy = Object.values(filterAccuracy).reduce((sum, acc) => sum + acc, 0) / Object.keys(filterAccuracy).length;
    }

    return {
      name,
      success: response.ok && resultsCount >= 0,
      resultsCount,
      accuracy,
      filterAccuracy,
      requestBody: testBody,
      responseStructure: { path, hasPagination: !!(result.response?.pagination || result.data?.response?.pagination) },
      apiCallsUsed: 1,
    };
  } catch (error) {
    return {
      name,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      requestBody,
      apiCallsUsed: 1,
    };
  }
}

/**
 * Phase 1: Test Filter Helper Endpoints (Low Cost)
 */
async function phase1_FilterHelpers(): Promise<TestResult[]> {
  console.log('\n' + '='.repeat(80));
  console.log('PHASE 1: Filter Helper Endpoints (Low Cost Tests)');
  console.log('='.repeat(80));

  const results: TestResult[] = [];

  // Test all filter helper endpoints (these are cheap - just return options)
  const helpers = [
    { name: 'Location Suggestions', endpoint: 'filter_geography_location_region_suggestions', body: { query: 'Maryland' } },
    { name: 'Company Suggestions', endpoint: 'filter_company_suggestions', body: { query: 'Apple' } },
    { name: 'Industry Suggestions', endpoint: 'filter_industry_suggestions', body: { query: 'Tech' } },
    { name: 'Job Title Suggestions', endpoint: 'filter_job_title_suggestions', body: { query: 'Director' } },
    { name: 'Technology Options', endpoint: 'filter_technology', body: { query: 'React' } },
    { name: 'School Suggestions', endpoint: 'filter_school_suggestions', body: {} },
    { name: 'Years of Experience', endpoint: 'filter_years_in', body: {} },
    { name: 'Company Headcount', endpoint: 'filter_company_headcount', body: {} },
    { name: 'Annual Revenue', endpoint: 'filter_annual_revunue', body: {} },
    { name: 'Followers Count', endpoint: 'filter_followers_count', body: {} },
    { name: 'Department Headcount', endpoint: 'filter_department_headcount', body: {} },
    { name: 'Recent Activities', endpoint: 'filter_recent_activities', body: {} },
    { name: 'Job Opportunities', endpoint: 'filter_job_oppertunities', body: {} },
    { name: 'Fortune', endpoint: 'filter_fortune', body: {} },
    { name: 'Languages', endpoint: 'filter_languages', body: {} },
    { name: 'Seniority Level', endpoint: 'filter_seniority_level', body: {} },
    { name: 'Company Type', endpoint: 'filter_company_type', body: {} },
    { name: 'Search Suggestions', endpoint: 'search_suggestions', body: {} },
  ];

  for (const helper of helpers) {
    const result = await testFilterHelper(helper.name, helper.endpoint, helper.body);
    results.push(result);
    console.log(`${result.success ? '✅' : '❌'} ${helper.name}: ${result.success ? 'OK' : result.error}`);
    
    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return results;
}

/**
 * Phase 2: Test Critical Filter Formats (Higher Cost - But Essential)
 */
async function phase2_CriticalFilters(): Promise<TestResult[]> {
  console.log('\n' + '='.repeat(80));
  console.log('PHASE 2: Critical Filter Format Tests (Essential - Using Small Limits)');
  console.log('='.repeat(80));

  const results: TestResult[] = [];

  // Test 1: LOCATION filter (we know this works, but verify format)
  console.log('\n📍 Testing LOCATION Filter...');
  const locationTest = await testSearchEndpoint(
    'LOCATION Filter - Maryland',
    'premium_search_person',
    {
      filters: [{
        type: 'LOCATION',
        values: [{
          id: 'urn:li:fs_geo:103644278',
          text: 'Maryland',
          selectionType: 'INCLUDED',
        }],
      }],
      keywords: '',
    },
    true // Validate accuracy
  );
  results.push(locationTest);
  console.log(`   Results: ${locationTest.resultsCount}, Accuracy: ${locationTest.accuracy?.toFixed(1)}%`);

  // Test 2: CURRENT_COMPANY - Format A (normalized name - current)
  console.log('\n🏢 Testing CURRENT_COMPANY Filter - Format A (normalized name)...');
  const companyTestA = await testSearchEndpoint(
    'CURRENT_COMPANY - Format A (normalized)',
    'premium_search_person',
    {
      filters: [{
        type: 'CURRENT_COMPANY',
        values: [{
          id: 'apple',
          text: 'Apple',
          selectionType: 'INCLUDED',
        }],
      }],
      keywords: '',
    },
    true
  );
  results.push(companyTestA);
  console.log(`   Results: ${companyTestA.resultsCount}, Accuracy: ${companyTestA.accuracy?.toFixed(1)}%`);

  // Test 3: CURRENT_COMPANY - Format B (URN - from reference)
  console.log('\n🏢 Testing CURRENT_COMPANY Filter - Format B (URN format)...');
  const companyTestB = await testSearchEndpoint(
    'CURRENT_COMPANY - Format B (URN)',
    'premium_search_person',
    {
      filters: [{
        type: 'CURRENT_COMPANY',
        values: [{
          id: 'urn:li:organization:1586',
          text: 'Apple',
          selectionType: 'INCLUDED',
        }],
      }],
      keywords: '',
    },
    true
  );
  results.push(companyTestB);
  console.log(`   Results: ${companyTestB.resultsCount}, Accuracy: ${companyTestB.accuracy?.toFixed(1)}%`);

  // Test 4: COMPANY_HEADCOUNT - Format A (numeric - current)
  console.log('\n👥 Testing COMPANY_HEADCOUNT Filter - Format A (numeric)...');
  const headcountTestA = await testSearchEndpoint(
    'COMPANY_HEADCOUNT - Format A (numeric)',
    'premium_search_person',
    {
      filters: [{
        type: 'COMPANY_HEADCOUNT',
        values: [{
          id: '100',
          text: 'Min: 100',
          selectionType: 'INCLUDED',
        }],
      }],
      keywords: '',
    },
    false // Can't easily validate headcount accuracy
  );
  results.push(headcountTestA);
  console.log(`   Results: ${headcountTestA.resultsCount}`);

  // Test 5: COMPANY_HEADCOUNT - Format B (letter code - from reference)
  console.log('\n👥 Testing COMPANY_HEADCOUNT Filter - Format B (letter code)...');
  const headcountTestB = await testSearchEndpoint(
    'COMPANY_HEADCOUNT - Format B (letter)',
    'premium_search_person',
    {
      filters: [{
        type: 'COMPANY_HEADCOUNT',
        values: [{
          id: 'B',
          text: '1-10',
          selectionType: 'INCLUDED',
        }],
      }],
      keywords: '',
    },
    false
  );
  results.push(headcountTestB);
  console.log(`   Results: ${headcountTestB.resultsCount}`);

  // Test 6: Combined filters (LOCATION + COMPANY)
  console.log('\n🔗 Testing Combined Filters (LOCATION + COMPANY)...');
  const combinedTest = await testSearchEndpoint(
    'Combined: LOCATION + CURRENT_COMPANY',
    'premium_search_person',
    {
      filters: [
        {
          type: 'LOCATION',
          values: [{
            id: 'urn:li:fs_geo:103644278',
            text: 'Maryland',
            selectionType: 'INCLUDED',
          }],
        },
        {
          type: 'CURRENT_COMPANY',
          values: [{
            id: 'apple',
            text: 'Apple',
            selectionType: 'INCLUDED',
          }],
        },
      ],
      keywords: '',
    },
    true
  );
  results.push(combinedTest);
  console.log(`   Results: ${combinedTest.resultsCount}, Accuracy: ${combinedTest.accuracy?.toFixed(1)}%`);

  return results;
}

/**
 * Phase 3: Test via_url Flow (Medium Cost)
 */
async function phase3_ViaUrlFlow(): Promise<TestResult[]> {
  console.log('\n' + '='.repeat(80));
  console.log('PHASE 3: via_url Endpoint Flow (Medium Cost)');
  console.log('='.repeat(80));

  const results: TestResult[] = [];

  // Step 1: Generate URL with json_to_url
  console.log('\n🔗 Step 1: Generating URL with json_to_url...');
  const urlGen = await makeAPICall('json_to_url', {
    filters: [
      {
        type: 'LOCATION',
        values: [{
          id: 'urn:li:fs_geo:103644278',
          text: 'Maryland',
          selectionType: 'INCLUDED',
        }],
      },
    ],
    keywords: '',
  });

  let generatedUrl: string | null = null;
  if (urlGen.response.ok) {
    const urlData = urlGen.result;
    generatedUrl = urlData.url || urlData.data?.url || (typeof urlData === 'string' ? urlData : null);
    console.log(`   ✅ URL Generated: ${generatedUrl ? 'Yes' : 'No'}`);
  } else {
    console.log(`   ❌ URL Generation Failed: ${urlGen.response.status}`);
    results.push({
      name: 'json_to_url Generation',
      success: false,
      error: `HTTP ${urlGen.response.status}`,
      apiCallsUsed: 1,
    });
    return results;
  }

  if (!generatedUrl) {
    results.push({
      name: 'json_to_url Generation',
      success: false,
      error: 'No URL in response',
      apiCallsUsed: 1,
    });
    return results;
  }

  results.push({
    name: 'json_to_url Generation',
    success: true,
    responseStructure: { url: generatedUrl },
    apiCallsUsed: 1,
  });

  // Step 2: Use generated URL in via_url endpoint
  console.log('\n🔗 Step 2: Using URL in premium_search_person_via_url...');
  const viaUrlTest = await testSearchEndpoint(
    'via_url with Generated URL',
    'premium_search_person_via_url',
    {
      url: generatedUrl,
      page: 1,
      account_number: 1,
    },
    true
  );
  results.push(viaUrlTest);
  console.log(`   Results: ${viaUrlTest.resultsCount}, Accuracy: ${viaUrlTest.accuracy?.toFixed(1)}%`);

  return results;
}

/**
 * Phase 4: Test Other Filter Types (Lower Priority)
 */
async function phase4_OtherFilters(): Promise<TestResult[]> {
  console.log('\n' + '='.repeat(80));
  console.log('PHASE 4: Other Filter Types (Lower Priority)');
  console.log('='.repeat(80));

  const results: TestResult[] = [];

  // Test CHANGED_JOBS_90_DAYS
  console.log('\n🔄 Testing CHANGED_JOBS_90_DAYS Filter...');
  const changedJobsTest = await testSearchEndpoint(
    'CHANGED_JOBS_90_DAYS',
    'premium_search_person',
    {
      filters: [{
        type: 'CHANGED_JOBS_90_DAYS',
        values: [{
          id: 'true',
          text: 'Changed jobs in last 90 days',
          selectionType: 'INCLUDED',
        }],
      }],
      keywords: '',
    },
    false
  );
  results.push(changedJobsTest);
  console.log(`   Results: ${changedJobsTest.resultsCount}`);

  // Test INDUSTRY
  console.log('\n🏭 Testing INDUSTRY Filter...');
  const industryTest = await testSearchEndpoint(
    'INDUSTRY Filter',
    'premium_search_person',
    {
      filters: [{
        type: 'INDUSTRY',
        values: [{
          id: 'technology',
          text: 'Technology',
          selectionType: 'INCLUDED',
        }],
      }],
      keywords: '',
    },
    false
  );
  results.push(industryTest);
  console.log(`   Results: ${industryTest.resultsCount}`);

  return results;
}

/**
 * Main verification function
 */
async function runVerification(): Promise<VerificationReport> {
  if (!RAPIDAPI_KEY) {
    console.error('❌ RAPIDAPI_KEY not found in .env.local');
    process.exit(1);
  }

  console.log('🚀 Starting Comprehensive API Verification');
  console.log(`💰 API Call Budget: Minimizing calls (using limit: ${MAX_RESULTS_PER_TEST})`);
  console.log(`📊 Estimated API Calls: ~25-30 calls total`);

  const allResults: TestResult[] = [];
  const recommendations: string[] = [];

  // Phase 1: Filter Helpers (18 calls - low cost)
  const phase1Results = await phase1_FilterHelpers();
  allResults.push(...phase1Results);

  // Phase 2: Critical Filters (6 calls - essential)
  const phase2Results = await phase2_CriticalFilters();
  allResults.push(...phase2Results);

  // Phase 3: via_url Flow (2 calls)
  const phase3Results = await phase3_ViaUrlFlow();
  allResults.push(...phase3Results);

  // Phase 4: Other Filters (2 calls - lower priority)
  const phase4Results = await phase4_OtherFilters();
  allResults.push(...phase4Results);

  // Analyze results and generate recommendations
  const passed = allResults.filter(r => r.success).length;
  const failed = allResults.filter(r => !r.success).length;
  const warnings = allResults.filter(r => r.success && (r.accuracy !== undefined && r.accuracy < 90)).length;

  // Generate recommendations based on results
  const companyTestA = phase2Results.find(r => r.name.includes('Format A (normalized)'));
  const companyTestB = phase2Results.find(r => r.name.includes('Format B (URN)'));
  
  if (companyTestA && companyTestB) {
    if (companyTestA.resultsCount > companyTestB.resultsCount) {
      recommendations.push('✅ Use normalized company names (Format A) - returns more results');
    } else if (companyTestB.resultsCount > companyTestA.resultsCount) {
      recommendations.push('✅ Use URN format for companies (Format B) - returns more results');
    } else {
      recommendations.push('⚠️ Both company formats work similarly - use normalized names (simpler)');
    }
  }

  const headcountTestA = phase2Results.find(r => r.name.includes('COMPANY_HEADCOUNT') && r.name.includes('numeric'));
  const headcountTestB = phase2Results.find(r => r.name.includes('COMPANY_HEADCOUNT') && r.name.includes('letter'));
  
  if (headcountTestA && headcountTestB) {
    if (headcountTestA.resultsCount > 0 && headcountTestB.resultsCount === 0) {
      recommendations.push('✅ Use numeric format for COMPANY_HEADCOUNT (Format A)');
    } else if (headcountTestB.resultsCount > 0 && headcountTestA.resultsCount === 0) {
      recommendations.push('✅ Use letter codes for COMPANY_HEADCOUNT (Format B)');
    }
  }

  const locationTest = phase2Results.find(r => r.name.includes('LOCATION'));
  if (locationTest && locationTest.accuracy !== undefined) {
    if (locationTest.accuracy >= 90) {
      recommendations.push('✅ LOCATION filter works perfectly - 90%+ accuracy');
    } else if (locationTest.accuracy >= 50) {
      recommendations.push('⚠️ LOCATION filter accuracy is moderate - consider post-filtering');
    } else {
      recommendations.push('❌ LOCATION filter accuracy is low - API may not be applying filter correctly');
    }
  }

  const combinedTest = phase2Results.find(r => r.name.includes('Combined'));
  if (combinedTest && combinedTest.accuracy !== undefined) {
    if (combinedTest.accuracy >= 90) {
      recommendations.push('✅ Combined filters work perfectly');
    } else {
      recommendations.push('⚠️ Combined filters accuracy is lower than expected');
    }
  }

  return {
    totalApiCalls,
    passed,
    failed,
    warnings,
    results: allResults,
    recommendations,
  };
}

/**
 * Generate and save report
 */
async function generateReport(report: VerificationReport): Promise<void> {
  const fs = require('fs');
  const path = require('path');

  const reportContent = `# Comprehensive API Verification Report

**Date**: ${new Date().toISOString()}
**Total API Calls Used**: ${report.totalApiCalls}
**Status**: ${report.failed === 0 ? '✅ All Tests Passed' : `⚠️ ${report.failed} Tests Failed`}

---

## Summary

- ✅ **Passed**: ${report.passed}
- ❌ **Failed**: ${report.failed}
- ⚠️ **Warnings**: ${report.warnings} (low accuracy)
- 💰 **API Calls Used**: ${report.totalApiCalls}

---

## Recommendations

${report.recommendations.map(r => `- ${r}`).join('\n')}

---

## Detailed Results

${report.results.map((result, index) => `
### ${index + 1}. ${result.name}

- **Status**: ${result.success ? '✅ Passed' : '❌ Failed'}
- **Results Count**: ${result.resultsCount ?? 'N/A'}
- **Accuracy**: ${result.accuracy !== undefined ? `${result.accuracy.toFixed(1)}%` : 'N/A'}
${result.filterAccuracy ? `- **Filter Accuracy**: ${JSON.stringify(result.filterAccuracy, null, 2)}` : ''}
${result.error ? `- **Error**: ${result.error}` : ''}
${result.responseStructure ? `- **Response Path**: ${result.responseStructure.path || 'N/A'}` : ''}
`).join('\n')}

---

**Generated**: ${new Date().toISOString()}
`;

  const reportPath = path.join(process.cwd(), 'docs', 'VERIFICATION_RESULTS.md');
  fs.writeFileSync(reportPath, reportContent);
  console.log(`\n📄 Report saved to: ${reportPath}`);

  // Also save JSON for programmatic access
  const jsonPath = path.join(process.cwd(), 'verification-results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`📄 JSON saved to: ${jsonPath}`);
}

// Run verification
runVerification()
  .then(report => {
    console.log('\n' + '='.repeat(80));
    console.log('📊 VERIFICATION COMPLETE');
    console.log('='.repeat(80));
    console.log(`✅ Passed: ${report.passed}`);
    console.log(`❌ Failed: ${report.failed}`);
    console.log(`⚠️  Warnings: ${report.warnings}`);
    console.log(`💰 API Calls Used: ${report.totalApiCalls}`);
    console.log('\n📋 Recommendations:');
    report.recommendations.forEach(rec => console.log(`   ${rec}`));
    
    return generateReport(report);
  })
  .then(() => {
    console.log('\n✅ Verification complete! Check docs/VERIFICATION_RESULTS.md for details.');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  });
