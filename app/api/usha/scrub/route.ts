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
            console.log(`🔑 [SCRUB_BULK] Using auth worker token from ${session.targetDomain}`);
            return tokenResult.token;
          }
        } catch {
          continue;
        }
      }
    }
  } catch (error) {
    console.warn('⚠️ [SCRUB_BULK] Auth worker failed, using fallback:', error instanceof Error ? error.message : 'Unknown');
  }
  
  return await getUshaToken();
}

/**
 * USHA Bulk Lead Scrubbing API endpoint
 * Uploads CSV file and triggers DNC scrubbing
 * 
 * Endpoint: POST /Leads/api/leads/importafterMapping
 */

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const providedToken = formData.get('token')?.toString();
    let token = await getUshaTokenForDNC(providedToken);
    
    if (!token) {
      return NextResponse.json(
        { error: 'USHA JWT token is required. Token fetch failed.' },
        { status: 401 }
      );
    }

    // Get the uploaded file
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json(
        { error: 'CSV file is required' },
        { status: 400 }
      );
    }

    // Get optional parameters from form data
    const vendorName = formData.get('VendorName')?.toString() || 'NextGen';
    const vendorID = formData.get('VendorID')?.toString() || '26';
    const campaignName = formData.get('CampaignName')?.toString() || '';
    const campaignID = formData.get('CampaignID')?.toString() || '';
    const importLeads = formData.get('ImportLeads')?.toString() || 'false';
    const scrubList = formData.get('ScrubList')?.toString() || 'true';
    const allowLeadsWithNoPhoneNumber = formData.get('AllowLeadsWithNoPhoneNumber')?.toString() || 'false';
    const currentContextAgentNumber = formData.get('CurrentContextAgentNumber')?.toString() || 'undefined';
    const campaignDNCExemption = formData.get('CampaignDNCExemption')?.toString() || '';

    // Create FormData for USHA API
    const ushaFormData = new FormData();
    ushaFormData.append('VendorName', vendorName);
    ushaFormData.append('VendorID', vendorID);
    ushaFormData.append('CampaignName', campaignName);
    ushaFormData.append('CampaignID', campaignID);
    ushaFormData.append('ImportLeads', importLeads);
    ushaFormData.append('ScrubList', scrubList);
    ushaFormData.append('AllowLeadsWithNoPhoneNumber', allowLeadsWithNoPhoneNumber);
    ushaFormData.append('CurrentContextAgentNumber', currentContextAgentNumber);
    ushaFormData.append('CampaignDNCExemption', campaignDNCExemption);
    
    // Append the file - convert to Blob for FormData
    const fileBlob = await file.arrayBuffer();
    const blob = new Blob([fileBlob], { type: file.type || 'text/csv' });
    ushaFormData.append('UploadFile', blob, file.name);

    // Make request to USHA API
    let response = await fetch('https://api-business-agent.ushadvisors.com/Leads/api/leads/importafterMapping', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: ushaFormData,
    });

    // Retry on auth failure with fresh token
    if (response.status === 401 || response.status === 403) {
      console.log(`🔄 [SCRUB_BULK] Token expired (${response.status}), refreshing and retrying...`);
      clearTokenCache();
      token = await getUshaTokenForDNC();
      if (token) {
        // Recreate FormData for retry (can't reuse)
        const retryFormData = new FormData();
        retryFormData.append('VendorName', vendorName);
        retryFormData.append('VendorID', vendorID);
        retryFormData.append('CampaignName', campaignName);
        retryFormData.append('CampaignID', campaignID);
        retryFormData.append('ImportLeads', importLeads);
        retryFormData.append('ScrubList', scrubList);
        retryFormData.append('AllowLeadsWithNoPhoneNumber', allowLeadsWithNoPhoneNumber);
        retryFormData.append('CurrentContextAgentNumber', currentContextAgentNumber);
        retryFormData.append('CampaignDNCExemption', campaignDNCExemption);
        retryFormData.append('UploadFile', blob, file.name);
        
        response = await fetch('https://api-business-agent.ushadvisors.com/Leads/api/leads/importafterMapping', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: retryFormData,
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
    console.error('USHA scrub API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

