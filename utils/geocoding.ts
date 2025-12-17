/**
 * Geocoding utility for city + state → ZIP code
 * Tries multiple free geocoding APIs in order:
 * 1. Nominatim (OpenStreetMap) - Free, no API key
 * 2. Geocodio - Free tier (2,500/day), requires API key
 * 3. Local lookup table - Free, local fallback
 */

import { lookupZipFromCityState } from './zipLookup';

/**
 * Extract ZIP code from Nominatim response
 */
function extractZipFromNominatimResponse(data: any[]): string | null {
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  // Try to find the most relevant result (usually first)
  const result = data[0];
  
  // Check address object for postal_code
  if (result.address) {
    const postalCode = result.address.postcode || result.address.postal_code;
    if (postalCode) {
      // Extract 5-digit ZIP (US format)
      const zipMatch = String(postalCode).match(/\d{5}/);
      if (zipMatch) {
        return zipMatch[0];
      }
    }
  }

  return null;
}

/**
 * Extract ZIP code from Geocodio response
 * Geocodio v1.7 response format:
 * {
 *   "results": [{
 *     "address_components": {
 *       "zip": "90210",
 *       "zip4": "1234",
 *       ...
 *     },
 *     ...
 *   }]
 * }
 */
function extractZipFromGeocodioResponse(data: any): string | null {
  if (!data || !Array.isArray(data.results) || data.results.length === 0) {
    return null;
  }

  const result = data.results[0];
  
  // Geocodio returns address_components with zip field (not postal_code)
  if (result.address_components && result.address_components.zip) {
    const zip = String(result.address_components.zip);
    // Extract 5-digit ZIP (may include ZIP+4, so take first 5 digits)
    const zipMatch = zip.match(/^(\d{5})/);
    if (zipMatch) {
      return zipMatch[1];
    }
  }

  // Fallback: check for zip in other locations
  if (result.zip) {
    const zipMatch = String(result.zip).match(/^(\d{5})/);
    if (zipMatch) {
      return zipMatch[1];
    }
  }

  return null;
}

/**
 * Geocode using Nominatim (OpenStreetMap)
 * Free, no API key required
 * Rate limit: ~1 request per second
 */
async function geocodeWithNominatim(
  city: string,
  state: string
): Promise<{ zipcode: string | null; error?: string }> {
  try {
    // Build query: "City, State, USA"
    const query = `${city}, ${state}, USA`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=1&countrycodes=us`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'BrainScraper/1.0 (contact@brainscraper.io)', // Required by Nominatim
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      // Check for rate limiting (429)
      if (response.status === 429) {
        return { zipcode: null, error: 'RATE_LIMIT' };
      }
      return { zipcode: null, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const zipcode = extractZipFromNominatimResponse(data);

    if (zipcode) {
      console.log(`[GEOCODING] Nominatim found ZIP: ${zipcode} for ${city}, ${state}`);
      return { zipcode };
    }

    return { zipcode: null, error: 'No ZIP code found in response' };
  } catch (error) {
    console.error('[GEOCODING] Nominatim error:', error);
    return { zipcode: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Geocode using Geocodio
 * Free tier: 2,500 requests/day
 * Requires API key
 */
async function geocodeWithGeocodio(
  city: string,
  state: string,
  apiKey: string
): Promise<{ zipcode: string | null; error?: string }> {
  try {
    // Build query: "City, State"
    const query = `${city}, ${state}`;
    const url = `https://api.geocod.io/v1.7/geocode?q=${encodeURIComponent(query)}&api_key=${apiKey}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      // Check for rate limiting (429) or quota exceeded
      if (response.status === 429) {
        return { zipcode: null, error: 'RATE_LIMIT' };
      }
      if (response.status === 402) {
        return { zipcode: null, error: 'QUOTA_EXCEEDED' };
      }
      const errorText = await response.text().catch(() => 'Unknown error');
      return { zipcode: null, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const zipcode = extractZipFromGeocodioResponse(data);

    if (zipcode) {
      console.log(`[GEOCODING] Geocodio found ZIP: ${zipcode} for ${city}, ${state}`);
      return { zipcode };
    }

    return { zipcode: null, error: 'No ZIP code found in response' };
  } catch (error) {
    console.error('[GEOCODING] Geocodio error:', error);
    return { zipcode: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Main geocoding function
 * Tries Nominatim → Geocodio → Local lookup
 */
export async function geocodeCityStateToZip(
  city: string,
  state: string,
  geocodioApiKey?: string
): Promise<string | null> {
  if (!city || !state) {
    return null;
  }

  // Try Nominatim first (free, no API key)
  // Note: Nominatim requires ~1 request per second rate limiting
  console.log(`[GEOCODING] Trying Nominatim for ${city}, ${state}`);
  const nominatimResult = await geocodeWithNominatim(city, state);
  
  if (nominatimResult.zipcode) {
    return nominatimResult.zipcode;
  }

  // Always wait 1 second after Nominatim (respect their rate limit)
  // This prevents hitting rate limits if multiple requests come in
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  if (nominatimResult.error === 'RATE_LIMIT') {
    console.log('[GEOCODING] Nominatim rate limited, waiting additional second before trying Geocodio');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Try Geocodio if API key is provided
  if (geocodioApiKey) {
    console.log(`[GEOCODING] Trying Geocodio for ${city}, ${state}`);
    const geocodioResult = await geocodeWithGeocodio(city, state, geocodioApiKey);
    
    if (geocodioResult.zipcode) {
      return geocodioResult.zipcode;
    }

    // If rate limited or quota exceeded, log but continue to fallback
    if (geocodioResult.error === 'RATE_LIMIT' || geocodioResult.error === 'QUOTA_EXCEEDED') {
      console.log(`[GEOCODING] Geocodio ${geocodioResult.error}, falling back to local lookup`);
    }
  }

  // Fallback to local lookup (state centroid or lookup table)
  console.log(`[GEOCODING] Falling back to local lookup for ${city}, ${state}`);
  const localZip = lookupZipFromCityState(city, state);
  
  if (localZip) {
    console.log(`[GEOCODING] Local lookup found ZIP: ${localZip} for ${city}, ${state}`);
    return localZip;
  }

  console.log(`[GEOCODING] No ZIP code found for ${city}, ${state}`);
  return null;
}
