import { NextRequest, NextResponse } from 'next/server';
import { getUshaToken, clearTokenCache } from '@/utils/getUshaToken';
import { listSessionsFromServer, getSessionFromServer } from '@/app/auth-workers/utils/authWorkerServerStorage';
import { getValidToken } from '@/app/auth-workers/utils/tokenRefreshService';

/**
 * Get USHA JWT token from auth worker (preferred) or fallback to getUshaToken
 * 
 * Priority:
 * 1. Auth worker for agent.ushadvisors.com (auto-refreshes, 24/7)
 * 2. Fallback to getUshaToken() (legacy method)
 */
async function getUshaTokenForDNC(): Promise<string | null> {
  try {
    // Try to get token from auth worker for agent.ushadvisors.com
    const sessions = listSessionsFromServer();
    const ushaSession = sessions
      .filter(s => s.targetDomain === 'agent.ushadvisors.com')
      .sort((a, b) => b.stabilizedAt - a.stabilizedAt)[0]; // Most recent
    
    if (ushaSession) {
      const session = getSessionFromServer(ushaSession.sessionId);
      if (session && session.apiKey) {
        console.log('🔑 [DNC SCRUB] Using auth worker token (auto-refreshes, 24/7)');
        const tokenResult = await getValidToken(session.sessionId);
        if (tokenResult?.token) {
          return tokenResult.token;
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
    let token: string | null = null;
    try {
      token = await getUshaTokenForDNC();
      if (token) {
        console.log('✅ [DNC SCRUB] Using USHA JWT token for DNC API');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Token fetch failed';
      console.error(`❌ [DNC SCRUB] USHA token fetch failed: ${errorMsg}`);
    }
    
    if (!token) {
      console.error('❌ [DNC SCRUB] Token is null/undefined');
      console.error(`❌ [DNC SCRUB] CRITICAL: The USHA DNC API requires a valid USHA JWT token.`);
      console.error(`❌ [DNC SCRUB] Please ensure you have an auth worker for agent.ushadvisors.com or USHA_JWT_TOKEN is set in environment variables.`);
      return NextResponse.json(
        { 
          success: false,
          error: 'Token is required. Failed to obtain USHA JWT token from auth worker or environment. Please create an auth worker for agent.ushadvisors.com or set USHA_JWT_TOKEN in environment variables.' 
        },
        { status: 401 }
      );
    }

    if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      console.error('❌ [DNC SCRUB] Invalid phoneNumbers array');
      return NextResponse.json(
        { error: 'phoneNumbers array is required and must not be empty' },
        { status: 400 }
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
          let response = await fetch(url, {
            method: 'GET',
            headers,
          });

          // Retry once on auth failure (automatic token refresh via auth worker or getUshaToken)
          if (response.status === 401 || response.status === 403) {
            console.log(`  🔄 [DNC SCRUB] ${normalizedPhone}: Token expired (${response.status}), refreshing token and retrying...`);
            clearTokenCache();
            try {
              const freshToken = await getUshaTokenForDNC();
              if (freshToken) {
                headers = { ...headers, 'Authorization': `Bearer ${freshToken}` };
                token = freshToken; // Update token for subsequent requests
                response = await fetch(url, {
                  method: 'GET',
                  headers,
                });
              }
            } catch (e) {
              console.log(`  ⚠️ [DNC SCRUB] ${normalizedPhone}: Token refresh failed:`, e);
            }
          }
          
          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.log(`  ❌ [DNC SCRUB] ${normalizedPhone}: API error ${response.status}: ${errorText.substring(0, 100)}`);
            return {
              phone: normalizedPhone,
              isDNC: false,
              status: 'ERROR',
              error: `API error: ${response.status} ${response.statusText}`
            };
          }
          
          const result = await response.json();
          
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
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [DNC SCRUB] Request error: ${errorMsg}`);
    return NextResponse.json(
      { 
        success: false,
        error: errorMsg 
      },
      { status: 500 }
    );
  }
}
