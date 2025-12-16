import { NextRequest, NextResponse } from 'next/server';
import { getUshaToken } from '@/utils/getUshaToken';

/**
 * USHA Bulk Lead Scrubbing API endpoint
 * Uploads CSV file and triggers DNC scrubbing
 * 
 * Endpoint: POST /Leads/api/leads/importafterMapping
 */

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    // Get JWT token automatically from Crokodial API (with fallbacks)
    const providedToken = formData.get('token')?.toString();
    const token = await getUshaToken(providedToken);
    
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
    // Note: In Node.js/Next.js, we need to use a FormData-compatible library
    // For now, we'll construct the multipart form data manually or use a library
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
    const response = await fetch('https://api-business-agent.ushadvisors.com/Leads/api/leads/importafterMapping', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: ushaFormData,
    });

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

