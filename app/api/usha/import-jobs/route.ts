import { NextRequest, NextResponse } from 'next/server';
import { getUshaToken } from '@/utils/getUshaToken';

/**
 * USHA Import Jobs API endpoint
 * Lists all import job details
 * 
 * Endpoint: GET /Leads/api/leads/allimportjobdetails
 */

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Get JWT token automatically (Cognito → OAuth → env var)
    const providedToken = searchParams.get('token');
    const token = await getUshaToken(providedToken);
    
    if (!token) {
      return NextResponse.json(
        { error: 'USHA JWT token is required. Token fetch failed.' },
        { status: 401 }
      );
    }

    const response = await fetch('https://api-business-agent.ushadvisors.com/Leads/api/leads/allimportjobdetails', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
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
    console.error('USHA import jobs API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

