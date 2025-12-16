/**
 * Test the /search/detailsbyID endpoint to see phone structure
 */

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962';

async function testDetailsByID() {
  console.log('🧪 Testing /search/detailsbyID endpoint\n');
  console.log('='.repeat(70));
  
  // Use a real Person ID from the byname search
  const personId = 'p4r4020l80998ll84l64'; // James E Whitsitt Jr
  const url = `https://skip-tracing-working-api.p.rapidapi.com/search/detailsbyID?peo_id=${personId}`;
  
  console.log(`Person ID: ${personId}`);
  console.log(`URL: ${url}\n`);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'skip-tracing-working-api.p.rapidapi.com',
      },
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    const result = await response.text();
    
    if (response.ok) {
      try {
        const json = JSON.parse(result);
        console.log('\n✅ SUCCESS! Full Response Structure:');
        console.log(JSON.stringify(json, null, 2));
        
        // Look for phone fields
        console.log('\n📞 Searching for phone fields...');
        const searchForPhone = (obj: any, path = ''): void => {
          if (typeof obj !== 'object' || obj === null) return;
          
          for (const [key, value] of Object.entries(obj)) {
            const currentPath = path ? `${path}.${key}` : key;
            
            if (typeof key === 'string' && 
                (key.toLowerCase().includes('phone') || 
                 key.toLowerCase().includes('telephone') ||
                 key.toLowerCase().includes('mobile') ||
                 key.toLowerCase().includes('cell'))) {
              console.log(`  🎯 Found phone field: ${currentPath} = ${JSON.stringify(value)}`);
            }
            
            if (Array.isArray(value)) {
              value.forEach((item, idx) => {
                if (typeof item === 'object') {
                  searchForPhone(item, `${currentPath}[${idx}]`);
                } else if (typeof item === 'string' && /[\d\-\(\)\s]{10,}/.test(item)) {
                  console.log(`  🎯 Found phone-like value: ${currentPath}[${idx}] = ${item}`);
                }
              });
            } else if (typeof value === 'object' && value !== null) {
              searchForPhone(value, currentPath);
            } else if (typeof value === 'string' && /[\d\-\(\)\s]{10,}/.test(value)) {
              console.log(`  🎯 Found phone-like value: ${currentPath} = ${value}`);
            }
          }
        };
        
        searchForPhone(json);
        
        // Look for age/DOB fields
        console.log('\n🎂 Searching for age/DOB fields...');
        const searchForAge = (obj: any, path = ''): void => {
          if (typeof obj !== 'object' || obj === null) return;
          
          for (const [key, value] of Object.entries(obj)) {
            const currentPath = path ? `${path}.${key}` : key;
            
            if (typeof key === 'string' && 
                (key.toLowerCase().includes('age') || 
                 key.toLowerCase().includes('dob') ||
                 key.toLowerCase().includes('birth'))) {
              console.log(`  🎯 Found age/DOB field: ${currentPath} = ${JSON.stringify(value)}`);
            }
            
            if (Array.isArray(value)) {
              value.forEach((item, idx) => {
                if (typeof item === 'object') {
                  searchForAge(item, `${currentPath}[${idx}]`);
                }
              });
            } else if (typeof value === 'object' && value !== null) {
              searchForAge(value, currentPath);
            }
          }
        };
        
        searchForAge(json);
        
      } catch (e) {
        console.log('\n⚠️  Response is not JSON:');
        console.log(result.substring(0, 2000));
      }
    } else {
      console.log('\n❌ Error Response:');
      console.log(result.substring(0, 1000));
    }
  } catch (error) {
    console.error('❌ Request Failed:', error);
  }
}

testDetailsByID().catch(console.error);
