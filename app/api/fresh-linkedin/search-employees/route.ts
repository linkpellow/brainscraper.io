import { NextRequest, NextResponse } from 'next/server';

/**
 * Fresh LinkedIn Profile Data API - Big Search Employee endpoint
 * Searches for employees by company IDs and title keywords
 * Uses RapidAPI fresh-linkedin-profile-data
 * 
 * API: https://rapidapi.com/freshdata-freshdata-default/api/fresh-linkedin-profile-data
 * 
 * For RapidAPI setup:
 * - target: "server"
 * - client: "fetch"
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { current_company_ids, title_keywords, ...otherParams } = body;

    if (!current_company_ids || !Array.isArray(current_company_ids) || current_company_ids.length === 0) {
      return NextResponse.json(
        { error: 'current_company_ids (array of company IDs) is required in request body' },
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

    // Build request body
    const requestBody: any = {
      current_company_ids,
      ...otherParams,
    };

    // Add title_keywords if provided
    if (title_keywords && Array.isArray(title_keywords)) {
      requestBody.title_keywords = title_keywords;
    }

    const url = 'https://fresh-linkedin-profile-data.p.rapidapi.com/big-search-employee';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'fresh-linkedin-profile-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
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
    console.error('Fresh LinkedIn search employees API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

