/**
 * Capture TampaUSHA DNC Scrub Endpoint
 * 
 * Run this in browser console on app.tampausha.com BEFORE performing a DNC scrub
 * 
 * This will capture:
 * - Exact endpoint URL used for DNC scrubbing
 * - Request method (GET/POST/etc)
 * - Request headers (especially Authorization token)
 * - Request body (if POST)
 * - Response status and body
 * - Whether DNC status comes from /leads/{leadId}/phones or separate endpoint
 */

(function() {
  'use strict';
  
  const captureData = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    dncScrubRequests: [],
    leadPhoneRequests: [],
    allLeadArenaRequests: []
  };

  console.log('🔍 DNC Scrub Endpoint Capture Active\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  IMPORTANT: Perform a DNC scrub action NOW');
  console.log('   (e.g., scrub a phone number, check DNC status on a lead)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const urlArg = args[0];
    const url = typeof urlArg === 'string' ? urlArg : (urlArg?.url || String(urlArg));
    const options = args[1] || {};
    const method = options.method || 'GET';
    
    // Check if this is a LeadArena API request
    const isLeadArena = typeof url === 'string' && url.includes('optic-prod-api.leadarena.com');
    
    if (isLeadArena) {
      const requestData = {
        timestamp: new Date().toISOString(),
        method: method,
        url: url,
        headers: {},
        body: null,
        bodyParsed: null,
        response: null,
        responseBody: null
      };

      // Capture headers
      if (options.headers) {
        if (options.headers instanceof Headers) {
          options.headers.forEach((value, key) => {
            requestData.headers[key] = value;
          });
        } else {
          Object.assign(requestData.headers, options.headers);
        }
      }

      // Capture body
      if (options.body) {
        requestData.body = options.body;
        try {
          if (typeof options.body === 'string') {
            requestData.bodyParsed = JSON.parse(options.body);
          } else {
            requestData.bodyParsed = options.body;
          }
        } catch (e) {
          requestData.bodyParsed = options.body;
        }
      }

      // Make the request
      const response = await originalFetch.apply(this, args);
      const responseClone = response.clone();
      
      // Capture response
      try {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          requestData.responseBody = await responseClone.json();
        } else if (contentType.includes('text/')) {
          requestData.responseBody = await responseClone.text();
        }
      } catch (e) {
        // Response already consumed
      }
      
      requestData.response = {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      };

      // Categorize request
      captureData.allLeadArenaRequests.push(requestData);
      
      // Check if this is a phone/phones endpoint
      if (url.includes('/phones') || url.includes('/phone')) {
        captureData.leadPhoneRequests.push(requestData);
        console.log(`📞 [PHONE_REQUEST] ${method} ${url}`);
        console.log(`   Status: ${response.status}`);
        if (requestData.responseBody) {
          console.log(`   Response keys: ${Object.keys(requestData.responseBody).join(', ')}`);
          // Check if response contains DNC-related fields
          const responseStr = JSON.stringify(requestData.responseBody);
          if (responseStr.includes('dnc') || responseStr.includes('doNotCall') || 
              responseStr.includes('canContact') || responseStr.includes('contactStatus')) {
            console.log(`   ✅ Contains DNC-related fields!`);
            console.log(`   Response sample: ${JSON.stringify(requestData.responseBody).substring(0, 500)}...`);
          }
        }
        console.log('');
      }
      
      // Check if this might be a scrub endpoint
      if (url.includes('scrub') || url.includes('dnc') || url.includes('doNotCall')) {
        captureData.dncScrubRequests.push(requestData);
        console.log(`🔍 [DNC_SCRUB] ${method} ${url}`);
        console.log(`   Status: ${response.status}`);
        if (requestData.headers.Authorization) {
          const token = requestData.headers.Authorization.substring(7);
          console.log(`   Token: ${token.substring(0, 50)}...`);
        }
        if (requestData.bodyParsed) {
          console.log(`   Body: ${JSON.stringify(requestData.bodyParsed, null, 2)}`);
        }
        if (requestData.responseBody) {
          console.log(`   Response: ${JSON.stringify(requestData.responseBody, null, 2)}`);
        }
        console.log('');
      }
    }

    return response;
  };

  // Save to window
  window.__dncScrubCapture = captureData;

  // Helper functions
  window.showDncScrubCapture = function() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 DNC SCRUB ENDPOINT CAPTURE SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log(`Total LeadArena Requests: ${captureData.allLeadArenaRequests.length}`);
    console.log(`Phone/Phones Requests: ${captureData.leadPhoneRequests.length}`);
    console.log(`DNC Scrub Requests: ${captureData.dncScrubRequests.length}\n`);

    if (captureData.dncScrubRequests.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔍 DNC SCRUB REQUESTS FOUND:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      captureData.dncScrubRequests.forEach((req, i) => {
        console.log(`${i + 1}. ${req.method} ${req.url}`);
        console.log(`   Status: ${req.response?.status}`);
        if (req.headers.Authorization) {
          const token = req.headers.Authorization.substring(7);
          console.log(`   Token: ${token.substring(0, 50)}...`);
        }
        if (req.bodyParsed) {
          console.log(`   Body: ${JSON.stringify(req.bodyParsed, null, 2)}`);
        }
        if (req.responseBody) {
          console.log(`   Response: ${JSON.stringify(req.responseBody, null, 2)}`);
        }
        console.log('');
      });
    } else {
      console.log('⚠️  No explicit DNC scrub requests found');
      console.log('   DNC status may be included in /leads/{leadId}/phones response\n');
    }

    if (captureData.leadPhoneRequests.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📞 PHONE/PHONES REQUESTS (may contain DNC status):');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      captureData.leadPhoneRequests.forEach((req, i) => {
        console.log(`${i + 1}. ${req.method} ${req.url}`);
        console.log(`   Status: ${req.response?.status}`);
        
        if (req.responseBody) {
          // Check if it's an array or object
          if (Array.isArray(req.responseBody)) {
            console.log(`   Response: Array with ${req.responseBody.length} items`);
            if (req.responseBody.length > 0) {
              const firstItem = req.responseBody[0];
              console.log(`   First item keys: ${Object.keys(firstItem).join(', ')}`);
              // Check for DNC fields
              const hasDnc = Object.keys(firstItem).some(key => 
                key.toLowerCase().includes('dnc') || 
                key.toLowerCase().includes('donotcall') ||
                key.toLowerCase().includes('contact')
              );
              if (hasDnc) {
                console.log(`   ✅ Contains DNC-related fields!`);
                console.log(`   Sample: ${JSON.stringify(firstItem, null, 2)}`);
              }
            }
          } else if (typeof req.responseBody === 'object') {
            console.log(`   Response keys: ${Object.keys(req.responseBody).join(', ')}`);
            // Check for DNC fields
            const responseStr = JSON.stringify(req.responseBody);
            if (responseStr.includes('dnc') || responseStr.includes('doNotCall') || 
                responseStr.includes('canContact') || responseStr.includes('contactStatus')) {
              console.log(`   ✅ Contains DNC-related fields!`);
              console.log(`   Full response: ${JSON.stringify(req.responseBody, null, 2)}`);
            }
          }
        }
        console.log('');
      });
    }

    console.log('\n💡 Access full data via: window.__dncScrubCapture');
    console.log('💡 Copy JSON: JSON.stringify(window.__dncScrubCapture, null, 2)\n');
  };

  window.exportDncScrubCapture = function() {
    const json = JSON.stringify(captureData, null, 2);
    console.log('\n📋 Copy this JSON:\n');
    console.log(json);
    console.log('\n');
    return json;
  };

  console.log('✅ Capture active!');
  console.log('💡 After performing DNC scrub, run: showDncScrubCapture()');
  console.log('💡 To export JSON: exportDncScrubCapture()');
  console.log('💡 Access data: window.__dncScrubCapture\n');
})();
