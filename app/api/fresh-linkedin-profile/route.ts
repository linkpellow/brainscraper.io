import { NextRequest, NextResponse } from 'next/server';

/**
 * Fresh LinkedIn Profile Data API endpoint
 * Enriches leads with LinkedIn profile data
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
    const linkedinUrl = searchParams.get('linkedin_url');
    
    // Optional parameters - all default to false for faster responses
    const includeSkills = searchParams.get('include_skills') || 'false';
    const includeCertifications = searchParams.get('include_certifications') || 'false';
    const includePublications = searchParams.get('include_publications') || 'false';
    const includeHonors = searchParams.get('include_honors') || 'false';
    const includeVolunteers = searchParams.get('include_volunteers') || 'false';
    const includeProjects = searchParams.get('include_projects') || 'false';
    const includePatents = searchParams.get('include_patents') || 'false';
    const includeCourses = searchParams.get('include_courses') || 'false';
    const includeOrganizations = searchParams.get('include_organizations') || 'false';
    const includeProfileStatus = searchParams.get('include_profile_status') || 'false';
    const includeCompanyPublicUrl = searchParams.get('include_company_public_url') || 'false';

    if (!linkedinUrl) {
      return NextResponse.json(
        { error: 'linkedin_url parameter (LinkedIn profile URL) is required' },
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

    // Build URL with all parameters
    const params = new URLSearchParams();
    params.append('linkedin_url', linkedinUrl);
    params.append('include_skills', includeSkills);
    params.append('include_certifications', includeCertifications);
    params.append('include_publications', includePublications);
    params.append('include_honors', includeHonors);
    params.append('include_volunteers', includeVolunteers);
    params.append('include_projects', includeProjects);
    params.append('include_patents', includePatents);
    params.append('include_courses', includeCourses);
    params.append('include_organizations', includeOrganizations);
    params.append('include_profile_status', includeProfileStatus);
    params.append('include_company_public_url', includeCompanyPublicUrl);

    const url = `https://fresh-linkedin-profile-data.p.rapidapi.com/enrich-lead?${params.toString()}`;

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

    return NextResponse.json(data);
  } catch (error) {
    console.error('Fresh LinkedIn profile API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { linkedin_url, ...options } = body;

    if (!linkedin_url) {
      return NextResponse.json(
        { error: 'linkedin_url (LinkedIn profile URL) is required in request body' },
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

    // Build URL with parameters (default all to false for faster responses)
    const params = new URLSearchParams();
    params.append('linkedin_url', linkedin_url);
    params.append('include_skills', String(options.include_skills || false));
    params.append('include_certifications', String(options.include_certifications || false));
    params.append('include_publications', String(options.include_publications || false));
    params.append('include_honors', String(options.include_honors || false));
    params.append('include_volunteers', String(options.include_volunteers || false));
    params.append('include_projects', String(options.include_projects || false));
    params.append('include_patents', String(options.include_patents || false));
    params.append('include_courses', String(options.include_courses || false));
    params.append('include_organizations', String(options.include_organizations || false));
    params.append('include_profile_status', String(options.include_profile_status || false));
    params.append('include_company_public_url', String(options.include_company_public_url || false));

    const url = `https://fresh-linkedin-profile-data.p.rapidapi.com/enrich-lead?${params.toString()}`;

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

    return NextResponse.json(data);
  } catch (error) {
    console.error('Fresh LinkedIn profile API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

