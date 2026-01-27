# DNC Scrubbing - Executable Code Examples

Complete, runnable examples for scrubbing phone numbers against the Do Not Call list using the USHA API with automatic token refresh.

## Prerequisites

```bash
# Install dependencies if needed
npm install
```

## Example 1: Single Phone Number Scrub (Node.js/TypeScript)

```typescript
/**
 * Example: Scrub a single phone number
 * Automatically handles token refresh if needed
 */

import { NextRequest } from 'next/server';

async function scrubSinglePhone(phone: string): Promise<void> {
  try {
    // Clean phone number (remove non-digits)
    const cleanedPhone = phone.replace(/\D/g, '');
    
    if (cleanedPhone.length < 10) {
      throw new Error('Invalid phone number format');
    }

    // Get token from auth worker (auto-refreshes if needed)
    const { listSessionsFromServer, getSessionFromServer } = await import('./app/auth-workers/utils/authWorkerServerStorage');
    const { getValidToken } = await import('./app/auth-workers/utils/tokenRefreshService');
    
    const sessions = listSessionsFromServer();
    const ushaSession = sessions
      .filter(s => s.targetDomain === 'agent.ushadvisors.com')
      .sort((a, b) => b.stabilizedAt - a.stabilizedAt)[0];
    
    if (!ushaSession) {
      throw new Error('No USHA auth worker found. Please create an auth worker for agent.ushadvisors.com');
    }

    const session = getSessionFromServer(ushaSession.sessionId);
    if (!session || !session.apiKey) {
      throw new Error('USHA session not found or invalid');
    }

    // Get valid token (auto-refreshes if needed)
    const tokenResult = await getValidToken(session.sessionId);
    if (!tokenResult?.token) {
      throw new Error('Failed to get valid token');
    }

    const token = tokenResult.token;
    const currentContextAgentNumber = '00044447'; // Your agent number

    // Call DNC scrub API
    const url = `https://api-business-agent.ushadvisors.com/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=${encodeURIComponent(currentContextAgentNumber)}&phone=${encodeURIComponent(cleanedPhone)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://agent.ushadvisors.com/',
        'Origin': 'https://agent.ushadvisors.com',
        'Content-Type': 'application/json',
      },
    });

    // Retry once on auth failure (automatic token refresh)
    if (response.status === 401 || response.status === 403) {
      console.log('🔄 Token expired, refreshing and retrying...');
      
      // Get fresh token
      const freshTokenResult = await getValidToken(session.sessionId);
      if (freshTokenResult?.token) {
        const retryResponse = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${freshTokenResult.token}`,
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://agent.ushadvisors.com/',
            'Origin': 'https://agent.ushadvisors.com',
            'Content-Type': 'application/json',
          },
        });
        
        if (!retryResponse.ok) {
          throw new Error(`DNC API error: ${retryResponse.status} ${retryResponse.statusText}`);
        }
        
        const result = await retryResponse.json();
        console.log('✅ DNC Scrub Result:', result);
        return;
      }
    }

    if (!response.ok) {
      throw new Error(`DNC API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    // Parse result
    if (result.status === 'Success' && result.data) {
      const isDNC = result.data.isDoNotCall === true;
      const reason = result.data.contactStatus?.reason || 'Unknown';
      
      console.log(`📞 Phone: ${cleanedPhone}`);
      console.log(`   DNC Status: ${isDNC ? '❌ DNC' : '✅ OK'}`);
      if (isDNC) {
        console.log(`   Reason: ${reason}`);
      }
      
      return result;
    } else {
      throw new Error(`Unexpected response format: ${JSON.stringify(result)}`);
    }
  } catch (error) {
    console.error('❌ DNC Scrub Error:', error instanceof Error ? error.message : error);
    throw error;
  }
}

// Usage
// scrubSinglePhone('2698080381').then(() => console.log('Done')).catch(console.error);
```

## Example 2: Batch Phone Number Scrub

```typescript
/**
 * Example: Scrub multiple phone numbers in parallel
 * Automatically handles token refresh and retries
 */

async function scrubBatchPhones(phoneNumbers: string[]): Promise<Map<string, any>> {
  const results = new Map<string, any>();
  
  try {
    // Get token from auth worker
    const { listSessionsFromServer, getSessionFromServer } = await import('./app/auth-workers/utils/authWorkerServerStorage');
    const { getValidToken } = await import('./app/auth-workers/utils/tokenRefreshService');
    
    const sessions = listSessionsFromServer();
    const ushaSession = sessions
      .filter(s => s.targetDomain === 'agent.ushadvisors.com')
      .sort((a, b) => b.stabilizedAt - a.stabilizedAt)[0];
    
    if (!ushaSession) {
      throw new Error('No USHA auth worker found');
    }

    const session = getSessionFromServer(ushaSession.sessionId);
    if (!session || !session.apiKey) {
      throw new Error('USHA session not found');
    }

    // Get valid token (auto-refreshes if needed)
    const tokenResult = await getValidToken(session.sessionId);
    if (!tokenResult?.token) {
      throw new Error('Failed to get valid token');
    }

    let token = tokenResult.token;
    const currentContextAgentNumber = '00044447';

    // Process in batches of 10 (to avoid rate limiting)
    const batchSize = 10;
    
    for (let i = 0; i < phoneNumbers.length; i += batchSize) {
      const batch = phoneNumbers.slice(i, i + batchSize);
      
      console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(phoneNumbers.length / batchSize)}: ${batch.length} numbers`);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (phone) => {
        const cleanedPhone = phone.replace(/\D/g, '');
        
        if (cleanedPhone.length < 10) {
          return {
            phone: cleanedPhone,
            isDNC: false,
            status: 'ERROR',
            error: 'Invalid phone format',
          };
        }

        const url = `https://api-business-agent.ushadvisors.com/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=${encodeURIComponent(currentContextAgentNumber)}&phone=${encodeURIComponent(cleanedPhone)}`;
        
        try {
          let response = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json, text/plain, */*',
              'Referer': 'https://agent.ushadvisors.com/',
              'Origin': 'https://agent.ushadvisors.com',
              'Content-Type': 'application/json',
            },
          });

          // Retry once on auth failure
          if (response.status === 401 || response.status === 403) {
            console.log(`  🔄 ${cleanedPhone}: Token expired, refreshing...`);
            const freshTokenResult = await getValidToken(session.sessionId);
            if (freshTokenResult?.token) {
              token = freshTokenResult.token; // Update token for subsequent requests
              response = await fetch(url, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Accept': 'application/json, text/plain, */*',
                  'Referer': 'https://agent.ushadvisors.com/',
                  'Origin': 'https://agent.ushadvisors.com',
                  'Content-Type': 'application/json',
                },
              });
            }
          }

          if (!response.ok) {
            return {
              phone: cleanedPhone,
              isDNC: false,
              status: 'ERROR',
              error: `API error: ${response.status}`,
            };
          }

          const result = await response.json();
          
          if (result.status === 'Success' && result.data) {
            const isDNC = result.data.isDoNotCall === true;
            const reason = result.data.contactStatus?.reason || null;
            
            return {
              phone: cleanedPhone,
              isDNC,
              reason,
              status: 'SUCCESS',
              data: result.data,
            };
          } else {
            return {
              phone: cleanedPhone,
              isDNC: false,
              status: 'ERROR',
              error: 'Unexpected response format',
            };
          }
        } catch (error) {
          return {
            phone: cleanedPhone,
            isDNC: false,
            status: 'ERROR',
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      // Store results
      batchResults.forEach(result => {
        results.set(result.phone, result);
      });

      // Log progress
      const dncCount = batchResults.filter(r => r.isDNC).length;
      const okCount = batchResults.filter(r => r.status === 'SUCCESS' && !r.isDNC).length;
      const errorCount = batchResults.filter(r => r.status === 'ERROR').length;
      
      console.log(`  ✅ Batch complete: ${okCount} OK, ${dncCount} DNC, ${errorCount} errors`);
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < phoneNumbers.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return results;
  } catch (error) {
    console.error('❌ Batch DNC Scrub Error:', error instanceof Error ? error.message : error);
    throw error;
  }
}

// Usage
// const phones = ['2698080381', '2694621403', '6165551234'];
// scrubBatchPhones(phones).then(results => {
//   console.log('\n📊 Results Summary:');
//   results.forEach((result, phone) => {
//     console.log(`  ${phone}: ${result.isDNC ? '❌ DNC' : '✅ OK'} ${result.reason ? `(${result.reason})` : ''}`);
//   });
// }).catch(console.error);
```

## Example 3: Using the API Endpoint (Simplest)

```typescript
/**
 * Example: Use the built-in API endpoint
 * This is the simplest approach - the API handles everything
 */

async function scrubViaAPI(phoneNumbers: string[]): Promise<any> {
  try {
    const response = await fetch('/api/usha/scrub-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phoneNumbers }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const result = await response.json();
    
    console.log('📊 DNC Scrub Results:');
    console.log(`  Total: ${result.results?.length || 0}`);
    console.log(`  OK: ${result.results?.filter((r: any) => !r.isDNC).length || 0}`);
    console.log(`  DNC: ${result.results?.filter((r: any) => r.isDNC).length || 0}`);
    console.log(`  Errors: ${result.results?.filter((r: any) => r.status === 'ERROR').length || 0}`);
    
    return result;
  } catch (error) {
    console.error('❌ API Error:', error instanceof Error ? error.message : error);
    throw error;
  }
}

// Usage
// scrubViaAPI(['2698080381', '2694621403']).then(console.log).catch(console.error);
```

## Example 4: Standalone Script (Node.js)

```typescript
/**
 * Standalone script for DNC scrubbing
 * Save as: scripts/dnc-scrub-standalone.ts
 * Run with: npx tsx scripts/dnc-scrub-standalone.ts
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

async function main() {
  const phoneNumbers = process.argv.slice(2);
  
  if (phoneNumbers.length === 0) {
    console.log('Usage: npx tsx scripts/dnc-scrub-standalone.ts <phone1> <phone2> ...');
    console.log('Example: npx tsx scripts/dnc-scrub-standalone.ts 2698080381 2694621403');
    process.exit(1);
  }

  try {
    // Import required modules
    const { listSessionsFromServer, getSessionFromServer } = await import('../app/auth-workers/utils/authWorkerServerStorage');
    const { getValidToken } = await import('../app/auth-workers/utils/tokenRefreshService');

    // Get USHA session
    const sessions = listSessionsFromServer();
    const ushaSession = sessions
      .filter(s => s.targetDomain === 'agent.ushadvisors.com')
      .sort((a, b) => b.stabilizedAt - a.stabilizedAt)[0];

    if (!ushaSession) {
      console.error('❌ No USHA auth worker found.');
      console.error('   Please create an auth worker for agent.ushadvisors.com first.');
      process.exit(1);
    }

    const session = getSessionFromServer(ushaSession.sessionId);
    if (!session || !session.apiKey) {
      console.error('❌ USHA session not found or invalid');
      process.exit(1);
    }

    console.log('🔑 Using auth worker token (auto-refreshes if needed)');
    console.log(`   Session: ${session.sessionId.substring(0, 8)}...`);
    console.log(`   Domain: ${session.targetDomain}`);
    console.log('');

    // Get valid token
    const tokenResult = await getValidToken(session.sessionId);
    if (!tokenResult?.token) {
      console.error('❌ Failed to get valid token');
      process.exit(1);
    }

    if (tokenResult.wasRefreshed) {
      console.log('✅ Token was refreshed automatically');
    }
    console.log(`✅ Token expires at: ${tokenResult.expiresAt ? new Date(tokenResult.expiresAt).toISOString() : 'unknown'}`);
    console.log('');

    const token = tokenResult.token;
    const currentContextAgentNumber = '00044447';

    // Scrub each phone number
    console.log(`📞 Scrubbing ${phoneNumbers.length} phone number(s)...\n`);

    for (const phone of phoneNumbers) {
      const cleanedPhone = phone.replace(/\D/g, '');
      
      if (cleanedPhone.length < 10) {
        console.log(`❌ ${phone}: Invalid format (cleaned: ${cleanedPhone})`);
        continue;
      }

      try {
        const url = `https://api-business-agent.ushadvisors.com/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=${encodeURIComponent(currentContextAgentNumber)}&phone=${encodeURIComponent(cleanedPhone)}`;
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://agent.ushadvisors.com/',
            'Origin': 'https://agent.ushadvisors.com',
            'Content-Type': 'application/json',
          },
        });

        if (response.status === 401 || response.status === 403) {
          // Token expired, refresh and retry
          console.log(`  🔄 ${cleanedPhone}: Token expired, refreshing...`);
          const freshTokenResult = await getValidToken(session.sessionId);
          if (freshTokenResult?.token) {
            const retryResponse = await fetch(url, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${freshTokenResult.token}`,
                'Accept': 'application/json, text/plain, */*',
                'Referer': 'https://agent.ushadvisors.com/',
                'Origin': 'https://agent.ushadvisors.com',
                'Content-Type': 'application/json',
              },
            });
            
            if (!retryResponse.ok) {
              console.log(`  ❌ ${cleanedPhone}: API error ${retryResponse.status}`);
              continue;
            }
            
            const result = await retryResponse.json();
            if (result.status === 'Success' && result.data) {
              const isDNC = result.data.isDoNotCall === true;
              const reason = result.data.contactStatus?.reason || null;
              console.log(`  ${isDNC ? '❌' : '✅'} ${cleanedPhone}: ${isDNC ? `DNC (${reason})` : 'OK'}`);
            }
            continue;
          }
        }

        if (!response.ok) {
          console.log(`  ❌ ${cleanedPhone}: API error ${response.status}`);
          continue;
        }

        const result = await response.json();
        
        if (result.status === 'Success' && result.data) {
          const isDNC = result.data.isDoNotCall === true;
          const reason = result.data.contactStatus?.reason || null;
          console.log(`  ${isDNC ? '❌' : '✅'} ${cleanedPhone}: ${isDNC ? `DNC (${reason})` : 'OK'}`);
        } else {
          console.log(`  ⚠️  ${cleanedPhone}: Unexpected response format`);
        }
      } catch (error) {
        console.log(`  ❌ ${cleanedPhone}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    console.log('\n✅ DNC scrubbing complete');
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { main };
```

## Example 5: CSV File Scrub

```typescript
/**
 * Example: Scrub phone numbers from CSV file
 * Uses the CSV scrub API endpoint
 */

async function scrubCSVFile(filePath: string): Promise<void> {
  try {
    const fs = await import('fs');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    
    // Parse CSV (simple implementation - use papaparse for complex CSVs)
    const lines = fileContent.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    const phoneIndex = headers.findIndex(h => 
      h.toLowerCase().includes('phone') || 
      h.toLowerCase().includes('tel') ||
      h.toLowerCase().includes('mobile')
    );

    if (phoneIndex === -1) {
      throw new Error('No phone column found in CSV');
    }

    const phoneNumbers: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      const phone = values[phoneIndex]?.trim().replace(/\D/g, '');
      if (phone && phone.length >= 10) {
        phoneNumbers.push(phone);
      }
    }

    console.log(`📄 Found ${phoneNumbers.length} phone numbers in CSV`);

    // Use batch scrub API
    const response = await fetch('/api/usha/scrub-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phoneNumbers }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const result = await response.json();
    
    console.log('\n📊 Results:');
    console.log(`  Total: ${result.results?.length || 0}`);
    console.log(`  OK: ${result.results?.filter((r: any) => !r.isDNC).length || 0}`);
    console.log(`  DNC: ${result.results?.filter((r: any) => r.isDNC).length || 0}`);
    console.log(`  Errors: ${result.results?.filter((r: any) => r.status === 'ERROR').length || 0}`);
    
    // Save results
    const outputPath = filePath.replace('.csv', '_dnc_results.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`\n💾 Results saved to: ${outputPath}`);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    throw error;
  }
}

// Usage
// scrubCSVFile('leads.csv').then(() => console.log('Done')).catch(console.error);
```

## Quick Start

### Option 1: Use API Endpoint (Recommended)

```bash
# Production (public URL)
curl -X POST https://brainscraper.io/api/usha/scrub-batch \
  -H "Content-Type: application/json" \
  -d '{"phoneNumbers": ["2698080381", "2694621403"]}'

# Local development
curl -X POST http://localhost:3000/api/usha/scrub-batch \
  -H "Content-Type: application/json" \
  -d '{"phoneNumbers": ["2698080381", "2694621403"]}'
```

### Option 2: Use Standalone Script

```bash
# Create the script file
npx tsx scripts/dnc-scrub-standalone.ts 2698080381 2694621403
```

### Option 3: Use in Your Code

```typescript
import { scrubSinglePhone } from './dnc-scrubbing-examples';

// Scrub a single phone
await scrubSinglePhone('2698080381');
```

## Response Format

```typescript
{
  status: "Success",
  message: null,
  errorKey: null,
  redirectUrl: null,
  data: {
    phoneNumber: "2698080381",
    contactStatus: {
      phoneNumber: "2698080381",
      canContact: false,
      reason: "Federal DNC",
      expiryDateUTC: null
    },
    isDoNotCall: true,
    objectState: 0
  },
  errorDetail: null
}
```

## Key Features

✅ **Automatic Token Refresh**: Tokens refresh automatically 30 minutes before expiration  
✅ **Retry Logic**: Automatically retries on auth failures  
✅ **Batch Processing**: Process multiple numbers efficiently  
✅ **Error Handling**: Comprehensive error handling and logging  
✅ **Rate Limiting**: Built-in batch processing to avoid rate limits  

## Notes

- Token refresh happens automatically - you don't need to handle it manually
- The system checks expiration and refreshes proactively
- Failed refreshes are retried with exponential backoff
- All examples handle 401/403 errors by refreshing and retrying
- The API endpoint (`/api/usha/scrub-batch`) handles everything automatically
