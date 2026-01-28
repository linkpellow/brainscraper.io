import { NextRequest, NextResponse } from 'next/server';
import { getUshaToken, clearTokenCache } from '@/utils/getUshaToken';
import { listSessionsFromServer, getSessionFromServer } from '@/app/auth-workers/utils/authWorkerServerStorage';
import { getValidToken } from '@/app/auth-workers/utils/tokenRefreshService';

/**
 * Get USHA JWT token from auth worker (preferred) or fallback to getUshaToken
 * Uses proactive refresh to ensure tokens are always valid
 */
async function getUshaTokenForDNC(providedToken?: string | null): Promise<string | null> {
  if (providedToken) {
    return await getUshaToken(providedToken);
  }
  
  try {
    const sessions = listSessionsFromServer();
    const ushaSessions = sessions
      .filter(s => s.targetDomain.includes('ushadvisors.com'))
      .sort((a, b) => {
        const aIsApiBusiness = a.targetDomain === 'api-business-agent.ushadvisors.com';
        const bIsApiBusiness = b.targetDomain === 'api-business-agent.ushadvisors.com';
        if (aIsApiBusiness && !bIsApiBusiness) return -1;
        if (!aIsApiBusiness && bIsApiBusiness) return 1;
        return b.stabilizedAt - a.stabilizedAt;
      });
    
    for (const ushaSession of ushaSessions) {
      const session = getSessionFromServer(ushaSession.sessionId);
      if (session) {
        try {
          const tokenResult = await getValidToken(session.sessionId);
          if (tokenResult?.token) {
            console.log(`🔑 [IMPORT_JOBS] Using auth worker token from ${session.targetDomain}`);
            return tokenResult.token;
          }
        } catch {
          continue;
        }
      }
    }
  } catch (error) {
    console.warn('⚠️ [IMPORT_JOBS] Auth worker failed, using fallback:', error instanceof Error ? error.message : 'Unknown');
  }
  
  return await getUshaToken();
}

/**
 * USHA Import Jobs API endpoint
 * Lists all import job details
 * 
 * Endpoint: GET /Leads/api/leads/allimportjobdetails
 */

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const providedToken = searchParams.get('token');
    let token = await getUshaTokenForDNC(providedToken);
    
    if (!token) {
      return NextResponse.json(
        { error: 'USHA JWT token is required. Token fetch failed.' },
        { status: 401 }
      );
    }

    let response = await fetch('https://api-business-agent.ushadvisors.com/Leads/api/leads/allimportjobdetails', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    // Retry on auth failure with fresh token
    if (response.status === 401 || response.status === 403) {
      console.log(`🔄 [IMPORT_JOBS] Token expired (${response.status}), refreshing and retrying...`);
      clearTokenCache();
      token = await getUshaTokenForDNC();
      if (token) {
        response = await fetch('https://api-business-agent.ushadvisors.com/Leads/api/leads/allimportjobdetails', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `USHA API error: ${response.statusText}`, details: errorText, status: response.status },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('USHA import jobs API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

