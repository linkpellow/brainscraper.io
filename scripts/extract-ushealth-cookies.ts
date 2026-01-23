#!/usr/bin/env tsx
/**
 * Extract USHEALTH Cookies from HAR File
 * 
 * Extracts ASP.NET_SessionId and other cookies from a HAR file
 * for use with the USHEALTH quote automation
 */

import * as fs from 'fs';
import * as path from 'path';

interface Cookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: string;
  httpOnly?: boolean;
  secure?: boolean;
}

function extractCookiesFromHAR(harPath: string): {
  cookies: Cookie[];
  aspNetSessionId?: string;
  cookieString: string;
} {
  const harContent = fs.readFileSync(harPath, 'utf-8');
  const har = JSON.parse(harContent);
  
  const cookieMap = new Map<string, Cookie>();
  let aspNetSessionId: string | undefined;
  
  // Extract cookies from all entries
  for (const entry of har.log.entries) {
    const url = entry.request.url;
    
    // Only process ushealthgroup.com entries
    if (!url.includes('ushealthgroup.com') && !url.includes('ezapp')) {
      continue;
    }
    
    // Extract from request cookies
    if (entry.request.cookies) {
      for (const cookie of entry.request.cookies) {
        const key = `${cookie.name}:${cookie.domain || 'ezapp.ushealthgroup.com'}`;
        if (!cookieMap.has(key)) {
          cookieMap.set(key, {
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            expires: cookie.expires,
            httpOnly: cookie.httpOnly,
            secure: cookie.secure,
          });
          
          // Track ASP.NET_SessionId
          if (cookie.name === 'ASP.NET_SessionId' || cookie.name === 'ASP_NET_SessionId') {
            aspNetSessionId = cookie.value;
          }
        }
      }
    }
    
    // Extract from Cookie header
    if (entry.request.headers) {
      for (const header of entry.request.headers) {
        if (header.name.toLowerCase() === 'cookie') {
          const cookieHeader = header.value;
          const cookiePairs = cookieHeader.split(';');
          
          for (const pair of cookiePairs) {
            const [name, ...valueParts] = pair.trim().split('=');
            if (name && valueParts.length > 0) {
              const value = valueParts.join('=');
              const key = `${name}:ezapp.ushealthgroup.com`;
              
              if (!cookieMap.has(key)) {
                cookieMap.set(key, {
                  name: name.trim(),
                  value: value.trim(),
                  domain: 'ezapp.ushealthgroup.com',
                });
                
                // Track ASP.NET_SessionId
                if (name.trim() === 'ASP.NET_SessionId' || name.trim() === 'ASP_NET_SessionId') {
                  aspNetSessionId = value.trim();
                }
              }
            }
          }
        }
      }
    }
    
    // Extract from Set-Cookie response headers
    if (entry.response.headers) {
      for (const header of entry.response.headers) {
        if (header.name.toLowerCase() === 'set-cookie') {
          const setCookieHeader = header.value;
          const parts = setCookieHeader.split(';');
          const [name, ...valueParts] = parts[0].split('=');
          
          if (name && valueParts.length > 0) {
            const value = valueParts.join('=');
            const key = `${name.trim()}:ezapp.ushealthgroup.com`;
            
            if (!cookieMap.has(key)) {
              cookieMap.set(key, {
                name: name.trim(),
                value: value.trim(),
                domain: 'ezapp.ushealthgroup.com',
              });
              
              // Track ASP.NET_SessionId
              if (name.trim() === 'ASP.NET_SessionId' || name.trim() === 'ASP_NET_SessionId') {
                aspNetSessionId = value.trim();
              }
            }
          }
        }
      }
    }
  }
  
  const cookies = Array.from(cookieMap.values());
  const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  
  return {
    cookies,
    aspNetSessionId,
    cookieString,
  };
}

// Main execution
if (require.main === module) {
  const harPath = process.argv[2] || '/Users/linkpellow/Downloads/QUOTE.har';
  
  if (!fs.existsSync(harPath)) {
    console.error(`❌ HAR file not found: ${harPath}`);
    process.exit(1);
  }
  
  console.log(`🔍 Extracting cookies from: ${harPath}\n`);
  
  try {
    const result = extractCookiesFromHAR(harPath);
    
    console.log(`📊 Found ${result.cookies.length} cookie(s):\n`);
    
    if (result.cookies.length === 0) {
      console.log('⚠️  No cookies found in HAR file');
      console.log('\nThis could mean:');
      console.log('  1. The HAR file was captured without an active session');
      console.log('  2. Cookies were not included in the HAR export');
      console.log('  3. The session expired before the HAR was captured');
      console.log('\n💡 To get cookies:');
      console.log('  1. Visit https://ezapp.ushealthgroup.com and log in');
      console.log('  2. Make sure you have an active session');
      console.log('  3. Export HAR file while session is active');
      console.log('  4. Upload HAR to /auth-workers page');
    } else {
      result.cookies.forEach((cookie, index) => {
        console.log(`${index + 1}. ${cookie.name}`);
        console.log(`   Value: ${cookie.value.substring(0, 50)}${cookie.value.length > 50 ? '...' : ''}`);
        console.log(`   Domain: ${cookie.domain || 'ezapp.ushealthgroup.com'}`);
        if (cookie.httpOnly) console.log(`   HttpOnly: true`);
        if (cookie.secure) console.log(`   Secure: true`);
        console.log('');
      });
      
      if (result.aspNetSessionId) {
        console.log('✅ ASP.NET_SessionId found!');
        console.log(`   Value: ${result.aspNetSessionId.substring(0, 50)}${result.aspNetSessionId.length > 50 ? '...' : ''}\n`);
      } else {
        console.log('⚠️  ASP.NET_SessionId not found');
        console.log('   This is required for USHEALTH quote automation\n');
      }
      
      console.log('📋 Cookie String (for use in requests):');
      console.log(result.cookieString);
      console.log('');
      
      // Save to file
      const outputPath = path.join(path.dirname(harPath), 'ushealth-cookies.json');
      fs.writeFileSync(outputPath, JSON.stringify({
        extractedAt: new Date().toISOString(),
        harFile: path.basename(harPath),
        hasASPNETSession: !!result.aspNetSessionId,
        cookies: result.cookies,
        cookieString: result.cookieString,
        aspNetSessionId: result.aspNetSessionId,
      }, null, 2));
      
      console.log(`💾 Saved to: ${outputPath}`);
    }
  } catch (error) {
    console.error('❌ Error extracting cookies:', error);
    process.exit(1);
  }
}
