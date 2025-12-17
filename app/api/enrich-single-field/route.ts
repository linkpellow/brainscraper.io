/**
 * API endpoint for single-field enrichment
 * Enriches phone or email for a single lead using Email Finder API (with skip-tracing fallback)
 */

import { NextRequest, NextResponse } from 'next/server';
import { geocodeCityStateToZip } from '@/utils/geocoding';

/**
 * Extract domain from email (if available)
 * Note: We don't extract domain from LinkedIn URLs to avoid extra API calls
 */
function extractDomain(email?: string): string | null {
  // Try to extract from email
  if (email && email.includes('@')) {
    const domain = email.split('@')[1];
    if (domain && domain.includes('.')) {
      return domain;
    }
  }
  
  return null;
}

/**
 * Extract first and last name from full name
 */
function parseName(fullName: string): { firstName: string; lastName: string } | null {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) {
    return null;
  }
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}

/**
 * Call Email Finder API
 */
async function callEmailFinderAPI(
  firstName: string,
  lastName: string,
  domain: string
): Promise<{ phone?: string; email?: string; error?: string }> {
  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
  
  if (!RAPIDAPI_KEY) {
    return { error: 'RAPIDAPI_KEY not configured' };
  }

  try {
    const url = `https://email-finder7.p.rapidapi.com/email-address/find-one/?personFirstName=${encodeURIComponent(firstName)}&personLastName=${encodeURIComponent(lastName)}&domain=${encodeURIComponent(domain)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'email-finder7.p.rapidapi.com',
      },
    });

    if (!response.ok) {
      // Check if it's a rate limit error
      if (response.status === 429) {
        return { error: 'RATE_LIMIT' };
      }
      const errorText = await response.text();
      return { error: `Email Finder API error: ${response.statusText}` };
    }

    const result = await response.json();
    
    // Check for API errors
    if (result.error) {
      return { error: result.error };
    }

    const data = result.payload?.data;
    if (!data) {
      return { error: 'No data returned from Email Finder API' };
    }

    // Extract phone number (first phone in array)
    let phone: string | undefined;
    if (data.phones && Array.isArray(data.phones) && data.phones.length > 0) {
      const phoneData = data.phones[0];
      phone = phoneData.phoneNumberSanitised || phoneData.phoneNumber;
      // Clean phone: remove all non-digits except leading +
      if (phone) {
        phone = phone.replace(/[^\d+]/g, '');
        // Remove leading +1 for US numbers
        if (phone.startsWith('+1')) {
          phone = phone.substring(2);
        } else if (phone.startsWith('+')) {
          phone = phone.substring(1);
        }
      }
    }

    // Extract email
    const email = data.address;

    return { phone, email };
  } catch (error) {
    console.error('Email Finder API error:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Call Skip-tracing API as fallback
 */
async function callSkipTracingAPI(
  firstName: string,
  lastName: string,
  city?: string,
  state?: string
): Promise<{ phone?: string; email?: string; error?: string }> {
  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
  
  if (!RAPIDAPI_KEY) {
    return { error: 'RAPIDAPI_KEY not configured' };
  }

  try {
    const fullName = `${firstName} ${lastName}`.trim();
    let url = '';
    
    if (city && state) {
      const citystatezip = `${city}, ${state}`;
      url = `https://skip-tracing-working-api.p.rapidapi.com/search/bynameaddress?name=${encodeURIComponent(fullName)}&citystatezip=${encodeURIComponent(citystatezip)}&page=1`;
    } else {
      url = `https://skip-tracing-working-api.p.rapidapi.com/search/byname?name=${encodeURIComponent(fullName)}&page=1`;
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
      return { error: `Skip-tracing API error: ${response.statusText}` };
    }

    const result = await response.json();
    
    if (result.error || result.success === false) {
      return { error: result.error || 'Skip-tracing API returned error' };
    }

    const data = result.data || result;
    
    // Handle new API response format: { PeopleDetails: [...], Status: 200, ... }
    let responseData: any = null;
    if (data.PeopleDetails && Array.isArray(data.PeopleDetails) && data.PeopleDetails.length > 0) {
      responseData = data.PeopleDetails[0];
    } else if (Array.isArray(data) && data.length > 0) {
      responseData = data[0];
    } else if (data && typeof data === 'object' && !data.error) {
      responseData = data;
    }

    if (!responseData) {
      return { error: 'No results from skip-tracing API' };
    }

    // Extract phone
    let phone: string | undefined;
    const phoneValue = responseData.Telephone || responseData.phone || responseData.phone_number || 
                      responseData['Phone Number'] || responseData['Phone'];
    if (phoneValue) {
      phone = String(phoneValue).replace(/[^\d+]/g, '');
      if (phone.startsWith('+1')) {
        phone = phone.substring(2);
      } else if (phone.startsWith('+')) {
        phone = phone.substring(1);
      }
      if (phone.length < 10) {
        phone = undefined;
      }
    }

    // Extract email
    const email = responseData.email || responseData.emailAddress || responseData.email_address;

    return { phone, email };
  } catch (error) {
    console.error('Skip-tracing API error:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      lead, 
      field 
    }: { 
      lead: {
        name: string;
        phone?: string;
        email?: string;
        city?: string;
        state?: string;
        zipcode?: string;
        linkedinUrl?: string;
      };
      field: 'phone' | 'email' | 'zipcode';
    } = body;

    if (!lead || !lead.name) {
      return NextResponse.json(
        { success: false, error: 'Lead name is required' },
        { status: 400 }
      );
    }

    if (!field || (field !== 'phone' && field !== 'email' && field !== 'zipcode')) {
      return NextResponse.json(
        { success: false, error: 'Field must be "phone", "email", or "zipcode"' },
        { status: 400 }
      );
    }

    // Handle zipcode enrichment (Nominatim → Geocodio → Local lookup)
    if (field === 'zipcode') {
      if (!lead.city || !lead.state) {
        return NextResponse.json(
          { success: false, error: 'City and state are required for zipcode enrichment' },
          { status: 400 }
        );
      }

      // Get Geocodio API key from environment or use provided default
      const geocodioApiKey = process.env.GEOCODIO_API_KEY || '9096555690482e699e56682ebc49d4602445584';
      
      const zipcode = await geocodeCityStateToZip(lead.city, lead.state, geocodioApiKey);
      
      if (!zipcode) {
        return NextResponse.json(
          { success: false, error: 'Could not find zipcode for this city/state combination' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        value: zipcode,
        field: 'zipcode',
      });
    }

    // Parse name
    const nameParts = parseName(lead.name);
    if (!nameParts) {
      return NextResponse.json(
        { success: false, error: 'Could not parse first and last name from lead name' },
        { status: 400 }
      );
    }

    const { firstName, lastName } = nameParts;

    // Check if we have minimum required data
    const hasLocation = (lead.city && lead.state) || lead.state;
    const domain = extractDomain(lead.email);

    if (!domain && !hasLocation) {
      return NextResponse.json(
        { success: false, error: 'Insufficient data: Need domain (from LinkedIn URL) or city/state for enrichment' },
        { status: 400 }
      );
    }

    let result: { phone?: string; email?: string; error?: string } = {};

    // Try Email Finder API first if domain is available
    if (domain) {
      console.log(`[ENRICH_SINGLE_FIELD] Trying Email Finder API with domain: ${domain}`);
      result = await callEmailFinderAPI(firstName, lastName, domain);
      
      // If rate limited or error, fallback to skip-tracing
      if (result.error && result.error !== 'RATE_LIMIT') {
        console.log(`[ENRICH_SINGLE_FIELD] Email Finder failed: ${result.error}, falling back to skip-tracing`);
        result = await callSkipTracingAPI(firstName, lastName, lead.city, lead.state);
      } else if (result.error === 'RATE_LIMIT') {
        console.log(`[ENRICH_SINGLE_FIELD] Email Finder rate limited, falling back to skip-tracing`);
        result = await callSkipTracingAPI(firstName, lastName, lead.city, lead.state);
      }
    } else {
      // No domain, use skip-tracing directly
      console.log(`[ENRICH_SINGLE_FIELD] No domain available, using skip-tracing`);
      result = await callSkipTracingAPI(firstName, lastName, lead.city, lead.state);
    }

    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    // Return the enriched value for the requested field
    const enrichedValue = field === 'phone' ? result.phone : result.email;

    if (!enrichedValue) {
      return NextResponse.json(
        { success: false, error: `Could not find ${field} for this lead` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      value: enrichedValue,
      field,
      // Also return the other field if we got it (bonus data)
      bonus: field === 'phone' ? result.email : result.phone,
    });
  } catch (error) {
    console.error('Error enriching single field:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
