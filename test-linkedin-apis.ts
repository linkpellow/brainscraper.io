/**
 * Test script to check what data each LinkedIn API returns
 * Run with: npx tsx test-linkedin-apis.ts
 * 
 * Make sure your dev server is running: npm run dev
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config({ path: '.env.local' });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

if (!RAPIDAPI_KEY) {
  console.error('❌ RAPIDAPI_KEY not found in .env.local');
  process.exit(1);
}

interface TestResult {
  api: string;
  endpoint: string;
  method: string;
  request: any;
  status: number;
  response: any;
  hasLocationData: boolean;
  locationFields: string[];
  hasGeoId: boolean;
  geoIdValue?: string;
  responseStructure: string[];
  error?: string;
}

const results: TestResult[] = [];

function extractKeys(obj: any, prefix = ''): string[] {
  const keys: string[] = [];
  if (!obj || typeof obj !== 'object') return keys;
  
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    keys.push(fullKey);
    
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...extractKeys(value, fullKey));
    } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
      keys.push(...extractKeys(value[0], `${fullKey}[0]`));
    }
  }
  
  return keys;
}

function searchForLocation(obj: any, path = ''): string[] {
  const locationFields: string[] = [];
  if (!obj || typeof obj !== 'object') return locationFields;
  
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    
    // Check for location text fields
    const locationKeywords = [
      'location', 'geolocation', 'locationname', 'currentlocation', 
      'address', 'city', 'state', 'country', 'region', 'area'
    ];
    
    if (locationKeywords.some(kw => key.toLowerCase().includes(kw))) {
      if (value && typeof value === 'string' && value.trim()) {
        locationFields.push(`${currentPath}: "${value}"`);
      }
    }
    
    // Check for geo ID fields
    const geoKeywords = ['geoid', 'geo_id', 'locationid', 'location_id', 'geourn', 'geo_urn'];
    if (geoKeywords.some(kw => key.toLowerCase().includes(kw))) {
      if (value) {
        locationFields.push(`${currentPath}: ${value} (GEO ID)`);
      }
    }
    
    // Recursively search nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      locationFields.push(...searchForLocation(value, currentPath));
    } else if (Array.isArray(value) && value.length > 0) {
      if (typeof value[0] === 'object') {
        locationFields.push(...searchForLocation(value[0], `${currentPath}[0]`));
      }
    }
  }
  
  return locationFields;
}

async function testAPI(
  name: string,
  endpoint: string,
  method: 'GET' | 'POST',
  body?: any
): Promise<TestResult> {
  console.log(`\n🧪 Testing: ${name}`);
  console.log(`   ${method} ${endpoint}`);
  
  try {
    const url = `${BASE_URL}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    // Extract all keys from response
    const responseStructure = extractKeys(data);
    
    // Search for location/geo data
    const locationFields = searchForLocation(data);
    const hasGeoId = locationFields.some(f => f.includes('GEO ID'));

    const result: TestResult = {
      api: name,
      endpoint,
      method,
      request: body || {},
      status: response.status,
      response: data,
      hasLocationData: locationFields.length > 0,
      locationFields,
      hasGeoId,
      geoIdValue: locationFields.find(f => f.includes('GEO ID'))?.split(':')[1]?.trim(),
      responseStructure: responseStructure.slice(0, 50), // Limit to first 50 keys
    };

    console.log(`   ✅ Status: ${response.status}`);
    console.log(`   📍 Location Data: ${result.hasLocationData ? 'YES ✅' : 'NO ❌'}`);
    if (result.hasLocationData) {
      console.log(`   📍 Fields Found: ${result.locationFields.length}`);
      result.locationFields.slice(0, 5).forEach(field => {
        console.log(`      • ${field}`);
      });
      if (result.locationFields.length > 5) {
        console.log(`      ... and ${result.locationFields.length - 5} more`);
      }
    }
    if (result.hasGeoId) {
      console.log(`   🗺️  Geo ID Found: ${result.geoIdValue}`);
    }
    console.log(`   📋 Response Keys: ${result.responseStructure.length} total`);
    if (result.responseStructure.length > 0) {
      console.log(`      Top keys: ${result.responseStructure.slice(0, 10).join(', ')}`);
    }

    return result;
  } catch (error) {
    console.error(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {
      api: name,
      endpoint,
      method,
      request: body || {},
      status: 0,
      response: { error: error instanceof Error ? error.message : 'Unknown error' },
      hasLocationData: false,
      locationFields: [],
      hasGeoId: false,
      responseStructure: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function runTests() {
  console.log('🚀 Starting LinkedIn API Tests...\n');
  console.log(`📡 Base URL: ${BASE_URL}`);
  console.log(`🔑 API Key: ${RAPIDAPI_KEY ? RAPIDAPI_KEY.substring(0, 10) + '...' : 'NOT SET'}`);

  // Test 1: LinkedIn Data API (by username) - rockapis
  console.log('\n' + '='.repeat(80));
  results.push(await testAPI(
    'LinkedIn Data API (rockapis) - By Username',
    '/api/linkedin-profile-by-username?username=adamselipsky',
    'GET'
  ));

  // Test 2: LinkedIn Sales Navigator - Search People
  console.log('\n' + '='.repeat(80));
  results.push(await testAPI(
    'LinkedIn Sales Navigator - Search People',
    '/api/linkedin-sales-navigator',
    'POST',
    {
      endpoint: 'premium_search_person',
      location: 'Maryland',
      page: 1,
      limit: 3,
    }
  ));

  // Test 3: Fresh LinkedIn Profile Data
  console.log('\n' + '='.repeat(80));
  results.push(await testAPI(
    'Fresh LinkedIn Profile Data',
    '/api/fresh-linkedin-profile?linkedin_url=https://www.linkedin.com/in/adamselipsky/',
    'GET'
  ));

  // Test 4: Fresh LinkedIn Company Data
  console.log('\n' + '='.repeat(80));
  results.push(await testAPI(
    'Fresh LinkedIn Company Data',
    '/api/fresh-linkedin-company?linkedin_url=https://www.linkedin.com/company/apple/',
    'GET'
  ));

  // Test 5: LinkedIn Company (by domain) - rockapis
  console.log('\n' + '='.repeat(80));
  results.push(await testAPI(
    'LinkedIn Company (by domain) - rockapis',
    '/api/linkedin-company?domain=apple.com',
    'GET'
  ));

  // Test 6: LinkedIn Profile (li-data-scraper)
  console.log('\n' + '='.repeat(80));
  results.push(await testAPI(
    'LinkedIn Profile (li-data-scraper)',
    '/api/linkedin-profile?url=https://www.linkedin.com/in/adamselipsky/',
    'GET'
  ));

  // Test 7: LinkedIn Bulk Data Scraper
  console.log('\n' + '='.repeat(80));
  results.push(await testAPI(
    'LinkedIn Bulk Data Scraper',
    '/api/linkedin-scraper?url=https://www.linkedin.com/in/adamselipsky/&endpoint=profile',
    'GET'
  ));

  // Print Summary
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));
  
  const withLocation = results.filter(r => r.hasLocationData);
  const withGeoId = results.filter(r => r.hasGeoId);
  const successful = results.filter(r => r.status >= 200 && r.status < 300);
  
  console.log(`\n✅ Total APIs Tested: ${results.length}`);
  console.log(`✅ Successful Responses: ${successful.length}`);
  console.log(`📍 APIs with Location Data: ${withLocation.length}`);
  console.log(`🗺️  APIs with Geo IDs: ${withGeoId.length}`);
  
  console.log('\n📋 DETAILED RESULTS BY API:');
  console.log('='.repeat(80));
  
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. ${result.api}`);
    console.log(`   Endpoint: ${result.method} ${result.endpoint}`);
    console.log(`   Status: ${result.status} ${result.status >= 200 && result.status < 300 ? '✅' : '❌'}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    console.log(`   Location Data: ${result.hasLocationData ? '✅ YES' : '❌ NO'}`);
    if (result.hasLocationData) {
      console.log(`   Location Fields Found:`);
      result.locationFields.forEach(field => {
        console.log(`      • ${field}`);
      });
    }
    if (result.hasGeoId) {
      console.log(`   Geo ID: ${result.geoIdValue}`);
    }
    console.log(`   Response Structure: ${result.responseStructure.length} keys`);
    if (result.responseStructure.length > 0) {
      console.log(`      Sample: ${result.responseStructure.slice(0, 15).join(', ')}`);
    }
  });

  // Save detailed results to file
  const outputFile = 'linkedin-api-test-results.json';
  fs.writeFileSync(
    outputFile,
    JSON.stringify(results, null, 2)
  );
  console.log(`\n💾 Detailed results saved to: ${outputFile}`);
  
  // Create a summary markdown file
  const markdown = `# LinkedIn API Test Results

Generated: ${new Date().toISOString()}

## Summary

- **Total APIs Tested**: ${results.length}
- **Successful**: ${successful.length}
- **APIs with Location Data**: ${withLocation.length}
- **APIs with Geo IDs**: ${withGeoId.length}

## Detailed Results

${results.map((result, index) => `
### ${index + 1}. ${result.api}

**Endpoint**: \`${result.method} ${result.endpoint}\`

**Status**: ${result.status} ${result.status >= 200 && result.status < 300 ? '✅' : '❌'}

${result.error ? `**Error**: ${result.error}\n` : ''}

**Location Data**: ${result.hasLocationData ? '✅ YES' : '❌ NO'}

${result.hasLocationData ? `
**Location Fields Found**:
${result.locationFields.map(f => `- ${f}`).join('\n')}
` : ''}

${result.hasGeoId ? `**Geo ID**: ${result.geoIdValue}\n` : ''}

**Response Structure**: ${result.responseStructure.length} keys

${result.responseStructure.length > 0 ? `
**Sample Keys**:
${result.responseStructure.slice(0, 20).map(k => `- \`${k}\``).join('\n')}
` : ''}

**Full Response** (first 500 chars):
\`\`\`json
${JSON.stringify(result.response, null, 2).substring(0, 500)}...
\`\`\`
`).join('\n')}
`;

  fs.writeFileSync('linkedin-api-test-results.md', markdown);
  console.log(`📄 Summary markdown saved to: linkedin-api-test-results.md`);
}

// Run tests
runTests().catch(console.error);

