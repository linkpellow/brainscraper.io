/**
 * Parse HAR file to extract JWT token and API request details
 * Usage: npx tsx scripts/parse-har-token.ts [har-file-path]
 */

import * as fs from 'fs';
import * as path from 'path';

interface HarEntry {
  request: {
    method: string;
    url: string;
    headers: Array<{ name: string; value: string }>;
    cookies: Array<any>;
  };
  response: {
    status: number;
    content?: {
      text?: string;
      mimeType?: string;
    };
  };
}

interface HarFile {
  log: {
    entries: HarEntry[];
  };
}

function extractTokenFromHAR(harPath: string) {
  console.log(`\n🔍 Parsing HAR file: ${harPath}\n`);

  if (!fs.existsSync(harPath)) {
    console.error(`❌ File not found: ${harPath}`);
    process.exit(1);
  }

  const harContent = fs.readFileSync(harPath, 'utf-8');
  const har: HarFile = JSON.parse(harContent);

  console.log(`📊 Total entries in HAR: ${har.log.entries.length}\n`);

  // Look for USHA API requests
  const ushaRequests = har.log.entries.filter(entry => 
    entry.request.url.includes('ushadvisors.com') &&
    (entry.request.url.includes('/api/') || entry.request.url.includes('scrubphonenumber'))
  );

  console.log(`🎯 Found ${ushaRequests.length} USHA API requests\n`);

  // Extract tokens from headers
  const tokens = new Set<string>();
  const apiDetails: Array<{
    url: string;
    method: string;
    hasAuth: boolean;
    token?: string;
    response?: any;
  }> = [];

  ushaRequests.forEach((entry, index) => {
    const authHeader = entry.request.headers.find(h => 
      h.name.toLowerCase() === 'authorization'
    );
    
    const token = authHeader?.value?.replace(/^Bearer\s+/i, '');
    if (token) {
      tokens.add(token);
    }

    // Parse response if available
    let responseData = null;
    if (entry.response.content?.text) {
      try {
        if (entry.response.content.mimeType?.includes('json')) {
          responseData = JSON.parse(entry.response.content.text);
        }
      } catch (e) {
        // Not JSON, keep as text
        responseData = entry.response.content.text;
      }
    }

    apiDetails.push({
      url: entry.request.url,
      method: entry.request.method,
      hasAuth: !!authHeader,
      token: token,
      response: responseData,
    });

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Request ${index + 1}: ${entry.request.method} ${entry.request.url}`);
    console.log(`Status: ${entry.response.status}`);
    console.log(`Has Authorization Header: ${!!authHeader}`);
    
    if (authHeader) {
      const maskedToken = token?.substring(0, 50) + '...' || 'N/A';
      console.log(`Token (first 50 chars): ${maskedToken}`);
    }

    // Check cookies
    if (entry.request.cookies && entry.request.cookies.length > 0) {
      console.log(`Cookies: ${entry.request.cookies.length} cookie(s) found`);
      entry.request.cookies.forEach(cookie => {
        if (cookie.name.toLowerCase().includes('token') || 
            cookie.name.toLowerCase().includes('auth') ||
            cookie.name.toLowerCase().includes('jwt')) {
          console.log(`  - ${cookie.name}: ${cookie.value.substring(0, 50)}...`);
        }
      });
    }

    // Show response data for scrubphonenumber requests
    if (entry.request.url.includes('scrubphonenumber') && responseData) {
      console.log(`\n📋 DNC Check Response:`);
      console.log(JSON.stringify(responseData, null, 2));
    }
  });

  // Summary
  console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 SUMMARY`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Total USHA API requests: ${ushaRequests.length}`);
  console.log(`Requests with Authorization header: ${apiDetails.filter(d => d.hasAuth).length}`);
  console.log(`Unique tokens found: ${tokens.size}`);

  if (tokens.size > 0) {
    console.log(`\n🔑 JWT TOKEN(S) FOUND:`);
    tokens.forEach((token, index) => {
      console.log(`\nToken ${index + 1}:`);
      console.log(token);
      
      // Try to decode JWT (just for display, not validation)
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
          console.log(`\n  Header:`, JSON.stringify(header, null, 2));
          console.log(`  Payload (first 500 chars):`, JSON.stringify(payload, null, 2).substring(0, 500));
        }
      } catch (e) {
        console.log(`  (Could not decode JWT structure)`);
      }
    });
  } else {
    console.log(`\n⚠️  No JWT tokens found in Authorization headers`);
    console.log(`\nThis could mean:`);
    console.log(`  1. Authentication is done via cookies (session-based)`);
    console.log(`  2. Token is stored in localStorage/sessionStorage (not in HAR)`);
    console.log(`  3. Browser automatically handles authentication`);
  }

  // Check for cookie-based auth
  const cookieAuth = ushaRequests.some(entry => 
    entry.request.cookies && entry.request.cookies.length > 0
  );
  
  if (cookieAuth) {
    console.log(`\n🍪 Cookie-based authentication detected`);
    console.log(`   The API may be using session cookies instead of JWT tokens`);
  }

  return {
    tokens: Array.from(tokens),
    apiDetails,
  };
}

// Get HAR file path from command line or use default
const harPath = process.argv[2] || '/Users/linkpellow/Desktop/limited benefit.har';

if (!harPath) {
  console.error('Usage: npx tsx scripts/parse-har-token.ts [har-file-path]');
  process.exit(1);
}

const result = extractTokenFromHAR(harPath);

// Save tokens to file if found
if (result.tokens.length > 0) {
  const outputPath = path.join(process.cwd(), 'extracted-tokens.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    extractedAt: new Date().toISOString(),
    tokens: result.tokens,
    apiDetails: result.apiDetails,
  }, null, 2));
  console.log(`\n💾 Tokens saved to: ${outputPath}`);
}
