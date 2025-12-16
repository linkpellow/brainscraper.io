import { NextRequest, NextResponse } from 'next/server';

/**
 * Telnyx Number Lookup API endpoint
 * Retrieves caller name, carrier, and portability information for phone numbers
 * 
 * Official API: https://developers.telnyx.com/api-reference/number-lookup/lookup-phone-number-data
 * Endpoint: GET /number_lookup/{phone_number}
 * 
 * Response includes:
 * - data.portability.line_type (voip, mobile, fixed line, etc.)
 * - data.carrier (carrier name, type, normalized_carrier)
 * - data.portability (ported status, city, state, etc.)
 * 
 * Note: Using type=carrier only (portability data is included automatically, no caller-name to avoid CNAM costs)
 * 
 * For Telnyx setup:
 * - target: "server"
 * - client: "fetch"
 */

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const phoneNumber = searchParams.get('phone');

    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Phone number parameter is required' },
        { status: 400 }
      );
    }

    // Get API key from environment variables
    const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
    
    if (!TELNYX_API_KEY) {
      return NextResponse.json(
        { error: 'TELNYX_API_KEY not configured. Please add it to your .env.local file' },
        { status: 500 }
      );
    }

    // Clean phone number and ensure E.164 format (starts with +)
    let cleanedPhone = phoneNumber.replace(/[^\d+]/g, '');
    // If no + prefix and starts with 1, add + for US numbers
    if (!cleanedPhone.startsWith('+')) {
      if (cleanedPhone.startsWith('1') && cleanedPhone.length === 11) {
        cleanedPhone = '+' + cleanedPhone;
      } else if (cleanedPhone.length === 10) {
        // Assume US number, add +1
        cleanedPhone = '+1' + cleanedPhone;
      }
    }
    
    // Telnyx API endpoint for number lookup
    // Format: https://api.telnyx.com/v2/number_lookup/{phone_number}?type=carrier
    // Using type=carrier only (portability data is included automatically, no need for caller-name)
    // Per docs: https://developers.telnyx.com/api-reference/number-lookup/lookup-phone-number-data
    const url = `https://api.telnyx.com/v2/number_lookup/${encodeURIComponent(cleanedPhone)}?type=carrier`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Telnyx API error: ${response.statusText}`, details: errorText, status: response.status },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Telnyx lookup API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone } = body;

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required in request body' },
        { status: 400 }
      );
    }

    // Get API key from environment variables
    const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
    
    if (!TELNYX_API_KEY) {
      return NextResponse.json(
        { error: 'TELNYX_API_KEY not configured. Please add it to your .env.local file' },
        { status: 500 }
      );
    }

    // Clean phone number and ensure E.164 format (starts with +)
    let cleanedPhone = phone.replace(/[^\d+]/g, '');
    // If no + prefix and starts with 1, add + for US numbers
    if (!cleanedPhone.startsWith('+')) {
      if (cleanedPhone.startsWith('1') && cleanedPhone.length === 11) {
        cleanedPhone = '+' + cleanedPhone;
      } else if (cleanedPhone.length === 10) {
        // Assume US number, add +1
        cleanedPhone = '+1' + cleanedPhone;
      }
    }
    
    // Telnyx API endpoint for number lookup
    // Using type=carrier only (portability data is included automatically)
    // Per docs: https://developers.telnyx.com/api-reference/number-lookup/lookup-phone-number-data
    const url = `https://api.telnyx.com/v2/number_lookup/${encodeURIComponent(cleanedPhone)}?type=carrier`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Telnyx API error: ${response.statusText}`, details: errorText, status: response.status },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Telnyx lookup API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

