import { NextRequest, NextResponse } from 'next/server';

/**
 * LinkedIn Company Data API endpoint
 * Uses RapidAPI linkedin-data-api
 * 
 * For RapidAPI setup:
 * - target: "server"
 * - client: "fetch"
 */

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const domain = searchParams.get('domain');

    if (!domain) {
      return NextResponse.json(
        { error: 'Domain parameter is required' },
        { status: 400 }
      );
    }

    // Get API key from environment variables
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!RAPIDAPI_KEY) {
      return NextResponse.json(
        { error: 'RAPIDAPI_KEY not configured. Please add it to your .env.local file' },
        { status: 500 }
      );
    }

    // Build URL with domain
    const url = `https://linkedin-data-api.p.rapidapi.com/get-company-by-domain?domain=${encodeURIComponent(domain)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'linkedin-data-api.p.rapidapi.com',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `RapidAPI error: ${response.statusText}`, details: errorText },
        { status: response.status }
      );
    }

    const result = await response.text();
    
    // Try to parse as JSON, fallback to text
    let data;
    try {
      data = JSON.parse(result);
    } catch {
      data = { raw: result };
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('LinkedIn company API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { domain } = body;

    if (!domain) {
      return NextResponse.json(
        { error: 'Domain is required in request body' },
        { status: 400 }
      );
    }

    // Get API key from environment variables
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!RAPIDAPI_KEY) {
      return NextResponse.json(
        { error: 'RAPIDAPI_KEY not configured. Please add it to your .env.local file' },
        { status: 500 }
      );
    }

    // Build URL with domain
    const url = `https://linkedin-data-api.p.rapidapi.com/get-company-by-domain?domain=${encodeURIComponent(domain)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'linkedin-data-api.p.rapidapi.com',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `RapidAPI error: ${response.statusText}`, details: errorText },
        { status: response.status }
      );
    }

    const result = await response.text();
    
    // Try to parse as JSON, fallback to text
    let data;
    try {
      data = JSON.parse(result);
    } catch {
      data = { raw: result };
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('LinkedIn company API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

