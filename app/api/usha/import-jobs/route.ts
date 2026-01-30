import { NextRequest, NextResponse } from 'next/server';
import { getDncToken } from '@/utils/dncToken';
import { incrementMetric } from '@/utils/dncMetrics';

/**
 * USHA Import Jobs API endpoint
 * Lists all import job details
 * 
 * Endpoint: GET /Leads/api/leads/allimportjobdetails
 */

export async function GET(request: NextRequest) {
  try {
    const token = getDncToken();
    
    if (!token) {
      incrementMetric('dnc.token.missing');
      return NextResponse.json(
        { error: 'DNC token not configured. Add token in Lead Generation > Settings.' },
        { status: 400 }
      );
    }

    const response = await fetch('https://api-business-agent.ushadvisors.com/Leads/api/leads/allimportjobdetails', {
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
    console.error('USHA import jobs API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}
