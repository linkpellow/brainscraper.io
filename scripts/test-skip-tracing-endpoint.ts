/**
 * Test skip-tracing API endpoint directly
 */

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962';

async function testSkipTracingEndpoint() {
  console.log('🧪 Testing Skip-Tracing API Endpoint\n');
  console.log('='.repeat(70));
  
  const url = 'https://skip-tracing-api.p.rapidapi.com/search/by-name-and-address';
  
  const testCases = [
    {
      name: 'Test 1: John Smith, Los Angeles',
      body: {
        firstName: 'John',
        lastName: 'Smith',
        addressLine2: 'Los Angeles, CA'
      }
    },
    {
      name: 'Test 2: Chris Koeneman, Baltimore',
      body: {
        firstName: 'Chris',
        lastName: 'Koeneman',
        addressLine2: 'Baltimore, Maryland, 21201'
      }
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n${testCase.name}`);
    console.log('-'.repeat(70));
    console.log('Request:', JSON.stringify(testCase.body, null, 2));
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'x-rapidapi-key': RAPIDAPI_KEY,
          'x-rapidapi-host': 'skip-tracing-api.p.rapidapi.com',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testCase.body) // FIX: Must stringify!
      });
      
      console.log(`\nResponse Status: ${response.status} ${response.statusText}`);
      console.log(`Response Headers:`, Object.fromEntries(response.headers.entries()));
      
      const result = await response.text();
      
      console.log(`\nResponse Body (first 1000 chars):`);
      console.log(result.substring(0, 1000));
      
      if (response.ok) {
        try {
          const json = JSON.parse(result);
          console.log(`\n✅ Parsed JSON Response:`);
          console.log(JSON.stringify(json, null, 2).substring(0, 2000));
        } catch (e) {
          console.log(`\n⚠️  Response is not valid JSON`);
        }
      } else {
        console.log(`\n❌ API Error: ${response.status}`);
        if (result.includes('Cloudflare')) {
          console.log(`\n⚠️  BLOCKED BY CLOUDFLARE - This is an API provider issue, not a code issue`);
        }
      }
      
    } catch (error) {
      console.error(`\n❌ Request Failed:`, error);
      if (error instanceof Error) {
        console.error(`   Message: ${error.message}`);
      }
    }
    
    console.log('\n' + '='.repeat(70));
    
    // Wait a bit between requests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

testSkipTracingEndpoint().catch(console.error);
