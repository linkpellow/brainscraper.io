import { NextRequest, NextResponse } from 'next/server';
import { getDncToken } from '@/server/settings/dncToken';
import { incrementMetric } from '@/utils/dncMetrics';

/**
 * USHA Import Log Details API endpoint
 * Gets row-by-row scrub results for a specific import job
 * 
 * Endpoint: GET /Leads/api/leads/allimportjoblogdetails?JobLogID=XXXXXXX
 */

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const jobLogID = searchParams.get('JobLogID');
    const token = await getDncToken();
    
    if (!token) {
      incrementMetric('dnc.token.missing');
      return NextResponse.json(
        { error: 'DNC token not configured. Add token in Lead Generation > Settings.' },
        { status: 400 }
      );
    }

    if (!jobLogID) {
      return NextResponse.json(
        { error: 'JobLogID parameter is required' },
        { status: 400 }
      );
    }

    const url = `https://api-business-agent.ushadvisors.com/Leads/api/leads/allimportjoblogdetails?JobLogID=${encodeURIComponent(jobLogID)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (response.status === 401 || response.status === 403) {
      incrementMetric('dnc.api.unauthorized');
      return NextResponse.json(
        { error: 'DNC request unauthorized (invalid manual token). Update token in Lead Generation settings.' },
        { status: 401 }
      );
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
    console.error('USHA import log API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}
