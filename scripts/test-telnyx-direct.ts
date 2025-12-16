/**
 * Test Telnyx API directly to verify key works
 */

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

async function testTelnyx() {
  console.log('🧪 Testing Telnyx API Directly\n');
  console.log('='.repeat(70));
  
  if (!TELNYX_API_KEY) {
    console.log('❌ TELNYX_API_KEY not found in environment');
    console.log('   Make sure it\'s set in .env.local and server is restarted');
    return;
  }
  
  console.log(`✅ API Key found: ${TELNYX_API_KEY.substring(0, 10)}...`);
  console.log(`   Key length: ${TELNYX_API_KEY.length} characters\n`);
  
  // Test with Chris Koeneman's phone
  const phone = '6145821526';
  const cleanedPhone = '+1' + phone;
  
  console.log(`Testing phone: ${phone} (formatted: ${cleanedPhone})\n`);
  
  // Per Telnyx docs: type can only be "carrier" or "caller-name"
  // Portability data is included automatically with type=carrier
  const url = `https://api.telnyx.com/v2/number_lookup/${encodeURIComponent(cleanedPhone)}?type=carrier`;
  
  console.log(`URL: ${url}\n`);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    
    console.log(`Status: ${response.status} ${response.statusText}\n`);
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ SUCCESS! Response:');
      console.log(JSON.stringify(result, null, 2));
      
      // Extract key fields
      if (result.data) {
        console.log('\n📊 Extracted Data:');
        console.log(`  Line Type: ${result.data.portability?.line_type || 'NOT FOUND'}`);
        console.log(`  Carrier: ${result.data.carrier?.name || 'NOT FOUND'}`);
        console.log(`  Carrier Type: ${result.data.carrier?.type || 'NOT FOUND'}`);
        console.log(`  Normalized Carrier: ${result.data.carrier?.normalized_carrier || 'NOT FOUND'}`);
      }
    } else {
      const errorText = await response.text();
      console.log('❌ Error Response:');
      console.log(errorText);
      
      try {
        const errorJson = JSON.parse(errorText);
        console.log('\nParsed Error:');
        console.log(JSON.stringify(errorJson, null, 2));
      } catch (e) {
        // Not JSON
      }
    }
  } catch (error) {
    console.error('❌ Request Failed:', error);
  }
  
  console.log('\n' + '='.repeat(70));
}

testTelnyx().catch(console.error);
