import { NextRequest, NextResponse } from 'next/server';
import { getUshaToken, clearTokenCache } from '@/utils/getUshaToken';

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
    
    // Get JWT token automatically (Cognito → OAuth → env var)
    const providedToken = searchParams.get('token');
    const token = await getUshaToken(providedToken);
    
    if (!token) {
      return NextResponse.json(
        { error: 'USHA JWT token is required. Token fetch failed.' },
        { status: 401 }
      );
    }

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number parameter is required' },
        { status: 400 }
      );
    }

    // Clean phone number - remove all non-digits
    const cleanedPhone = phone.replace(/\D/g, '');
    
    if (cleanedPhone.length < 10) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
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

    // Retry once on auth failure (automatic token refresh)
    if (response.status === 401 || response.status === 403) {
      console.log(`🔄 [SCRUB_PHONE] Token expired (${response.status}), refreshing and retrying...`);
      clearTokenCache();
      const freshToken = await getUshaToken(null, true);
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
        { status: response.status }
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
    });
  } catch (error) {
    console.error('USHA scrub phone API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}
