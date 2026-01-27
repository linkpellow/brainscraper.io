import { NextRequest, NextResponse } from 'next/server';
import { getUshaToken, clearTokenCache } from '@/utils/getUshaToken';
import { listSessionsFromServer, getSessionFromServer } from '@/app/auth-workers/utils/authWorkerServerStorage';
import { getValidToken } from '@/app/auth-workers/utils/tokenRefreshService';

// CORS headers helper - allows requests from any origin
function getCorsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  return NextResponse.json({}, { headers: getCorsHeaders(origin) });
}

/**
 * Get USHA JWT token from auth worker (preferred) or fallback to getUshaToken
 * 
 * Priority:
 * 1. Auth worker for agent.ushadvisors.com (auto-refreshes, 24/7)
 * 2. Fallback to getUshaToken() (legacy method)
 */
async function getUshaTokenForDNC(providedToken?: string | null): Promise<string | null> {
  // If token provided, use it
  if (providedToken) {
    return await getUshaToken(providedToken);
  }
  
  try {
    // Try to get token from auth worker for any USHA domain
    // Priority: api-business-agent.ushadvisors.com > agent.ushadvisors.com > any ushadvisors.com
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
            console.log(`🔑 [SCRUB_PHONE] Using auth worker token from ${session.targetDomain} (auto-refreshes, 24/7)`);
            return tokenResult.token;
          }
        } catch (error) {
          // This session failed, try next one
          continue;
        }
      }
    }
  } catch (error) {
    console.warn('⚠️ [SCRUB_PHONE] Auth worker token fetch failed, falling back to getUshaToken:', error instanceof Error ? error.message : 'Unknown error');
  }
  
  // Fallback to legacy method
  console.log('🔑 [SCRUB_PHONE] Using getUshaToken() fallback');
  return await getUshaToken();
}

/**
 * USHA Single Phone Number Scrub API endpoint
 * Checks a single phone number for DNC status
 * 
 * Endpoint: GET /Leads/api/leads/scrubphonenumber
 * 
 * Query Parameters:
 * - phone: Phone number to check (digits only, no formatting)
 * - currentContextAgentNumber: Agent number (default: 00044447)
 */

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const phone = searchParams.get('phone');
    const currentContextAgentNumber = searchParams.get('currentContextAgentNumber') || '00044447';
    
    // Get JWT token (Priority: Auth worker → getUshaToken fallback)
    const providedToken = searchParams.get('token');
    const token = await getUshaTokenForDNC(providedToken);
    
    const origin = request.headers.get('origin');
    
    if (!token) {
      return NextResponse.json(
        { error: 'USHA JWT token is required. Failed to obtain token from auth worker or environment.' },
        { status: 401, headers: getCorsHeaders(origin) }
      );
    }

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number parameter is required' },
        { status: 400, headers: getCorsHeaders(origin) }
      );
    }

    // Clean phone number - remove all non-digits
    const cleanedPhone = phone.replace(/\D/g, '');
    
    if (cleanedPhone.length < 10) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400, headers: getCorsHeaders(origin) }
      );
    }

    // Build USHA API URL
    const url = `https://api-business-agent.ushadvisors.com/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=${encodeURIComponent(currentContextAgentNumber)}&phone=${encodeURIComponent(cleanedPhone)}`;

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Origin': 'https://agent.ushadvisors.com',
      'Referer': 'https://agent.ushadvisors.com',
      'Content-Type': 'application/json',
      // Add headers that TampaUSHA uses (may help with Cognito token acceptance)
      'x-domain': 'app.tampausha.com',
    };

    let response = await fetch(url, {
      method: 'GET',
      headers,
    });

    // Retry once on auth failure (automatic token refresh via auth worker or getUshaToken)
    if (response.status === 401 || response.status === 403) {
      console.log(`🔄 [SCRUB_PHONE] Token expired (${response.status}), refreshing and retrying...`);
      clearTokenCache();
      const freshToken = await getUshaTokenForDNC();
      if (freshToken) {
        response = await fetch(url, {
          method: 'GET',
          headers: { ...headers, 'Authorization': `Bearer ${freshToken}` },
        });
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `USHA API error: ${response.statusText}`, details: errorText, status: response.status },
        { status: response.status, headers: getCorsHeaders(origin) }
      );
    }

    const result = await response.json();
    
    // Parse response - check nested data structure first, then fallback to top-level
    const responseData = result.data || result;
    const isDNC = responseData.isDoNotCall === true || 
                 responseData.contactStatus?.canContact === false ||
                 result.isDNC === true || 
                 result.isDoNotCall === true || 
                 result.status === 'DNC' || 
                 result.status === 'Do Not Call';
    const canContact = responseData.contactStatus?.canContact !== false && !isDNC;
    const reason = responseData.contactStatus?.reason || responseData.reason || (isDNC ? 'Do Not Call' : undefined);
    
    return NextResponse.json({
      success: true,
      phone: cleanedPhone,
      isDNC: isDNC,
      canContact: canContact,
      status: isDNC ? 'DNC' : 'OK',
      reason: reason,
      data: result,
    }, { headers: getCorsHeaders(origin) });
  } catch (error) {
    console.error('USHA scrub phone API error:', error);
    const origin = request.headers.get('origin');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500, headers: getCorsHeaders(origin) }
    );
  }
}
