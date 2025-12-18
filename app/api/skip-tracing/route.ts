import { NextRequest, NextResponse } from 'next/server';

/**
 * Skip Tracing API endpoint
 * Uses RapidAPI skip-tracing-working-api
 * 
 * API: https://rapidapi.com/oneapiproject/api/skip-tracing-working-api
 * 
 * Available endpoints:
 * - GET /search/byname?name=...&page=...
 * - GET /search/bynameaddress?name=...&citystatezip=...&page=...
 * - GET /search/byemail?email=...&phone=...
 * - GET /search/byphone?phone=...
 * - GET /search/detailsbyID?peo_id=... (for detailed info including phone numbers)
 * 
 * For RapidAPI setup:
 * - target: "server"
 * - client: "fetch"
 */

// CORS headers helper
function getCorsHeaders(origin: string | null) {
  const allowedOrigins = [
    'https://brainscraper.io',
    'https://www.brainscraper.io',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
  
  const isAllowed = origin && allowedOrigins.some(allowed => origin.startsWith(allowed));
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  return NextResponse.json({}, { headers: getCorsHeaders(origin) });
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const email = searchParams.get('email');
    const phone = searchParams.get('phone');
    const name = searchParams.get('name');
    const citystatezip = searchParams.get('citystatezip');
    const page = searchParams.get('page') || '1';
    const personId = searchParams.get('person_id') || searchParams.get('peo_id'); // For detailed person lookup

    // Get API key from environment variables
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!RAPIDAPI_KEY) {
      const origin = request.headers.get('origin');
      return NextResponse.json(
        { error: 'RAPIDAPI_KEY not configured. Please add it to your .env.local file' },
        { status: 500, headers: getCorsHeaders(origin) }
      );
    }

    let url: string;
    
    // Determine which endpoint to use based on available parameters
    if (personId) {
      // Person details by ID (for phone numbers and full details)
      url = `https://skip-tracing-working-api.p.rapidapi.com/search/detailsbyID?peo_id=${encodeURIComponent(personId)}`;
    } else if (name && citystatezip) {
      // Name + address search (most accurate)
      const params = new URLSearchParams();
      params.append('name', name);
      params.append('citystatezip', citystatezip);
      params.append('page', page);
      url = `https://skip-tracing-working-api.p.rapidapi.com/search/bynameaddress?${params.toString()}`;
    } else if (name) {
      // Name-based search
      const params = new URLSearchParams();
      params.append('name', name);
      params.append('page', page);
      url = `https://skip-tracing-working-api.p.rapidapi.com/search/byname?${params.toString()}`;
    } else if (email) {
      // Email-based search
    const params = new URLSearchParams();
      params.append('email', email);
    if (phone) params.append('phone', phone);
      url = `https://skip-tracing-working-api.p.rapidapi.com/search/byemail?${params.toString()}`;
    } else if (phone) {
      // Phone-based search
      const params = new URLSearchParams();
      params.append('phone', phone);
      url = `https://skip-tracing-working-api.p.rapidapi.com/search/byphone?${params.toString()}`;
    } else {
      const origin = request.headers.get('origin');
      return NextResponse.json(
        { error: 'Either email, phone, name, or person_id parameter is required' },
        { status: 400, headers: getCorsHeaders(origin) }
      );
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'skip-tracing-working-api.p.rapidapi.com',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SKIP-TRACING] API error ${response.status}:`, errorText.substring(0, 500));
      const origin = request.headers.get('origin');
      return NextResponse.json(
        { 
          success: false,
          error: `RapidAPI error: ${response.statusText}`, 
          details: errorText.substring(0, 1000),
          status: response.status 
        },
        { status: response.status, headers: getCorsHeaders(origin) }
      );
    }

    // API always returns valid JSON - parse directly
    const data = await response.json();
    console.log(`[SKIP-TRACING] Response keys:`, Object.keys(data));
    console.log(`[SKIP-TRACING] Response preview:`, JSON.stringify(data).substring(0, 500));

    const origin = request.headers.get('origin');
    return NextResponse.json(
      { success: true, data },
      { headers: getCorsHeaders(origin) }
    );
  } catch (error) {
    console.error('Skip tracing API error:', error);
    const origin = request.headers.get('origin');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500, headers: getCorsHeaders(origin) }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, phone, name, citystatezip, person_id, peo_id, page } = body;
    const finalPersonId = person_id || peo_id;

    // Get API key from environment variables
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!RAPIDAPI_KEY) {
      const origin = request.headers.get('origin');
      return NextResponse.json(
        { error: 'RAPIDAPI_KEY not configured. Please add it to your .env.local file' },
        { status: 500, headers: getCorsHeaders(origin) }
      );
    }

    let url: string;
    
    // Determine which endpoint to use
    if (finalPersonId) {
      // Person details by ID (for phone numbers and full details)
      url = `https://skip-tracing-working-api.p.rapidapi.com/search/detailsbyID?peo_id=${encodeURIComponent(finalPersonId)}`;
    } else if (name && citystatezip) {
      // Name + address search (most accurate)
      const params = new URLSearchParams();
      params.append('name', name);
      params.append('citystatezip', citystatezip);
      params.append('page', page || '1');
      url = `https://skip-tracing-working-api.p.rapidapi.com/search/bynameaddress?${params.toString()}`;
    } else if (name) {
      // Name-based search
      const params = new URLSearchParams();
      params.append('name', name);
      params.append('page', page || '1');
      url = `https://skip-tracing-working-api.p.rapidapi.com/search/byname?${params.toString()}`;
    } else if (email) {
      // Email-based search
    const params = new URLSearchParams();
      params.append('email', email);
    if (phone) params.append('phone', phone);
      url = `https://skip-tracing-working-api.p.rapidapi.com/search/byemail?${params.toString()}`;
    } else if (phone) {
      // Phone-based search
      const params = new URLSearchParams();
      params.append('phone', phone);
      url = `https://skip-tracing-working-api.p.rapidapi.com/search/byphone?${params.toString()}`;
    } else {
      const origin = request.headers.get('origin');
      return NextResponse.json(
        { error: 'Either email, phone, name, person_id, or peo_id is required in request body' },
        { status: 400, headers: getCorsHeaders(origin) }
      );
    }

    const response = await fetch(url, {
      method: 'GET', // This API uses GET even for POST requests
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'skip-tracing-working-api.p.rapidapi.com',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SKIP-TRACING POST] API error ${response.status}:`, errorText.substring(0, 500));
      const origin = request.headers.get('origin');
      return NextResponse.json(
        { 
          success: false,
          error: `RapidAPI error: ${response.statusText}`, 
          details: errorText.substring(0, 1000),
          status: response.status 
        },
        { status: response.status, headers: getCorsHeaders(origin) }
      );
    }

    // API always returns valid JSON - parse directly
    const data = await response.json();
    console.log(`[SKIP-TRACING POST] Response keys:`, Object.keys(data));
    console.log(`[SKIP-TRACING POST] Response preview:`, JSON.stringify(data).substring(0, 500));

    const origin = request.headers.get('origin');
    return NextResponse.json(
      { success: true, data },
      { headers: getCorsHeaders(origin) }
    );
  } catch (error) {
    console.error('Skip tracing API error:', error);
    const origin = request.headers.get('origin');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500, headers: getCorsHeaders(origin) }
    );
  }
}

