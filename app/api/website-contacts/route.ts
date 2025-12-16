import { NextRequest, NextResponse } from 'next/server';

/**
 * Website Contacts Scraper API endpoint
 * Uses RapidAPI website-contacts-scraper
 * 
 * For RapidAPI setup:
 * - target: "server"
 * - client: "fetch"
 */

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query');
    const matchEmailDomain = searchParams.get('match_email_domain') || 'false';
    const externalMatching = searchParams.get('external_matching') || 'false';

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter (domain) is required' },
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

    // Build URL with query parameters
    const params = new URLSearchParams();
    params.append('query', query);
    params.append('match_email_domain', matchEmailDomain);
    params.append('external_matching', externalMatching);
    
    const url = `https://website-contacts-scraper.p.rapidapi.com/scrape-contacts?${params.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'website-contacts-scraper.p.rapidapi.com',
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
    console.error('Website contacts API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, match_email_domain = false, external_matching = false } = body;

    if (!query) {
      return NextResponse.json(
        { error: 'Query (domain) is required in request body' },
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

    // Build URL with query parameters
    const params = new URLSearchParams();
    params.append('query', query);
    params.append('match_email_domain', String(match_email_domain));
    params.append('external_matching', String(external_matching));
    
    const url = `https://website-contacts-scraper.p.rapidapi.com/scrape-contacts?${params.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'website-contacts-scraper.p.rapidapi.com',
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
    console.error('Website contacts API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

