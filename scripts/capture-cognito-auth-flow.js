/**
 * Capture Cognito Authentication Flow
 * 
 * Run this BEFORE logging in to capture the Cognito authentication flow.
 * This will capture all Cognito API calls including InitiateAuth, RespondToAuthChallenge, etc.
 */

(function() {
  'use strict';
  
  const capturedData = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    cognitoRequests: [],
    tokens: {},
    credentials: {},
    allRequests: []
  };

  console.log('🔍 Cognito Auth Flow Capture Active\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  IMPORTANT: Log in NOW to capture the flow');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Intercept fetch for Cognito API calls
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    // Handle both string URLs and Request objects
    const urlArg = args[0];
    const url = typeof urlArg === 'string' ? urlArg : (urlArg?.url || String(urlArg));
    const options = args[1] || {};
    const method = options.method || 'GET';
    
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

    // Check if this is a Cognito API call
    const isCognito = typeof url === 'string' && (
                     url.includes('cognito-idp') || 
                     url.includes('cognito') ||
                     url.includes('amazonaws.com'));

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

    // Capture and parse body
    if (options.body) {
      requestData.body = options.body;
      
      try {
        if (typeof options.body === 'string') {
          requestData.bodyParsed = JSON.parse(options.body);
        } else {
          requestData.bodyParsed = options.body;
        }
      } catch (e) {
        // Not JSON
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

    // Store all requests
    capturedData.allRequests.push(requestData);

    // If Cognito request, log it
    if (isCognito) {
      capturedData.cognitoRequests.push(requestData);
      console.log(`\n🔐 COGNITO REQUEST CAPTURED:`);
      console.log(`   ${method} ${url}`);
      if (requestData.bodyParsed) {
        console.log(`   Body:`, requestData.bodyParsed);
      }
      if (requestData.responseBody) {
        console.log(`   Response:`, requestData.responseBody);
        
        // Extract tokens from AuthenticationResult
        if (requestData.responseBody.AuthenticationResult) {
          const authResult = requestData.responseBody.AuthenticationResult;
          if (authResult.AccessToken) {
            capturedData.tokens.accessToken = authResult.AccessToken;
            console.log(`   ✅ Access Token captured`);
          }
          if (authResult.IdToken) {
            capturedData.tokens.idToken = authResult.IdToken;
            console.log(`   ✅ ID Token captured (${authResult.IdToken.substring(0, 50)}...)`);
          }
          if (authResult.RefreshToken) {
            capturedData.tokens.refreshToken = authResult.RefreshToken;
            console.log(`   ✅ Refresh Token captured (${authResult.RefreshToken.substring(0, 50)}...)`);
          }
        }
        
        // Also check for tokens in the body directly (some Cognito responses)
        if (requestData.responseBody.IdToken) {
          capturedData.tokens.idToken = requestData.responseBody.IdToken;
          console.log(`   ✅ ID Token captured from response body`);
        }
        if (requestData.responseBody.RefreshToken) {
          capturedData.tokens.refreshToken = requestData.responseBody.RefreshToken;
          console.log(`   ✅ Refresh Token captured from response body`);
        }
        
        // Extract credentials from request
        if (requestData.bodyParsed) {
          if (requestData.bodyParsed.ClientId) {
            capturedData.credentials.clientId = requestData.bodyParsed.ClientId;
            console.log(`   ✅ Client ID: ${requestData.bodyParsed.ClientId}`);
          }
          if (requestData.bodyParsed.AuthFlow) {
            console.log(`   ✅ Auth Flow: ${requestData.bodyParsed.AuthFlow}`);
          }
        }
      }
    }

    return response;
  };

  // Intercept XHR for Cognito
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url) {
    this._method = method;
    this._url = typeof url === 'string' ? url : String(url);
    return originalOpen.apply(this, arguments);
  };
  
  XMLHttpRequest.prototype.send = function(data) {
    const url = this._url || '';
    const isCognito = typeof url === 'string' && (
                     url.includes('cognito-idp') || 
                     url.includes('cognito') ||
                     url.includes('amazonaws.com'));
    
    if (isCognito && data) {
      try {
        const body = typeof data === 'string' ? JSON.parse(data) : data;
        console.log(`\n🔐 COGNITO XHR: ${this._method} ${url}`);
        console.log(`   Body:`, body);
      } catch (e) {
        // Ignore
      }
    }
    
    this.addEventListener('load', function() {
      if (isCognito) {
        try {
          const response = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
          console.log(`   Response:`, response);
          
          // Extract tokens from XHR response
          if (response.AuthenticationResult) {
            const authResult = response.AuthenticationResult;
            if (authResult.IdToken) {
              capturedData.tokens.idToken = authResult.IdToken;
              console.log(`   ✅ ID Token captured from XHR`);
            }
            if (authResult.RefreshToken) {
              capturedData.tokens.refreshToken = authResult.RefreshToken;
              console.log(`   ✅ Refresh Token captured from XHR`);
            }
          }
        } catch (e) {
          // Ignore
        }
      }
    });
    
    return originalSend.apply(this, arguments);
  };

  // Save to window
  window.__cognitoAuthCapture = capturedData;

  // Summary function
  window.showCognitoCapture = function() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 COGNITO AUTH CAPTURE SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log(`Total Requests: ${capturedData.allRequests.length}`);
    console.log(`Cognito Requests: ${capturedData.cognitoRequests.length}\n`);
    
    if (Object.keys(capturedData.tokens).length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎫 TOKENS CAPTURED:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      if (capturedData.tokens.accessToken) {
        console.log('✅ Access Token: Found');
      }
      if (capturedData.tokens.idToken) {
        console.log('✅ ID Token: Found');
      }
      if (capturedData.tokens.refreshToken) {
        console.log('✅ Refresh Token: Found');
        console.log(`   ${capturedData.tokens.refreshToken.substring(0, 50)}...`);
      }
      console.log('');
    }
    
    if (Object.keys(capturedData.credentials).length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔑 CREDENTIALS:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      if (capturedData.credentials.clientId) {
        console.log(`Client ID: ${capturedData.credentials.clientId}`);
      }
      console.log('');
    }
    
    if (capturedData.cognitoRequests.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔐 COGNITO REQUESTS:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      capturedData.cognitoRequests.forEach((req, i) => {
        console.log(`${i + 1}. ${req.method} ${req.url}`);
        if (req.bodyParsed) {
          // Don't log full body if it contains sensitive data
          const body = req.bodyParsed;
          if (body.AuthFlow) {
            console.log(`   AuthFlow: ${body.AuthFlow}`);
          }
          if (body.ChallengeName) {
            console.log(`   ChallengeName: ${body.ChallengeName}`);
          }
          if (body.ClientId) {
            console.log(`   ClientId: ${body.ClientId}`);
          }
          // Only log full body if it's not sensitive
          if (!body.AuthParameters && !body.ChallengeResponses && !body.AccessToken) {
            console.log(`   Request:`, body);
          }
        }
        if (req.responseBody) {
          const resp = req.responseBody;
          // Extract and display tokens from response
          if (resp.AuthenticationResult) {
            const authResult = resp.AuthenticationResult;
            console.log(`   ✅ AuthenticationResult found:`);
            if (authResult.IdToken) {
              console.log(`      IdToken: ${authResult.IdToken.substring(0, 50)}...`);
            }
            if (authResult.AccessToken) {
              console.log(`      AccessToken: ${authResult.AccessToken.substring(0, 50)}...`);
            }
            if (authResult.RefreshToken) {
              console.log(`      RefreshToken: ${authResult.RefreshToken.substring(0, 50)}...`);
            }
            if (authResult.ExpiresIn) {
              console.log(`      ExpiresIn: ${authResult.ExpiresIn} seconds`);
            }
          } else if (resp.ChallengeName) {
            console.log(`   Challenge: ${resp.ChallengeName}`);
          } else {
            console.log(`   Response:`, resp);
          }
        }
        console.log('');
      });
    }
    
    console.log('💡 Access full data via: window.__cognitoAuthCapture\n');
  };

  console.log('✅ Capture active! After login, run: showCognitoCapture()\n');

  return capturedData;
})();
