import { NextRequest, NextResponse } from 'next/server';

/**
 * LinkedIn Bulk Data Scraper API endpoint
 * Uses RapidAPI linkedin-bulk-data-scraper
 * 
 * For RapidAPI setup:
 * - target: "server"
 * - client: "fetch"
 */

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const linkedinUrl = searchParams.get('url');
    const name = searchParams.get('name');
    const endpoint = searchParams.get('endpoint') || 'profile';

    // Get API key from environment variables
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!RAPIDAPI_KEY) {
      return NextResponse.json(
        { error: 'RAPIDAPI_KEY not configured. Please add it to your .env.local file' },
        { status: 500 }
      );
    }

    // Build URL with LinkedIn URL as parameter
    let url = `https://linkedin-bulk-data-scraper.p.rapidapi.com/${endpoint}`;
    const params = new URLSearchParams();
    if (linkedinUrl) {
      params.append('url', linkedinUrl);
    }
    if (name) {
      params.append('name', name);
    }
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'linkedin-bulk-data-scraper.p.rapidapi.com',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `RapidAPI error: ${response.statusText}`, details: errorText, status: response.status },
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
      data,
      raw: result,
    });
  } catch (error) {
    console.error('LinkedIn scraper API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url: linkedinUrl, name, endpoint = 'profile' } = body;

    // Get API key from environment variables
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!RAPIDAPI_KEY) {
      return NextResponse.json(
        { error: 'RAPIDAPI_KEY not configured. Please add it to your .env.local file' },
        { status: 500 }
      );
    }

    // Build API URL
    const apiUrl = `https://linkedin-bulk-data-scraper.p.rapidapi.com/${endpoint}`;
    
    // For profile endpoint, use POST with body. For other endpoints like 'goat', use GET
    const isProfileEndpoint = endpoint === 'profile';
    
    const fetchOptions: RequestInit = {
      method: isProfileEndpoint ? 'POST' : 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'linkedin-bulk-data-scraper.p.rapidapi.com',
      },
    };

    // Add body for POST requests (profile endpoint)
    if (isProfileEndpoint && linkedinUrl) {
      fetchOptions.headers = {
        ...fetchOptions.headers,
        'content-type': 'application/json',
      };
      fetchOptions.body = JSON.stringify({ url: linkedinUrl });
    } else if (!isProfileEndpoint) {
      // For GET requests, add query params
      const params = new URLSearchParams();
      if (linkedinUrl) params.append('url', linkedinUrl);
      if (name) params.append('name', name);
      const urlWithParams = params.toString() ? `${apiUrl}?${params.toString()}` : apiUrl;
      const response = await fetch(urlWithParams, fetchOptions);
      
      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json(
          { error: `RapidAPI error: ${response.statusText}`, details: errorText, status: response.status },
          { status: response.status }
        );
      }

      const result = await response.text();
      let data;
      try {
        data = JSON.parse(result);
      } catch {
        data = { raw: result };
      }

      return NextResponse.json({
        success: true,
        data,
        raw: result,
      });
    }

    const response = await fetch(apiUrl, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `RapidAPI error: ${response.statusText}`, details: errorText, status: response.status },
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
      data,
      raw: result,
    });
  } catch (error) {
    console.error('LinkedIn scraper API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

