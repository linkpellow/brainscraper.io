/**
 * Test the CORRECT person details endpoint: /search/detailsbyID
 */

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962';

async function testDetailsByID() {
  console.log('🧪 Testing /search/detailsbyID endpoint\n');
  console.log('='.repeat(70));
  
  // Test with Chris Koeneman's Person ID
  const personIds = [
    'pu0uln24l06264u4l9u0', // Chris Koeneman (from our search)
    'p4r4020l80998ll84l64', // From user's example
  ];
  
  for (const peoId of personIds) {
    const url = `https://skip-tracing-working-api.p.rapidapi.com/search/detailsbyID?peo_id=${encodeURIComponent(peoId)}`;
    
    console.log(`\nTesting Person ID: ${peoId}`);
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
          console.log(`\n✅ SUCCESS! Response keys:`, Object.keys(json));
          console.log(`\nFull response:`, JSON.stringify(json, null, 2));
          
          // Check for phone in response
          function findPhone(obj: any, path = ''): string | null {
            if (!obj || typeof obj !== 'object') return null;
            
            const phoneFields = ['phone', 'phoneNumber', 'Phone', 'phone_number', 'PhoneNumber', 'mobile', 'Mobile', 'cell', 'Cell', 'Phone Number'];
            
            for (const [key, value] of Object.entries(obj)) {
              const fullPath = path ? `${path}.${key}` : key;
              
              if (phoneFields.includes(key) && value && typeof value === 'string') {
                const cleaned = value.replace(/[^\d+]/g, '');
                if (cleaned.length >= 10) {
                  console.log(`\n🎉 FOUND PHONE at ${fullPath}: ${value} (cleaned: ${cleaned})`);
                  return cleaned;
                }
              }
              
              if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                const found = findPhone(value, fullPath);
                if (found) return found;
              }
            }
            
            return null;
          }
          
          const phone = findPhone(json);
          
          if (!phone) {
            console.log(`\n⚠️  No phone number found in response`);
            console.log(`\nChecking all string values for phone-like patterns...`);
            
            function checkAllStrings(obj: any, path = ''): void {
              if (!obj || typeof obj !== 'object') return;
              
              for (const [key, value] of Object.entries(obj)) {
                const fullPath = path ? `${path}.${key}` : key;
                
                if (typeof value === 'string' && value.length > 0) {
                  const cleaned = value.replace(/[^\d+]/g, '');
                  if (cleaned.length >= 10 && cleaned.length <= 15) {
                    console.log(`  Potential phone at ${fullPath}: "${value}"`);
                  }
                }
                
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                  checkAllStrings(value, fullPath);
                }
              }
            }
            
            checkAllStrings(json);
          }
        } catch (e) {
          console.log(`Response (text):`, result.substring(0, 1000));
        }
      } else {
        const errorText = await response.text();
        console.log(`❌ Error: ${errorText}`);
      }
    } catch (error) {
      console.error(`❌ Request failed:`, error);
    }
    
    console.log('\n' + '='.repeat(70));
    
    // Small delay
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

testDetailsByID().catch(console.error);
