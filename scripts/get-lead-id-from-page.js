/**
 * Get Lead ID from TampaUSHA Page
 * 
 * Run this in browser console on app.tampausha.com
 * 
 * This will find lead IDs from the current page
 */

function getLeadIdsFromPage() {
  console.log('🔍 Searching for lead IDs on current page...\n');
  
  const leadIds = new Set();
  
  // Method 1: Check URL if on lead detail page
  const pathMatch = window.location.pathname.match(/\/leads\/([^\/]+)/);
  if (pathMatch) {
    leadIds.add(pathMatch[1]);
    console.log(`✅ Found lead ID from URL: ${pathMatch[1]}`);
  }
  
  // Method 2: Check data attributes
  const elementsWithLeadId = document.querySelectorAll('[data-lead-id], [data-id], [data-leadid]');
  elementsWithLeadId.forEach(el => {
    const id = el.getAttribute('data-lead-id') || 
               el.getAttribute('data-id') || 
               el.getAttribute('data-leadid');
    if (id && id.length > 10) { // Lead IDs are usually UUIDs
      leadIds.add(id);
    }
  });
  
  // Method 3: Check hrefs
  const links = document.querySelectorAll('a[href*="/leads/"]');
  links.forEach(link => {
    const hrefMatch = link.href.match(/\/leads\/([^\/\?]+)/);
    if (hrefMatch) {
      leadIds.add(hrefMatch[1]);
    }
  });
  
  // Method 4: Check React/Vue data (if available)
  try {
    // Look for React fiber or component data
    const reactRoot = document.querySelector('#root, [data-reactroot]');
    if (reactRoot) {
      // Try to find lead data in window or React dev tools
      if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        console.log('💡 React DevTools detected - you can inspect components for lead data');
      }
    }
  } catch (e) {
    // Ignore
  }
  
  // Method 5: Check localStorage/sessionStorage for recent leads
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.includes('lead') || key.includes('selected')) {
        try {
          const value = localStorage.getItem(key);
          if (value) {
            const jsonMatch = value.match(/"id":\s*"([^"]+)"/);
            if (jsonMatch) {
              const id = jsonMatch[1];
              if (id.length > 10) {
                leadIds.add(id);
              }
            }
          }
        } catch (e) {
          // Not JSON
        }
      }
    });
  } catch (e) {
    // Can't access storage
  }
  
  // Method 6: Check network requests (if capture script is running)
  if (window.__dncScrubCapture) {
    window.__dncScrubCapture.allLeadArenaRequests.forEach(req => {
      const urlMatch = req.url.match(/\/leads\/([^\/\?]+)/);
      if (urlMatch) {
        leadIds.add(urlMatch[1]);
      }
    });
  }
  
  const uniqueIds = Array.from(leadIds);
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 FOUND LEAD IDs:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (uniqueIds.length === 0) {
    console.log('❌ No lead IDs found on current page');
    console.log('\n💡 Try one of these:');
    console.log('   1. Navigate to a lead detail page (click on a lead)');
    console.log('   2. Look at the URL - it should contain /leads/{leadId}');
    console.log('   3. Click on any lead in the list, then run this script again\n');
    return null;
  }
  
  uniqueIds.forEach((id, i) => {
    console.log(`${i + 1}. ${id}`);
  });
  
  console.log('\n💡 To test with the first lead ID, run:');
  console.log(`   testLeadPhonesEndpoint('${uniqueIds[0]}')`);
  console.log('\n💡 Or manually copy a lead ID and use it in the test script\n');
  
  return uniqueIds;
}

// Also create a helper to test with a specific lead ID
window.testLeadPhonesEndpoint = async function(leadId) {
  if (!leadId) {
    const ids = getLeadIdsFromPage();
    if (!ids || ids.length === 0) {
      console.error('❌ No lead ID provided and none found on page');
      return;
    }
    leadId = ids[0];
    console.log(`\n✅ Using first found lead ID: ${leadId}\n`);
  }
  
  console.log('🔍 Testing /leads/{leadId}/phones endpoint...\n');
  
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
    console.error('❌ Could not find Cognito token in localStorage');
    return;
  }
  
  const endpoint = `https://optic-prod-api.leadarena.com/leads/${leadId}/phones`;
  console.log(`🔗 Endpoint: ${endpoint}\n`);
  
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
    
    console.log(`📊 Status: ${response.status} ${response.statusText}\n`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error: ${errorText}`);
      return;
    }
    
    const data = await response.json();
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 RESPONSE:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    if (Array.isArray(data)) {
      console.log(`✅ Array with ${data.length} items\n`);
      if (data.length > 0) {
        console.log('First item:');
        console.log(JSON.stringify(data[0], null, 2));
        
        // Check for DNC
        const itemStr = JSON.stringify(data[0]).toLowerCase();
        if (itemStr.includes('dnc') || itemStr.includes('donotcall') || itemStr.includes('cancontact')) {
          console.log('\n✅ DNC FIELDS FOUND!');
        }
      }
    } else {
      console.log(JSON.stringify(data, null, 2));
      
      const dataStr = JSON.stringify(data).toLowerCase();
      if (dataStr.includes('dnc') || dataStr.includes('donotcall') || dataStr.includes('cancontact')) {
        console.log('\n✅ DNC FIELDS FOUND!');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

// Run the search
getLeadIdsFromPage();
