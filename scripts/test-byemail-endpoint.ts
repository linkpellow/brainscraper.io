/**
 * Test /search/byemail endpoint to see if it returns phone numbers
 */

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962';

async function testByEmail() {
  console.log('🧪 Testing /search/byemail endpoint\n');
  console.log('='.repeat(70));
  
  // Test with a common email pattern
  const testEmails = [
    'test@example.com', // Generic test
  ];
  
  for (const email of testEmails) {
    const url = `https://skip-tracing-working-api.p.rapidapi.com/search/byemail?email=${encodeURIComponent(email)}`;
    
    console.log(`\nTesting email: ${email}`);
    console.log(`URL: ${url}`);
    
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
          console.log(`\n✅ Response keys:`, Object.keys(json));
          console.log(`\nFull response:`, JSON.stringify(json, null, 2));
          
          // Check for phone in response
          const phoneFields = ['phone', 'phoneNumber', 'Phone', 'phone_number', 'PhoneNumber', 'mobile', 'Mobile'];
          let foundPhone = false;
          
          function checkForPhone(obj: any, path = ''): void {
            if (!obj || typeof obj !== 'object') return;
            
            for (const [key, value] of Object.entries(obj)) {
              const fullPath = path ? `${path}.${key}` : key;
              
              if (phoneFields.includes(key) && value) {
                console.log(`\n🎉 FOUND PHONE at ${fullPath}: ${value}`);
                foundPhone = true;
              }
              
              if (typeof value === 'object' && value !== null) {
                checkForPhone(value, fullPath);
              }
            }
          }
          
          checkForPhone(json);
          
          if (!foundPhone) {
            console.log(`\n❌ No phone number found in response`);
          }
        } catch (e) {
          console.log(`Response (text):`, result.substring(0, 1000));
        }
      } else {
        const errorText = await response.text();
        console.log(`❌ Error: ${errorText.substring(0, 500)}`);
      }
    } catch (error) {
      console.error(`❌ Request failed:`, error);
    }
    
    console.log('\n' + '='.repeat(70));
  }
  
  console.log('\n📋 SUMMARY:\n');
  console.log('The skip-tracing-working-api has these endpoints:');
  console.log('1. /search/byname - Returns Person IDs, Age, Location (NO PHONE)');
  console.log('2. /search/byemail - Need to test if returns phone');
  console.log('3. /search/byphone - Reverse lookup (phone → person info)');
  console.log('4. /person_details_by_ID - DOES NOT EXIST (404)');
  console.log('\n⚠️  LIMITATION: This API does NOT provide phone discovery.');
  console.log('   It only provides Person IDs that link to TruePeopleSearch.');
  console.log('   To get phone numbers, you need a different skip-tracing API.');
}

testByEmail().catch(console.error);
