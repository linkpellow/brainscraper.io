/**
 * Analyze Captured DNC Scrub Requests
 * 
 * Run this in browser console after running capture-dnc-scrub-endpoint.js
 * and performing a DNC scrub action
 * 
 * Usage:
 *   analyzeCapturedRequests()
 */

function analyzeCapturedRequests() {
  if (!window.__dncScrubCapture) {
    console.error('❌ No capture data found. Run capture-dnc-scrub-endpoint.js first!');
    return;
  }

  const capture = window.__dncScrubCapture;
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 ANALYZING CAPTURED REQUESTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log(`Total LeadArena Requests: ${capture.allLeadArenaRequests.length}`);
  console.log(`DNC Scrub Requests: ${capture.dncScrubRequests.length}`);
  console.log(`Phone Requests: ${capture.leadPhoneRequests.length}\n`);

  if (capture.allLeadArenaRequests.length === 0) {
    console.log('⚠️  No requests captured. Did you perform a DNC scrub action?');
    return;
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 ALL LEADARENA REQUESTS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  capture.allLeadArenaRequests.forEach((req, i) => {
    console.log(`${i + 1}. ${req.method} ${req.url}`);
    console.log(`   Status: ${req.response?.status} ${req.response?.statusText}`);
    
    // Check if URL contains phone/DNC related keywords
    const urlLower = req.url.toLowerCase();
    const isPhoneRelated = urlLower.includes('phone') || urlLower.includes('phones');
    const isDncRelated = urlLower.includes('scrub') || urlLower.includes('dnc') || urlLower.includes('donotcall');
    
    if (isPhoneRelated) {
      console.log(`   🔍 PHONE-RELATED ENDPOINT`);
    }
    if (isDncRelated) {
      console.log(`   🔍 DNC-RELATED ENDPOINT`);
    }
    
    // Show headers (especially Authorization)
    if (req.headers.Authorization) {
      const token = req.headers.Authorization.substring(7);
      console.log(`   Token: ${token.substring(0, 50)}...`);
    }
    
    // Show query params if GET
    if (req.method === 'GET' && req.url.includes('?')) {
      const urlObj = new URL(req.url);
      const params = Object.fromEntries(urlObj.searchParams);
      if (Object.keys(params).length > 0) {
        console.log(`   Query Params: ${JSON.stringify(params)}`);
      }
    }
    
    // Show body if POST/PUT
    if (req.bodyParsed) {
      console.log(`   Body: ${JSON.stringify(req.bodyParsed, null, 2)}`);
    }
    
    // Analyze response for DNC-related fields
    if (req.responseBody) {
      const responseStr = JSON.stringify(req.responseBody).toLowerCase();
      const hasDncFields = responseStr.includes('dnc') || 
                          responseStr.includes('donotcall') || 
                          responseStr.includes('cancontact') ||
                          responseStr.includes('contactstatus');
      
      if (hasDncFields) {
        console.log(`   ✅ RESPONSE CONTAINS DNC-RELATED FIELDS!`);
        
        // Try to extract DNC fields
        if (Array.isArray(req.responseBody)) {
          console.log(`   Response: Array with ${req.responseBody.length} items`);
          if (req.responseBody.length > 0) {
            const firstItem = req.responseBody[0];
            console.log(`   First item keys: ${Object.keys(firstItem).join(', ')}`);
            console.log(`   First item: ${JSON.stringify(firstItem, null, 2)}`);
          }
        } else if (typeof req.responseBody === 'object') {
          console.log(`   Response keys: ${Object.keys(req.responseBody).join(', ')}`);
          console.log(`   Full response: ${JSON.stringify(req.responseBody, null, 2)}`);
        }
      } else {
        // Show response structure anyway
        if (Array.isArray(req.responseBody)) {
          console.log(`   Response: Array with ${req.responseBody.length} items`);
          if (req.responseBody.length > 0) {
            console.log(`   First item keys: ${Object.keys(req.responseBody[0]).join(', ')}`);
          }
        } else if (typeof req.responseBody === 'object') {
          console.log(`   Response keys: ${Object.keys(req.responseBody).join(', ')}`);
        }
      }
    }
    
    console.log('');
  });

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const phoneEndpoints = capture.allLeadArenaRequests.filter(req => 
    req.url.toLowerCase().includes('phone')
  );
  
  const dncEndpoints = capture.allLeadArenaRequests.filter(req => 
    req.url.toLowerCase().includes('scrub') || 
    req.url.toLowerCase().includes('dnc') ||
    req.url.toLowerCase().includes('donotcall')
  );
  
  const responsesWithDnc = capture.allLeadArenaRequests.filter(req => {
    if (!req.responseBody) return false;
    const responseStr = JSON.stringify(req.responseBody).toLowerCase();
    return responseStr.includes('dnc') || 
           responseStr.includes('donotcall') || 
           responseStr.includes('cancontact');
  });

  console.log(`Phone-related endpoints: ${phoneEndpoints.length}`);
  phoneEndpoints.forEach(req => console.log(`   - ${req.method} ${req.url}`));
  
  console.log(`\nDNC-related endpoints: ${dncEndpoints.length}`);
  dncEndpoints.forEach(req => console.log(`   - ${req.method} ${req.url}`));
  
  console.log(`\nResponses with DNC fields: ${responsesWithDnc.length}`);
  responsesWithDnc.forEach(req => {
    console.log(`   - ${req.method} ${req.url}`);
    console.log(`     Contains DNC data!`);
  });

  console.log('\n💡 To export full data: JSON.stringify(window.__dncScrubCapture, null, 2)');
  console.log('');
}

// Auto-run if capture data exists
if (window.__dncScrubCapture && window.__dncScrubCapture.allLeadArenaRequests.length > 0) {
  analyzeCapturedRequests();
} else {
  console.log('📋 Run this function after capturing: analyzeCapturedRequests()');
}
