/**
 * Enriches scraped LinkedIn leads with location/geo data from linkedin-data-api
 * Extracts geo IDs from profile responses to build location database
 */

import { extractLinkedInUsername, extractUsernamesFromLeads } from './extractLinkedInUsername';
import { extractGeoIdFromProfile } from './linkedinLocationDiscovery';

/**
 * Extracts location data from API response (same logic as API route)
 */
function extractLocationDataFromResponse(data: any): {
  location?: string;
  geoId?: string;
  locationId?: string;
  geoUrn?: string;
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
    const profileLocation = extractLocationDataFromResponse(data.profile);
    if (profileLocation) {
      Object.assign(locationInfo, profileLocation);
    }
  }

  if (data.data) {
    const dataLocation = extractLocationDataFromResponse(data.data);
    if (dataLocation) {
      Object.assign(locationInfo, dataLocation);
    }
  }

  // If we found any location data, return it
  if (Object.keys(locationInfo).length > 0) {
    return locationInfo;
  }

  return null;
}

export interface LocationEnrichmentResult {
  username: string;
  location?: string;
  geoId?: string;
  locationId?: string;
  geoUrn?: string;
  success: boolean;
  error?: string;
}

/**
 * Enriches a single lead with location data by fetching profile via username
 * This is called server-side, so we can directly call the RapidAPI
 */
export async function enrichLeadWithLocation(
  username: string,
  rapidApiKey: string
): Promise<LocationEnrichmentResult> {
  if (!username || !rapidApiKey) {
    return {
      username,
      success: false,
      error: 'Missing username or API key',
    };
  }

  try {
    // Call RapidAPI directly (we're server-side)
    const url = `https://linkedin-data-api.p.rapidapi.com/?username=${encodeURIComponent(username)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': 'linkedin-data-api.p.rapidapi.com',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        username,
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const resultText = await response.text();
    let data: any;
    try {
      data = JSON.parse(resultText);
    } catch {
      data = { raw: resultText };
    }

    // Extract location info from the response using the same logic as the API route
    const locationInfo = extractLocationDataFromResponse(data);
    const geoId = extractGeoIdFromProfile(data);

    return {
      username,
      location: locationInfo?.location || undefined,
      geoId: locationInfo?.geoId || geoId || undefined,
      locationId: locationInfo?.locationId || geoId || undefined,
      geoUrn: locationInfo?.geoUrn || (geoId ? `urn:li:fs_geo:${geoId}` : undefined),
      success: true,
    };
  } catch (error) {
    return {
      username,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Enriches multiple leads with location data (batched for efficiency)
 */
export async function enrichLeadsWithLocationData(
  leads: any[],
  rapidApiKey: string,
  batchSize: number = 5,
  onProgress?: (current: number, total: number) => void
): Promise<{
  enriched: Map<string, LocationEnrichmentResult>;
  locationDatabase: Map<string, string>; // location -> geoId mapping
}> {
  const usernames = extractUsernamesFromLeads(leads);
  const enriched = new Map<string, LocationEnrichmentResult>();
  const locationDatabase = new Map<string, string>();

  if (usernames.length === 0) {
    return { enriched, locationDatabase };
  }

  // Process in batches to avoid rate limiting
  for (let i = 0; i < usernames.length; i += batchSize) {
    const batch = usernames.slice(i, i + batchSize);
    
    const promises = batch.map(username =>
      enrichLeadWithLocation(username, rapidApiKey)
    );

    const batchResults = await Promise.all(promises);

    for (const result of batchResults) {
      enriched.set(result.username, result);

      // Build location database from successful enrichments
      if (result.success && result.location && result.locationId) {
        // Store location -> geoId mapping
        const locationKey = result.location.toLowerCase().trim();
        if (!locationDatabase.has(locationKey)) {
          locationDatabase.set(locationKey, result.locationId);
        }

        // Also store city/state variations
        const locationParts = result.location.split(',').map(s => s.trim());
        if (locationParts.length > 1) {
          const state = locationParts[1];
          const stateKey = state.toLowerCase();
          if (!locationDatabase.has(stateKey)) {
            locationDatabase.set(stateKey, result.locationId);
          }
        }
      }
    }

    // Report progress
    if (onProgress) {
      onProgress(Math.min(i + batchSize, usernames.length), usernames.length);
    }

    // Rate limiting: wait between batches
    if (i + batchSize < usernames.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return { enriched, locationDatabase };
}

/**
 * Updates leads with enriched location data
 */
export function updateLeadsWithLocationData(
  leads: any[],
  enrichmentResults: Map<string, LocationEnrichmentResult>
): any[] {
  return leads.map(lead => {
    // Find username from lead
    const urlFields = [
      'LinkedIn URL',
      'linkedin_url',
      'linkedinUrl',
      'navigationUrl',
      'profile_url',
      'profileUrl',
      'url',
    ];

    let username: string | null = null;
    for (const field of urlFields) {
      const url = lead[field];
      if (url) {
        username = extractLinkedInUsername(String(url));
        if (username) break;
      }
    }

    if (!username) return lead;

    const enrichment = enrichmentResults.get(username);
    if (!enrichment || !enrichment.success) return lead;

    // Update lead with location data
    const updated = { ...lead };

    if (enrichment.location) {
      updated.location = enrichment.location;
      updated['Location'] = enrichment.location;
    }

    if (enrichment.geoId) {
      updated.geoId = enrichment.geoId;
      updated.locationId = enrichment.locationId;
      updated.geoUrn = enrichment.geoUrn;
    }

    return updated;
  });
}

