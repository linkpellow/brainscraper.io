/**
 * Test different person details endpoint variations
 */

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962';
const personId = 'pu0uln24l06264u4l9u0'; // Chris Koeneman's Person ID

const endpointVariations = [
  'person_details_by_ID',
  'person-details-by-id',
  'personDetailsByID',
  'person_details',
  'person-details',
  'personDetails',
  'get_person_details',
  'get-person-details',
];

async function testEndpoints() {
  console.log('🧪 Testing Person Details Endpoint Variations\n');
  console.log('='.repeat(70));
  console.log(`Person ID: ${personId}\n`);
  
  for (const endpoint of endpointVariations) {
    const url = `https://skip-tracing-working-api.p.rapidapi.com/${endpoint}?person_id=${encodeURIComponent(personId)}`;
    
    console.log(`Testing: ${endpoint}`);
    console.log(`URL: ${url.substring(0, 80)}...`);
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-rapidapi-key': RAPIDAPI_KEY,
          'x-rapidapi-host': 'skip-tracing-working-api.p.rapidapi.com',
        },
      });
      
      console.log(`Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const result = await response.text();
        try {
          const json = JSON.parse(result);
          console.log(`✅ SUCCESS! Response keys:`, Object.keys(json));
          console.log(`Response preview:`, JSON.stringify(json).substring(0, 500));
          
          // Check for phone
          const phone = json.phone || json.phoneNumber || json.Phone || json.phone_number;
          if (phone) {
            console.log(`\n🎉 FOUND PHONE: ${phone}`);
          }
        } catch (e) {
          console.log(`Response (text):`, result.substring(0, 500));
        }
        console.log('\n' + '='.repeat(70) + '\n');
        break; // Found working endpoint
      } else {
        const errorText = await response.text();
        console.log(`❌ Failed: ${errorText.substring(0, 200)}\n`);
      }
    } catch (error) {
      console.error(`❌ Error:`, error instanceof Error ? error.message : error);
      console.log('');
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Also check if phone is in the initial response
  console.log('\n📋 Checking if phone is in initial search response...\n');
  const searchUrl = 'https://skip-tracing-working-api.p.rapidapi.com/search/byname?name=Chris%20Koeneman&page=1';
  
  try {
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'skip-tracing-working-api.p.rapidapi.com',
      },
    });
    
    if (response.ok) {
      const result = await response.text();
      const json = JSON.parse(result);
      
      if (json.PeopleDetails && json.PeopleDetails.length > 0) {
        const firstPerson = json.PeopleDetails[0];
        console.log('First person keys:', Object.keys(firstPerson));
        console.log('First person data:', JSON.stringify(firstPerson, null, 2));
        
        // Check all possible phone fields
        const phoneFields = ['phone', 'phoneNumber', 'Phone', 'phone_number', 'PhoneNumber', 'mobile', 'Mobile', 'cell', 'Cell'];
        for (const field of phoneFields) {
          if (firstPerson[field]) {
            console.log(`\n🎉 FOUND PHONE in field "${field}": ${firstPerson[field]}`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error checking search response:', error);
  }
}

testEndpoints().catch(console.error);
