import { NextRequest, NextResponse } from 'next/server';
import { getDncToken } from '@/server/settings/dncToken';
import { incrementMetric } from '@/utils/dncMetrics';

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
    
    const token = await getDncToken();
    
    const origin = request.headers.get('origin');
    
    if (!token) {
      incrementMetric('dnc.token.missing');
      return NextResponse.json(
        { error: 'DNC token not configured. Add token in Lead Generation > Settings.' },
        { status: 400, headers: getCorsHeaders(origin) }
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

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });
    if (response.status === 401 || response.status === 403) {
      incrementMetric('dnc.api.unauthorized');
      return NextResponse.json(
        { error: 'DNC request unauthorized (invalid manual token). Update token in Lead Generation settings.' },
        { status: 401, headers: getCorsHeaders(origin) }
      );
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
