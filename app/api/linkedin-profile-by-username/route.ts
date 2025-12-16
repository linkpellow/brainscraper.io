import { NextRequest, NextResponse } from 'next/server';

/**
 * LinkedIn Profile Data API by Username
 * Uses RapidAPI linkedin-data-api (rockapis)
 * 
 * API: https://rapidapi.com/rockapis-rockapis-default/api/linkedin-data-api
 * Endpoint: GET /?username={username}
 * 
 * This endpoint may return location/geo data that can help with location ID discovery
 */

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { error: 'username parameter is required' },
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

    const url = `https://linkedin-data-api.p.rapidapi.com/?username=${encodeURIComponent(username)}`;

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
        { 
          error: `RapidAPI error: ${response.statusText}`, 
          details: errorText,
          status: response.status 
        },
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

    // Check if response contains location/geo data
    const locationData = extractLocationData(data);
    
    return NextResponse.json({
      success: true,
      data: data,
      locationInfo: locationData, // Extracted location data if found
    });
  } catch (error) {
    console.error('LinkedIn profile by username API error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        success: false,
      },
      { status: 500 }
    );
  }
}

/**
 * Extracts location/geo data from API response
 * Looks for various possible location field names and geo IDs
 */
function extractLocationData(data: any): {
  location?: string;
  geoId?: string;
  locationId?: string;
  geoUrn?: string;
  fullLocation?: any;
} | null {
  if (!data || typeof data !== 'object') return null;

  const locationInfo: any = {};

  // Common location field names
  const locationFields = [
    'location',
    'geoLocation',
    'geo_location',
    'locationName',
    'location_name',
    'currentLocation',
    'current_location',
    'address',
    'city',
    'state',
    'country',
  ];

  // Common geo ID field names
  const geoIdFields = [
    'geoId',
    'geo_id',
    'locationId',
    'location_id',
    'geoUrn',
    'geo_urn',
    'geoLocationId',
    'geo_location_id',
  ];

  // Search for location text
  for (const field of locationFields) {
    if (data[field]) {
      locationInfo.location = String(data[field]);
      break;
    }
  }

  // Search for geo ID
  for (const field of geoIdFields) {
    if (data[field]) {
      const geoId = String(data[field]);
      locationInfo.geoId = geoId;
      
      // If it's already in URN format, extract the ID
      const urnMatch = geoId.match(/urn:li:fs_geo:(\d+)/);
      if (urnMatch) {
        locationInfo.locationId = urnMatch[1];
        locationInfo.geoUrn = geoId;
      } else if (/^\d+$/.test(geoId)) {
        // It's just a numeric ID
        locationInfo.locationId = geoId;
        locationInfo.geoUrn = `urn:li:fs_geo:${geoId}`;
      }
      break;
    }
  }

  // Check nested objects
  if (data.profile) {
    const profileLocation = extractLocationData(data.profile);
    if (profileLocation) {
      Object.assign(locationInfo, profileLocation);
    }
  }

  if (data.data) {
    const dataLocation = extractLocationData(data.data);
    if (dataLocation) {
      Object.assign(locationInfo, dataLocation);
    }
  }

  // If we found any location data, return it
  if (Object.keys(locationInfo).length > 0) {
    locationInfo.fullLocation = data; // Include full response for debugging
    return locationInfo;
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username } = body;

    if (!username) {
      return NextResponse.json(
        { error: 'username parameter is required in request body' },
        { status: 400 }
      );
    }

    // Use GET logic
    const searchParams = new URLSearchParams();
    searchParams.set('username', username);

    const getRequest = new NextRequest(
      new URL(`/api/linkedin-profile-by-username?${searchParams.toString()}`, request.url)
    );

    return await GET(getRequest);
  } catch (error) {
    console.error('LinkedIn profile by username POST error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        success: false,
      },
      { status: 500 }
    );
  }
}

