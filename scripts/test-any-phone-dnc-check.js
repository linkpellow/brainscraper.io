/**
 * Test DNC Check for Any Phone Number
 * 
 * Run this in browser console on app.tampausha.com
 * 
 * This tests if we can check DNC status for ANY phone number,
 * not just phones that are already in a lead.
 * 
 * Tests:
 * 1. Search for lead by phone number
 * 2. Create a lead with phone number, then check phones
 * 3. Direct phone DNC check endpoint (if exists)
 */

async function testAnyPhoneDncCheck(testPhone = '2143493972') {
  console.log('🔍 Testing DNC Check for Any Phone Number\n');
  console.log(`📞 Test Phone: ${testPhone}\n`);
  
  // Get Cognito token
  let cognitoToken = null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes('CognitoIdentityServiceProvider') && key.includes('idToken')) {
        cognitoToken = localStorage.getItem(key);
        break;
      }
    }
  } catch (e) {
    console.error('❌ Could not access localStorage:', e);
    return;
  }
  
  if (!cognitoToken) {
    console.error('❌ Could not find Cognito token');
    return;
  }
  
  const LEADARENA_API_BASE = 'https://optic-prod-api.leadarena.com';
  const headers = {
    'Authorization': `Bearer ${cognitoToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'x-domain': 'app.tampausha.com',
    'id': 'us-east-1:cc7498e7-d8be-c607-2bda-cea2096bba07',
    'x-user-data': JSON.stringify({
      agentId: 'us-east-1:cc7498e7-d8be-c607-2bda-cea2096bba07',
      networkId: 'd0085065-49f4-4ded-b244-23b063e31405'
    })
  };
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 1: Search for Lead by Phone Number');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Test 1: Search for lead by phone
  const searchEndpoints = [
    `${LEADARENA_API_BASE}/leads/search?phone=${testPhone}`,
    `${LEADARENA_API_BASE}/leads?phone=${testPhone}`,
    `${LEADARENA_API_BASE}/search/leads?phone=${testPhone}`,
    `${LEADARENA_API_BASE}/leads/search?phoneNumber=${testPhone}`,
  ];
  
  let foundLeadId = null;
  
  for (const searchUrl of searchEndpoints) {
    try {
      console.log(`🔍 Trying: ${searchUrl}`);
      const response = await fetch(searchUrl, { method: 'GET', headers });
      console.log(`   Status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`   ✅ Success! Response:`, data);
        
        // Try to extract lead ID
        if (Array.isArray(data) && data.length > 0) {
          foundLeadId = data[0].id || data[0].leadId;
          console.log(`   ✅ Found lead ID: ${foundLeadId}`);
        } else if (data.id || data.leadId) {
          foundLeadId = data.id || data.leadId;
          console.log(`   ✅ Found lead ID: ${foundLeadId}`);
        }
        break;
      } else if (response.status !== 404) {
        const errorText = await response.text();
        console.log(`   ⚠️  Error: ${errorText.substring(0, 200)}`);
      }
    } catch (e) {
      console.log(`   ❌ Error: ${e.message}`);
    }
  }
  
  if (!foundLeadId) {
    console.log('\n⚠️  Could not find existing lead with this phone number\n');
  } else {
    console.log('\n✅ Found existing lead, testing phones endpoint...\n');
    const phonesUrl = `${LEADARENA_API_BASE}/leads/${foundLeadId}/phones`;
    try {
      const phonesResponse = await fetch(phonesUrl, { method: 'GET', headers });
      if (phonesResponse.ok) {
        const phonesData = await phonesResponse.json();
        const phoneData = phonesData.find(function(p) {
          return p.phone === testPhone || (p.phone && p.phone.replace(/\D/g, '') === testPhone.replace(/\D/g, ''));
        });
        if (phoneData) {
          console.log('✅ DNC Status from existing lead:');
          console.log(`   isOnDnc: ${phoneData.isOnDnc}`);
          console.log(`   dncCanContact: ${phoneData.dncCanContact}`);
          console.log(`   dncReason: ${phoneData.dncReason}`);
          return { success: true, method: 'existing_lead', data: phoneData };
        }
      }
    } catch (e) {
      console.log(`   ❌ Error: ${e.message}`);
    }
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 2: Create Lead with Phone, Then Check Phones');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Test 2: Try to create a lead with this phone number
  const createEndpoints = [
    `${LEADARENA_API_BASE}/leads`,
    `${LEADARENA_API_BASE}/leads/create`,
  ];
  
  let createdLeadId = null;
  
  for (const createUrl of createEndpoints) {
    try {
      console.log(`🔍 Trying to create lead: ${createUrl}`);
      const createBody = {
        phone: testPhone,
        phoneNumber: testPhone,
        phones: [{ phone: testPhone, isPrimary: true }]
      };
      
      const response = await fetch(createUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(createBody)
      });
      
      console.log(`   Status: ${response.status}`);
      
      if (response.ok || response.status === 201) {
        const data = await response.json();
        console.log(`   ✅ Lead created! Response:`, data);
        createdLeadId = data.id || data.leadId;
        if (createdLeadId) {
          console.log(`   ✅ Created lead ID: ${createdLeadId}`);
          break;
        }
      } else {
        const errorText = await response.text();
        console.log(`   ⚠️  Error: ${errorText.substring(0, 200)}`);
      }
    } catch (e) {
      console.log(`   ❌ Error: ${e.message}`);
    }
  }
  
  if (createdLeadId) {
    console.log('\n✅ Lead created, checking phones...\n');
    // Wait a moment for lead to be processed
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const phonesUrl = `${LEADARENA_API_BASE}/leads/${createdLeadId}/phones`;
    try {
      const phonesResponse = await fetch(phonesUrl, { method: 'GET', headers });
      if (phonesResponse.ok) {
        const phonesData = await phonesResponse.json();
        console.log('✅ Phones response:', phonesData);
        
        const phoneData = phonesData.find(function(p) {
          return p.phone === testPhone || (p.phone && p.phone.replace(/\D/g, '') === testPhone.replace(/\D/g, ''));
        });
        
        if (phoneData) {
          console.log('\n✅ DNC Status from created lead:');
          console.log(`   isOnDnc: ${phoneData.isOnDnc}`);
          console.log(`   dncCanContact: ${phoneData.dncCanContact}`);
          console.log(`   dncReason: ${phoneData.dncReason}`);
          return { success: true, method: 'create_lead', data: phoneData };
        } else {
          console.log('⚠️  Phone not found in response');
        }
      }
    } catch (e) {
      console.log(`   ❌ Error: ${e.message}`);
    }
  } else {
    console.log('\n⚠️  Could not create lead\n');
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 3: Direct Phone DNC Check Endpoints');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Test 3: Try direct phone DNC check endpoints
  const directEndpoints = [
    `${LEADARENA_API_BASE}/phones/${testPhone}/dnc`,
    `${LEADARENA_API_BASE}/phones/${testPhone}/check`,
    `${LEADARENA_API_BASE}/phones/dnc?phone=${testPhone}`,
    `${LEADARENA_API_BASE}/phones/check?phone=${testPhone}`,
    `${LEADARENA_API_BASE}/dnc/check?phone=${testPhone}`,
    `${LEADARENA_API_BASE}/dnc/phones/${testPhone}`,
  ];
  
  for (const endpoint of directEndpoints) {
    try {
      console.log(`🔍 Trying: ${endpoint}`);
      const response = await fetch(endpoint, { method: 'GET', headers });
      console.log(`   Status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`   ✅ Success! Response:`, data);
        return { success: true, method: 'direct_endpoint', endpoint, data };
      } else if (response.status !== 404) {
        const errorText = await response.text();
        console.log(`   ⚠️  Error: ${errorText.substring(0, 200)}`);
      }
    } catch (e) {
      console.log(`   ❌ Error: ${e.message}`);
    }
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('❌ Could not find a way to check DNC for arbitrary phone numbers');
  console.log('⚠️  The /leads/{leadId}/phones endpoint requires an existing lead ID');
  console.log('\n💡 Options:');
  console.log('   1. Search for lead by phone (if search endpoint exists)');
  console.log('   2. Create a lead with phone, then check phones');
  console.log('   3. Use USHA DNC API as fallback (requires token exchange)');
  console.log('');
  
  return { success: false, message: 'No direct method found' };
}

// Run test
console.log('💡 Usage: testAnyPhoneDncCheck("2143493972")');
console.log('💡 Or use default: testAnyPhoneDncCheck()\n');

// Auto-run with default phone
testAnyPhoneDncCheck();
