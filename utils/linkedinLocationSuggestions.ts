/**
 * LinkedIn Location Suggestions Service
 * 
 * Uses RapidAPI filter_geography_location_region_suggestions endpoint
 * to get location suggestions and discover location IDs efficiently.
 */

const RAPIDAPI_BASE = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com';

export interface LocationSuggestion {
  id: string; // Location ID (numeric or URN)
  text: string; // Location name
  fullId?: string; // Full URN format: urn:li:fs_geo:XXXXX
}

export interface LocationSuggestionsResponse {
  suggestions?: LocationSuggestion[];
  data?: LocationSuggestion[];
  results?: LocationSuggestion[];
}

/**
 * Get location suggestions from RapidAPI
 * This is faster than json_to_url for location discovery
 */
export async function getLocationSuggestions(
  query: string,
  rapidApiKey: string
): Promise<LocationSuggestion[]> {
  if (!query || !rapidApiKey) {
    return [];
  }

  try {
    const response = await fetch(
      `${RAPIDAPI_BASE}/filter_geography_location_region_suggestions`,
      {
        method: 'POST',
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      }
    );

    if (!response.ok) {
      console.warn(`Location suggestions API returned ${response.status}`);
      return [];
    }

    const result = await response.text();
    let data: LocationSuggestionsResponse;
    
    try {
      data = JSON.parse(result);
    } catch {
      return [];
    }

    // Handle different response structures
    const suggestions = 
      data.suggestions || 
      data.data || 
      data.results || 
      (Array.isArray(data) ? data : []);

    // Normalize suggestions to include fullId
    // Verified format: id: "100809221" for Maryland, displayValue: "Maryland, United States"
    return suggestions.map((suggestion: any) => {
      // Extract ID from verified response structure
      const locationId = suggestion.id || '';
      
      // Convert to URN format: urn:li:fs_geo:100809221
      const fullId = locationId ? `urn:li:fs_geo:${locationId}` : undefined;
      
      return {
        id: locationId,
        text: suggestion.displayValue || suggestion.text || suggestion.name || suggestion.headline || String(locationId),
        fullId: fullId || (suggestion.fullId && suggestion.fullId.startsWith('urn:li:fs_geo:') ? suggestion.fullId : undefined),
      };
    });
  } catch (error) {
    console.error('Error getting location suggestions:', error);
    return [];
  }
}

/**
 * Find location by exact match using suggestions
 * Faster than json_to_url discovery
 */
export async function findLocationByExactMatch(
  locationText: string,
  rapidApiKey: string
): Promise<LocationSuggestion | null> {
  if (!locationText || !rapidApiKey) {
    return null;
  }

  // Try exact match first
  const exactSuggestions = await getLocationSuggestions(locationText, rapidApiKey);
  
  // Find exact match (case-insensitive)
  const normalizedQuery = locationText.toLowerCase().trim();
  const exactMatch = exactSuggestions.find(s => 
    s.text.toLowerCase().trim() === normalizedQuery
  );
  
  if (exactMatch) {
    return exactMatch;
  }

  // Try with variations (state abbreviation, etc.)
  const locationParts = locationText.split(',').map(p => p.trim());
  
  // Try each part
  for (const part of locationParts) {
    if (part.length < 2) continue;
    
    const partSuggestions = await getLocationSuggestions(part, rapidApiKey);
    const match = partSuggestions.find(s => 
      s.text.toLowerCase().includes(normalizedQuery) ||
      normalizedQuery.includes(s.text.toLowerCase())
    );
    
    if (match) {
      return match;
    }
  }

  return null;
}

/**
 * Get multiple location suggestions for autocomplete
 */
export async function getLocationAutocomplete(
  query: string,
  rapidApiKey: string,
  limit: number = 10
): Promise<LocationSuggestion[]> {
  const suggestions = await getLocationSuggestions(query, rapidApiKey);
  return suggestions.slice(0, limit);
}
