import { NextRequest, NextResponse } from 'next/server';
import { getUshaToken, clearTokenCache } from '@/utils/getUshaToken';
import { listSessionsFromServer, getSessionFromServer } from '@/app/auth-workers/utils/authWorkerServerStorage';
import { getValidToken } from '@/app/auth-workers/utils/tokenRefreshService';

function getCorsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  return NextResponse.json({}, { headers: getCorsHeaders(origin) });
}

/**
 * Retry a function with exponential backoff
 * @param fn - The async function to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param baseDelayMs - Base delay in milliseconds (default: 1000)
 * @returns The result of the function or throws after all retries exhausted
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        console.log(`  🔄 [DNC SCRUB] Retry ${attempt + 1}/${maxRetries} after ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw lastError;
}

/**
 * Get USHA JWT token from auth worker (preferred) or fallback to getUshaToken
 * 
 * Priority:
 * 1. Auth worker for agent.ushadvisors.com (auto-refreshes, 24/7)
 * 2. Fallback to getUshaToken() (legacy method)
 */
async function getUshaTokenForDNC(): Promise<string | null> {
  try {
    // Try to get token from auth worker for any USHA domain
    // Priority: api-business-agent.ushadvisors.com > agent.ushadvisors.com > any ushadvisors.com
    // (api-business-agent is preferred because it's more reliable for DNC API)
    const sessions = listSessionsFromServer();
    const ushaSessions = sessions
      .filter(s => s.targetDomain.includes('ushadvisors.com'))
      .sort((a, b) => {
        // Prefer api-business-agent.ushadvisors.com (most reliable for DNC API)
        const aIsApiBusiness = a.targetDomain === 'api-business-agent.ushadvisors.com';
        const bIsApiBusiness = b.targetDomain === 'api-business-agent.ushadvisors.com';
        if (aIsApiBusiness && !bIsApiBusiness) return -1;
        if (!aIsApiBusiness && bIsApiBusiness) return 1;
        
        // Then prefer agent.ushadvisors.com
        const aIsAgent = a.targetDomain === 'agent.ushadvisors.com';
        const bIsAgent = b.targetDomain === 'agent.ushadvisors.com';
        if (aIsAgent && !bIsAgent) return -1;
        if (!aIsAgent && bIsAgent) return 1;
        
        // Finally, most recent
        return b.stabilizedAt - a.stabilizedAt;
      });
    
    // Try sessions in priority order until we get a valid token
    for (const ushaSession of ushaSessions) {
      const session = getSessionFromServer(ushaSession.sessionId);
      if (session) {
        try {
          const tokenResult = await getValidToken(session.sessionId);
          if (tokenResult?.token) {
            console.log(`🔑 [DNC SCRUB] Using auth worker token from ${session.targetDomain} (auto-refreshes, 24/7)`);
            return tokenResult.token;
          }
        } catch (error) {
          // This session failed, try next one
          console.warn(`⚠️ [DNC SCRUB] Session ${ushaSession.sessionId} failed, trying next...`);
          continue;
        }
      }
    }
  } catch (error) {
    console.warn('⚠️ [DNC SCRUB] Auth worker token fetch failed, falling back to getUshaToken:', error instanceof Error ? error.message : 'Unknown error');
  }
  
  // Fallback to legacy method
  console.log('🔑 [DNC SCRUB] Using getUshaToken() fallback');
  return await getUshaToken();
}

/**
 * USHA Batch Phone Number Scrub API endpoint
 * Checks multiple phone numbers for DNC status in parallel
 * 
 * This endpoint accepts an array of phone numbers and returns DNC status for each
 */

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const startTime = Date.now();
  console.log('\n🔍 [DNC SCRUB] ============================================');
  console.log('🔍 [DNC SCRUB] Batch DNC Scrubbing Request Received');
  console.log('🔍 [DNC SCRUB] ============================================\n');
  
  try {
    const body = await request.json();
    const { phoneNumbers } = body;
    
    console.log(`📞 [DNC SCRUB] Received ${phoneNumbers?.length || 0} phone numbers to scrub`);
    
    // Get USHA JWT token (required for USHA DNC API)
    // Priority: Auth worker (auto-refreshes) → getUshaToken (fallback)
    const providedToken = extractBearerToken(request);
    let token: string | null = providedToken;
    try {
      if (!token) {
        token = await getUshaTokenForDNC();
        if (token) {
          console.log('✅ [DNC SCRUB] Using USHA JWT token for DNC API');
        }
      } else {
        console.log('✅ [DNC SCRUB] Using provided Authorization header for DNC API');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Token fetch failed';
      console.error(`❌ [DNC SCRUB] USHA token fetch failed: ${errorMsg}`);
    }
    
    if (!token) {
      console.error('❌ [DNC SCRUB] Token is null/undefined');
      console.error(`❌ [DNC SCRUB] CRITICAL: The USHA DNC API requires a valid USHA JWT token.`);
      console.error(`❌ [DNC SCRUB] Provide a manual token via Authorization header, create an auth worker, or set USHA_JWT_TOKEN in environment variables.`);
      return NextResponse.json(
        { 
          success: false,
          error: 'Token is required. Provide a manual Authorization token, create an auth worker for agent.ushadvisors.com, or set USHA_JWT_TOKEN in environment variables.' 
        },
        { status: 401, headers: getCorsHeaders(origin) }
      );
    }

    if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      console.error('❌ [DNC SCRUB] Invalid phoneNumbers array');
      return NextResponse.json(
        { error: 'phoneNumbers array is required and must not be empty' },
        { status: 400, headers: getCorsHeaders(origin) }
      );
    }

    console.log(`✅ [DNC SCRUB] Token found, starting scrubbing for ${phoneNumbers.length} numbers\n`);

    const currentContextAgentNumber = '00044447';
    const results: Array<{ phone: string; isDNC: boolean; status: string; error?: string }> = [];

    // Process phone numbers in parallel (with rate limiting - max 10 concurrent)
    const batchSize = 10;
    const totalBatches = Math.ceil(phoneNumbers.length / batchSize);
    
    console.log(`📦 [DNC SCRUB] Processing in ${totalBatches} batch(es) of up to ${batchSize} numbers each\n`);
    
    for (let i = 0; i < phoneNumbers.length; i += batchSize) {
      const batchNum = Math.floor(i / batchSize) + 1;
      const batch = phoneNumbers.slice(i, i + batchSize);
      
      console.log(`📦 [DNC SCRUB] Batch ${batchNum}/${totalBatches}: Scrubbing ${batch.length} phone numbers...`);
      
      const batchPromises = batch.map(async (phone: string, idx: number) => {
        try {
          // Clean phone number - remove all non-digits and ensure it's a string
          const cleanedPhone = String(phone || '').replace(/\D/g, '');
          
          // Validate phone number length (10 digits minimum for US numbers)
          if (!cleanedPhone || cleanedPhone.length < 10) {
            console.log(`  ⚠️  [DNC SCRUB] Invalid phone: ${phone} (cleaned: ${cleanedPhone}, too short)`);
            return {
              phone: cleanedPhone || String(phone || '').substring(0, 10),
              isDNC: false,
              status: 'INVALID',
              error: 'Invalid phone number format (must be at least 10 digits)'
            };
          }
          
          // Handle 11-digit numbers (with country code 1) - strip leading 1
          const normalizedPhone = cleanedPhone.length === 11 && cleanedPhone.startsWith('1') 
            ? cleanedPhone.substring(1) 
            : cleanedPhone;

          // Use USHA DNC API directly (requires USHA JWT token)
          // Token is already from auth worker (auto-refreshes) or getUshaToken fallback
          const url = `https://api-business-agent.ushadvisors.com/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=${encodeURIComponent(currentContextAgentNumber)}&phone=${encodeURIComponent(normalizedPhone)}`;
          let headers: Record<string, string> = {
            'Authorization': `Bearer ${token}`,
            'accept': 'application/json, text/plain, */*',
            'Referer': 'https://agent.ushadvisors.com/',
            'Content-Type': 'application/json',
          };

          const requestStart = Date.now();
          
          // Wrap API call in retry logic with exponential backoff
          const result = await retryWithBackoff(async () => {
            let response = await fetch(url, {
              method: 'GET',
              headers,
            });

            // Retry once on auth failure (automatic token refresh via auth worker or getUshaToken)
            if ((response.status === 401 || response.status === 403) && !providedToken) {
              console.log(`  🔄 [DNC SCRUB] ${normalizedPhone}: Token expired (${response.status}), refreshing token and retrying...`);
              clearTokenCache();
              const freshToken = await getUshaTokenForDNC();
              if (freshToken) {
                headers = { ...headers, 'Authorization': `Bearer ${freshToken}` };
                token = freshToken; // Update token for subsequent requests
                response = await fetch(url, {
                  method: 'GET',
                  headers,
                });
              }
            }
            
            if (!response.ok) {
              const errorText = await response.text().catch(() => 'Unknown error');
              // Throw to trigger retry for server errors (5xx) or rate limits (429)
              if (response.status >= 500 || response.status === 429) {
                throw new Error(`API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 100)}`);
              }
              // Don't retry client errors (4xx except 429, 401, 403)
              console.log(`  ❌ [DNC SCRUB] ${normalizedPhone}: API error ${response.status}: ${errorText.substring(0, 100)}`);
              return { error: `API error: ${response.status} ${response.statusText}`, status: response.status };
            }
            
            return await response.json();
          }, 3, 1000); // 3 retries with 1s base delay (1s, 2s, 4s)
          
          // Handle non-retryable error response
          if (result.error && result.status) {
            return {
              phone: normalizedPhone,
              isDNC: false,
              status: 'ERROR',
              error: result.error
            };
          }
          
          // Parse USHA DNC API response format:
          // {
          //   "status": "Success",
          //   "data": {
          //     "phoneNumber": "2694621403",
          //     "contactStatus": {
          //       "canContact": false,
          //       "reason": "Federal DNC"
          //     },
          //     "isDoNotCall": true
          //   }
          // }
          const responseData = result.data || result;
          const contactStatus = responseData.contactStatus || {};
          
          // DNC status: isDoNotCall is the primary indicator
          const isDNC = responseData.isDoNotCall === true || 
                       contactStatus.canContact === false ||
                       result.isDoNotCall === true || 
                       result.canContact === false;
          
          // Can contact: opposite of isDNC, or explicit canContact field
          const canContact = contactStatus.canContact !== false && !isDNC;
          
          // Reason: from contactStatus.reason
          const reason = contactStatus.reason || responseData.reason || result.reason || 
                        (isDNC ? 'Do Not Call' : undefined);
          
          const duration = Date.now() - requestStart;
          console.log(`  ✅ [DNC SCRUB] ${normalizedPhone}: ${isDNC ? 'DNC' : 'OK'} (${duration}ms)`);
          
          return {
            phone: normalizedPhone,
            isDNC: isDNC,
            canContact: canContact,
            status: isDNC ? 'DNC' : 'OK',
            reason: reason
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          console.error(`  ❌ [DNC SCRUB] ${phone}: Exception: ${errorMsg}`);
          return {
            phone: String(phone || '').replace(/\D/g, '').substring(0, 10),
            isDNC: false,
            status: 'ERROR',
            error: errorMsg
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < phoneNumbers.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    const duration = Date.now() - startTime;
    const stats = {
      total: results.length,
      success: results.filter(r => r.status === 'OK' || r.status === 'DNC').length,
      failed: results.filter(r => r.status === 'ERROR' || r.status === 'INVALID').length,
      dnc: results.filter(r => r.isDNC).length,
      ok: results.filter(r => !r.isDNC && r.status === 'OK').length
    };
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 [DNC SCRUB] Batch Scrubbing Complete');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total: ${stats.total}`);
    console.log(`Success: ${stats.success}`);
    console.log(`Failed: ${stats.failed}`);
    console.log(`DNC: ${stats.dnc}`);
    console.log(`OK: ${stats.ok}`);
    console.log(`Duration: ${duration}ms`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    return NextResponse.json({
      success: true,
      results: results,
      stats: stats,
      dncCount: stats.dnc, // For frontend compatibility
      okCount: stats.ok    // For frontend compatibility
    }, { headers: getCorsHeaders(origin) });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [DNC SCRUB] Request error: ${errorMsg}`);
    return NextResponse.json(
      { 
        success: false,
        error: errorMsg 
      },
      { status: 500, headers: getCorsHeaders(origin) }
    );
  }
}
