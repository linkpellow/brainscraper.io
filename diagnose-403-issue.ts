/**
 * Diagnostic script to identify why 403 errors occur in production but not locally
 */

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962';

async function diagnose() {
  console.log('🔍 DIAGNOSTIC: 403 Error Investigation\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Test 1: Verify API key format
  console.log('\n📋 Test 1: API Key Verification');
  console.log(`   Key Length: ${RAPIDAPI_KEY.length}`);
  console.log(`   Key Prefix: ${RAPIDAPI_KEY.substring(0, 20)}...`);
  console.log(`   Key Format: ${RAPIDAPI_KEY.match(/^[a-z0-9]+$/i) ? '✅ Valid' : '❌ Invalid format'}`);
  
  // Test 2: Test a simple endpoint that should work
  console.log('\n📋 Test 2: Simple Endpoint Test (filter_company_suggestions)');
  try {
    const simpleResponse = await fetch('https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/filter_company_suggestions', {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: 'test' }),
    });
    
    const simpleResult = await simpleResponse.text();
    console.log(`   Status: ${simpleResponse.status}`);
    console.log(`   OK: ${simpleResponse.ok}`);
    if (simpleResponse.ok) {
      console.log('   ✅ Simple endpoint works - API key is valid');
    } else {
      console.log(`   ❌ Simple endpoint failed: ${simpleResult.substring(0, 200)}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Test 3: Test json_to_url (should work)
  console.log('\n📋 Test 3: json_to_url Endpoint');
  try {
    const urlResponse = await fetch('https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/json_to_url', {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filters: [
          {
            type: 'REGION',
            values: [{ id: '105763813', text: 'Colorado', selectionType: 'INCLUDED' }],
          },
          {
            type: 'RECENTLY_CHANGED_JOBS',
            values: [{ id: 'RPC', text: 'Changed jobs', selectionType: 'INCLUDED' }],
          },
        ],
        keywords: '',
      }),
    });
    
    const urlResult = await urlResponse.text();
    console.log(`   Status: ${urlResponse.status}`);
    console.log(`   OK: ${urlResponse.ok}`);
    if (urlResponse.ok) {
      try {
        const urlData = JSON.parse(urlResult);
        console.log(`   ✅ json_to_url works - Generated URL: ${(urlData.url || urlData.data || '').substring(0, 100)}...`);
      } catch {
        console.log(`   ⚠️  Response not JSON: ${urlResult.substring(0, 200)}`);
      }
    } else {
      console.log(`   ❌ json_to_url failed: ${urlResult.substring(0, 200)}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Test 4: Test premium_search_person with minimal filters
  console.log('\n📋 Test 4: premium_search_person (Minimal - Just Keywords)');
  try {
    const minimalResponse = await fetch('https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/premium_search_person', {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        account_number: 1,
        page: 1,
        keywords: 'test',
      }),
    });
    
    const minimalResult = await minimalResponse.text();
    let minimalData;
    try {
      minimalData = JSON.parse(minimalResult);
    } catch {
      minimalData = { raw: minimalResult };
    }
    
    console.log(`   Status: ${minimalResponse.status}`);
    console.log(`   OK: ${minimalResponse.ok}`);
    if (minimalResponse.ok && minimalData.success !== false) {
      console.log('   ✅ Minimal search works');
    } else {
      console.log(`   ❌ Minimal search failed:`);
      console.log(`      ${JSON.stringify(minimalData, null, 2).substring(0, 300)}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Test 5: Test premium_search_person with RECENTLY_CHANGED_JOBS filter
  console.log('\n📋 Test 5: premium_search_person (With RECENTLY_CHANGED_JOBS Filter)');
  try {
    const filterResponse = await fetch('https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/premium_search_person', {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        account_number: 1,
        page: 1,
        filters: [
          {
            type: 'RECENTLY_CHANGED_JOBS',
            values: [{ id: 'RPC', text: 'Changed jobs', selectionType: 'INCLUDED' }],
          },
        ],
        keywords: '',
      }),
    });
    
    const filterResult = await filterResponse.text();
    let filterData;
    try {
      filterData = JSON.parse(filterResult);
    } catch {
      filterData = { raw: filterResult };
    }
    
    console.log(`   Status: ${filterResponse.status}`);
    console.log(`   OK: ${filterResponse.ok}`);
    console.log(`   Request Body:`, JSON.stringify({
      account_number: 1,
      page: 1,
      filters: [
        {
          type: 'RECENTLY_CHANGED_JOBS',
          values: [{ id: 'RPC', text: 'Changed jobs', selectionType: 'INCLUDED' }],
        },
      ],
      keywords: '',
    }, null, 2));
    
    if (filterResponse.ok && filterData.success !== false) {
      console.log('   ✅ RECENTLY_CHANGED_JOBS filter works');
    } else {
      console.log(`   ❌ RECENTLY_CHANGED_JOBS filter failed:`);
      console.log(`      ${JSON.stringify(filterData, null, 2).substring(0, 500)}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Test 6: Check headers being sent
  console.log('\n📋 Test 6: Request Headers Verification');
  console.log('   Headers being sent:');
  console.log(`     x-rapidapi-key: ${RAPIDAPI_KEY.substring(0, 20)}...`);
  console.log(`     x-rapidapi-host: realtime-linkedin-sales-navigator-data.p.rapidapi.com`);
  console.log(`     Content-Type: application/json`);
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n💡 Next Steps:');
  console.log('   1. Compare results between local and production');
  console.log('   2. Check if API key in production matches local');
  console.log('   3. Verify RapidAPI subscription status');
  console.log('   4. Check production logs for exact error messages');
}

diagnose().catch(console.error);
