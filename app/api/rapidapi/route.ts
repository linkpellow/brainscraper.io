import { NextRequest, NextResponse } from 'next/server';

/**
 * Example RapidAPI integration endpoint
 * 
 * For RapidAPI instructions, use:
 * - target: "server" (for Next.js API routes)
 * - client: "fetch" (JavaScript fetch API)
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Get RapidAPI key from environment variables
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!RAPIDAPI_KEY) {
      return NextResponse.json(
        { error: 'RAPIDAPI_KEY not configured' },
        { status: 500 }
      );
    }

    // Example RapidAPI call using fetch
    // Replace with your actual RapidAPI endpoint
    const RAPIDAPI_HOST = 'your-api-host.rapidapi.com';
    const RAPIDAPI_URL = 'https://your-api-host.rapidapi.com/endpoint';

    const response = await fetch(RAPIDAPI_URL, {
      method: 'POST', // or GET, PUT, etc.
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`RapidAPI error: ${response.statusText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

