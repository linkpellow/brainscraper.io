import { NextRequest, NextResponse } from 'next/server';

/**
 * LinkedIn Location ID Search API
 * Uses multiple RapidAPI services to discover LinkedIn location IDs
 * 
 * APIs:
 * 1. HarvestAPI - geo-id-search endpoint
 * 2. saleLeads.ai - search/location endpoint
 * 
 * This endpoint helps discover location IDs when the standard discovery fails
 */

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const location = searchParams.get('location');
    const provider = searchParams.get('provider') || 'harvest'; // 'harvest' or 'saleleads'

    if (!location) {
      return NextResponse.json(
        { error: 'location parameter is required' },
        { status: 400 }
      );
    }

    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!RAPIDAPI_KEY) {
      return NextResponse.json(
        { error: 'RAPIDAPI_KEY not configured' },
        { status: 500 }
      );
    }

    let result;

    if (provider === 'harvest') {
      // Try HarvestAPI geo-id-search endpoint
      try {
        const response = await fetch(
          `https://harvest-api.p.rapidapi.com/linkedin/geo-id/search?location=${encodeURIComponent(location)}`,
          {
            method: 'GET',
            headers: {
              'x-rapidapi-key': RAPIDAPI_KEY,
              'x-rapidapi-host': 'harvest-api.p.rapidapi.com',
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          result = {
            provider: 'harvest',
            success: true,
            data: data,
          };
        } else {
          throw new Error(`HarvestAPI returned ${response.status}`);
        }
      } catch (error) {
        // Fallback to saleLeads if HarvestAPI fails
        return await trySaleLeads(location, RAPIDAPI_KEY);
      }
    } else {
      // Try saleLeads.ai
      return await trySaleLeads(location, RAPIDAPI_KEY);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('LinkedIn location search error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        success: false,
      },
      { status: 500 }
    );
  }
}

async function trySaleLeads(location: string, rapidApiKey: string) {
  try {
    const response = await fetch(
      `https://saleleads-ai.p.rapidapi.com/search/location?query=${encodeURIComponent(location)}`,
      {
        method: 'GET',
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': 'saleleads-ai.p.rapidapi.com',
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({
        provider: 'saleleads',
        success: true,
        data: data,
      });
    } else {
      throw new Error(`saleLeads API returned ${response.status}`);
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Both location search APIs failed',
        success: false,
        providers: ['harvest', 'saleleads'],
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { location, provider } = body;

    if (!location) {
      return NextResponse.json(
        { error: 'location parameter is required in request body' },
        { status: 400 }
      );
    }

    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!RAPIDAPI_KEY) {
      return NextResponse.json(
        { error: 'RAPIDAPI_KEY not configured' },
        { status: 500 }
      );
    }

    // Use GET logic
    const searchParams = new URLSearchParams();
    searchParams.set('location', location);
    if (provider) searchParams.set('provider', provider);

    const getRequest = new NextRequest(
      new URL(`/api/linkedin-location-search?${searchParams.toString()}`, request.url)
    );

    return await GET(getRequest);
  } catch (error) {
    console.error('LinkedIn location search POST error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        success: false,
      },
      { status: 500 }
    );
  }
}

