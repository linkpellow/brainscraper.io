/**
 * Test the WORKING skip-tracing API endpoint
 */

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962';

async function testWorkingSkipTracing() {
  console.log('🧪 Testing WORKING Skip-Tracing API\n');
  console.log('='.repeat(70));
  
  // Test 1: By name (GET)
  console.log('\n📋 Test 1: GET /search/byname');
  console.log('-'.repeat(70));
  
  const url1 = 'https://skip-tracing-working-api.p.rapidapi.com/search/byname?name=James%20E%20Whitsitt&page=1';
  
  try {
    const response = await fetch(url1, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'skip-tracing-working-api.p.rapidapi.com'
      }
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    const result = await response.text();
    
    if (response.ok) {
      try {
        const json = JSON.parse(result);
        console.log('\n✅ SUCCESS! Response:');
        console.log(JSON.stringify(json, null, 2).substring(0, 2000));
      } catch (e) {
        console.log('\n⚠️  Response is not JSON:');
        console.log(result.substring(0, 1000));
      }
    } else {
      console.log('\n❌ Error Response:');
      console.log(result.substring(0, 1000));
    }
  } catch (error) {
    console.error('❌ Request Failed:', error);
  }
  
  // Test 2: By name for Chris Koeneman
  console.log('\n' + '='.repeat(70));
  console.log('\n📋 Test 2: GET /search/byname (Chris Koeneman)');
  console.log('-'.repeat(70));
  
  const url2 = 'https://skip-tracing-working-api.p.rapidapi.com/search/byname?name=Chris%20Koeneman&page=1';
  
  try {
    const response = await fetch(url2, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'skip-tracing-working-api.p.rapidapi.com'
      }
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    const result = await response.text();
    
    if (response.ok) {
      try {
        const json = JSON.parse(result);
        console.log('\n✅ SUCCESS! Response:');
        console.log(JSON.stringify(json, null, 2).substring(0, 2000));
        
        // Check for phone/age data
        if (Array.isArray(json) && json.length > 0) {
          const first = json[0];
          console.log('\n📊 Extracted Data:');
          console.log(`  Phone: ${first.phone || first.phoneNumber || 'NOT FOUND'}`);
          console.log(`  Age: ${first.age || first.dateOfBirth || 'NOT FOUND'}`);
          console.log(`  Email: ${first.email || 'NOT FOUND'}`);
          console.log(`  Address: ${first.address || first.addressLine1 || 'NOT FOUND'}`);
        } else if (json.phone || json.age) {
          console.log('\n📊 Extracted Data:');
          console.log(`  Phone: ${json.phone || json.phoneNumber || 'NOT FOUND'}`);
          console.log(`  Age: ${json.age || json.dateOfBirth || 'NOT FOUND'}`);
        }
      } catch (e) {
        console.log('\n⚠️  Response is not JSON:');
        console.log(result.substring(0, 1000));
      }
    } else {
      console.log('\n❌ Error Response:');
      console.log(result.substring(0, 1000));
    }
  } catch (error) {
    console.error('❌ Request Failed:', error);
  }
  
  // Test 3: By email (if we have it)
  console.log('\n' + '='.repeat(70));
  console.log('\n📋 Test 3: GET /search/byemail');
  console.log('-'.repeat(70));
  console.log('(Skipping - no email available)');
  
  console.log('\n' + '='.repeat(70));
  console.log('\n✅ Testing Complete\n');
}

testWorkingSkipTracing().catch(console.error);
