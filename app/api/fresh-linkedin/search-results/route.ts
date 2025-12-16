import { NextRequest, NextResponse } from 'next/server';

/**
 * Fresh LinkedIn Profile Data API - Get Search Results endpoint
 * Retrieves search results using a request_id from a previous search
 * Uses RapidAPI fresh-linkedin-profile-data
 * 
 * API: https://rapidapi.com/freshdata-freshdata-default/api/fresh-linkedin-profile-data
 * 
 * For RapidAPI setup:
 * - target: "server"
 * - client: "fetch"
 */

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const requestId = searchParams.get('request_id');
    const page = searchParams.get('page') || '1';

    if (!requestId) {
      return NextResponse.json(
        { error: 'request_id parameter is required' },
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

    const url = `https://fresh-linkedin-profile-data.p.rapidapi.com/get-search-results?request_id=${encodeURIComponent(requestId)}&page=${encodeURIComponent(page)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'fresh-linkedin-profile-data.p.rapidapi.com',
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

    return NextResponse.json({
      success: true,
      data: data,
    });
  } catch (error) {
    console.error('Fresh LinkedIn search results API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { request_id, page = 1 } = body;

    if (!request_id) {
      return NextResponse.json(
        { error: 'request_id is required in request body' },
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

    const url = `https://fresh-linkedin-profile-data.p.rapidapi.com/get-search-results?request_id=${encodeURIComponent(request_id)}&page=${encodeURIComponent(String(page))}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'fresh-linkedin-profile-data.p.rapidapi.com',
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

    return NextResponse.json({
      success: true,
      data: data,
    });
  } catch (error) {
    console.error('Fresh LinkedIn search results API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

