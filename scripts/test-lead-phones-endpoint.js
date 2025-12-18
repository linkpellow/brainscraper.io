/**
 * Test Lead Phones Endpoint
 * 
 * Run this in browser console on app.tampausha.com
 * 
 * This will test the /leads/{leadId}/phones endpoint to see if it contains DNC status
 */

async function testLeadPhonesEndpoint() {
  console.log('🔍 Testing /leads/{leadId}/phones endpoint...\n');
  
  // Get Cognito token from localStorage
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
    console.error('❌ Could not find Cognito token in localStorage');
    console.log('💡 Make sure you are logged into app.tampausha.com');
    return;
  }
  
  console.log('✅ Found Cognito token\n');
  
  // Get a lead ID from the current page
  // Try to find lead ID from URL or page data
  const urlParams = new URLSearchParams(window.location.search);
  let leadId = null;
  
  // Check if we're on a lead detail page
  const pathMatch = window.location.pathname.match(/\/leads\/([^\/]+)/);
  if (pathMatch) {
    leadId = pathMatch[1];
    console.log(`📋 Found lead ID from URL: ${leadId}\n`);
  } else {
    // Try to get from page data
    console.log('⚠️  Not on a lead detail page');
    console.log('💡 Please navigate to a lead detail page, or provide a lead ID\n');
    
    // Check if there are leads in the current view
    const leadElements = document.querySelectorAll('[data-lead-id], [data-id]');
    if (leadElements.length > 0) {
      console.log(`💡 Found ${leadElements.length} potential lead elements on page`);
      console.log('💡 Click on a lead to open it, then run this script again\n');
    }
    
    // Prompt for lead ID
    const userLeadId = prompt('Enter a lead ID to test (or cancel to skip):');
    if (userLeadId) {
      leadId = userLeadId;
    } else {
      console.log('❌ No lead ID provided');
      return;
    }
  }
  
  // Test the endpoint
  const endpoint = `https://optic-prod-api.leadarena.com/leads/${leadId}/phones`;
  console.log(`🔗 Testing endpoint: ${endpoint}\n`);
  
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cognitoToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-domain': 'app.tampausha.com',
        'id': 'us-east-1:cc7498e7-d8be-c607-2bda-cea2096bba07',
        'x-user-data': JSON.stringify({
          agentId: 'us-east-1:cc7498e7-d8be-c607-2bda-cea2096bba07',
          networkId: 'd0085065-49f4-4ded-b244-23b063e31405'
        })
      }
    });
    
    console.log(`📊 Response Status: ${response.status} ${response.statusText}\n`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Request failed: ${errorText}`);
      return;
    }
    
    const data = await response.json();
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 RESPONSE DATA:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    if (Array.isArray(data)) {
      console.log(`✅ Response is an array with ${data.length} items\n`);
      
      if (data.length > 0) {
        const firstItem = data[0];
        console.log('📋 First item structure:');
        console.log(`   Keys: ${Object.keys(firstItem).join(', ')}\n`);
        console.log('📋 First item data:');
        console.log(JSON.stringify(firstItem, null, 2));
        console.log('');
        
        // Check for DNC-related fields
        const itemStr = JSON.stringify(firstItem).toLowerCase();
        const hasDnc = itemStr.includes('dnc') || 
                      itemStr.includes('donotcall') || 
                      itemStr.includes('cancontact') ||
                      itemStr.includes('contactstatus');
        
        if (hasDnc) {
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('✅ DNC STATUS FOUND IN RESPONSE!');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
          
          // Extract DNC fields
          Object.keys(firstItem).forEach(key => {
            const keyLower = key.toLowerCase();
            if (keyLower.includes('dnc') || 
                keyLower.includes('donotcall') || 
                keyLower.includes('contact')) {
              console.log(`   ${key}: ${JSON.stringify(firstItem[key])}`);
            }
          });
        } else {
          console.log('⚠️  No DNC-related fields found in response');
          console.log('💡 DNC status may be in a different endpoint\n');
        }
      }
    } else if (typeof data === 'object') {
      console.log('✅ Response is an object\n');
      console.log(`   Keys: ${Object.keys(data).join(', ')}\n`);
      console.log('📋 Full response:');
      console.log(JSON.stringify(data, null, 2));
      console.log('');
      
      // Check for DNC fields
      const dataStr = JSON.stringify(data).toLowerCase();
      const hasDnc = dataStr.includes('dnc') || 
                    dataStr.includes('donotcall') || 
                    dataStr.includes('cancontact') ||
                    dataStr.includes('contactstatus');
      
      if (hasDnc) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ DNC STATUS FOUND IN RESPONSE!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      }
    } else {
      console.log('⚠️  Unexpected response format:', typeof data);
      console.log('📋 Response:', data);
    }
    
    console.log('\n💡 Copy this response:');
    console.log(JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('❌ Error testing endpoint:', error);
  }
}

// Run the test
testLeadPhonesEndpoint();
