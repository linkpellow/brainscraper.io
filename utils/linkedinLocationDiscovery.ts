/**
 * LinkedIn Location ID Discovery Service
 * 
 * Production-ready solution for discovering LinkedIn location IDs dynamically.
 * Uses the json_to_url endpoint to reverse-engineer location IDs from generated URLs.
 * 
 * Strategy:
 * 1. Check cache first (fastest)
 * 2. Discover via json_to_url (accurate)
 * 3. Fallback to keywords (always works)
 */

import { LocationMapping } from './linkedinLocationIds';

export interface DiscoveryResult {
  locationId: string | null;
  fullId: string | null; // urn:li:fs_geo:<id>
  source: 'cache' | 'discovered' | 'failed';
  url?: string; // The generated Sales Navigator URL
}

/**
 * Extracts location ID from Sales Navigator URL
 * URLs may contain location IDs in various formats:
 * - Query parameters: ?geo=urn:li:fs_geo:103644278
 * - Path segments: /geo/103644278
 * - Encoded filters: filters=%5B%7B%22type%22%3A%22LOCATION%22...
 */
export function extractLocationIdFromUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null;

  try {
    const urlObj = new URL(url);
    
    // Strategy 1: Check query parameters
    const queryParams = ['geo', 'location', 'filters', 'f', 'loc'];
    for (const param of queryParams) {
      const value = urlObj.searchParams.get(param);
      if (value) {
        // Try to extract ID from various formats
        const match = value.match(/urn:li:fs_geo:(\d+)|geo[=:](\d+)|(\d{8,})/);
        if (match) {
          return match[1] || match[2] || match[3];
        }
      }
    }

    // Strategy 2: Check for encoded JSON in filters parameter
    const filtersParam = urlObj.searchParams.get('filters');
    if (filtersParam) {
      try {
        const decoded = decodeURIComponent(filtersParam);
        const filters = JSON.parse(decoded);
        if (Array.isArray(filters)) {
          for (const filter of filters) {
            if (filter.type === 'LOCATION' && filter.values) {
              for (const value of filter.values) {
                if (value.id) {
                  const idMatch = value.id.match(/urn:li:fs_geo:(\d+)|(\d{8,})/);
                  if (idMatch) {
                    return idMatch[1] || idMatch[2];
                  }
                }
              }
            }
          }
        }
      } catch {
        // Not JSON, continue
      }
    }

    // Strategy 3: Check path segments
    const pathMatch = url.match(/[\/=:]geo[\/=:](\d+)|location[\/=:](\d+)|urn:li:fs_geo:(\d+)/i);
    if (pathMatch) {
      return pathMatch[1] || pathMatch[2] || pathMatch[3];
    }

    // Strategy 4: Search entire URL for location ID pattern
    const globalMatch = url.match(/urn:li:fs_geo:(\d{8,})/);
    if (globalMatch) {
      return globalMatch[1];
    }

    return null;
  } catch (error) {
    console.error('Error parsing URL for location ID:', error);
    return null;
  }
}

/**
 * Attempts to discover location ID by searching for a profile in that location
 * Uses linkedin-data-api username endpoint to find profiles and extract their location geo IDs
 * This is a creative approach: find someone in the location, get their geo ID
 */
async function discoverLocationIdViaProfileSearch(
  locationText: string,
  rapidApiKey: string
): Promise<DiscoveryResult | null> {
  // This is a fallback method - try to find a profile in the location
  // and extract the geo ID from their profile data
  // Note: This requires knowing a username in that location, which we don't have
  // So this is more of a helper if we already have profile data
  return null;
}

/**
 * Extracts location geo ID from a LinkedIn profile response
 * Useful when we get profile data that includes location information
 */
export function extractGeoIdFromProfile(profileData: any): string | null {
  if (!profileData || typeof profileData !== 'object') return null;

  // Check common geo ID fields
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

  for (const field of geoIdFields) {
    if (profileData[field]) {
      const geoId = String(profileData[field]);
      
      // Extract numeric ID from URN format
      const urnMatch = geoId.match(/urn:li:fs_geo:(\d+)/);
      if (urnMatch) {
        return urnMatch[1];
      }
      
      // If it's just numeric, return it
      if (/^\d+$/.test(geoId)) {
        return geoId;
      }
    }
  }

  // Check nested objects
  if (profileData.profile) {
    const nested = extractGeoIdFromProfile(profileData.profile);
    if (nested) return nested;
  }

  if (profileData.data) {
    const nested = extractGeoIdFromProfile(profileData.data);
    if (nested) return nested;
  }

  if (profileData.locationInfo) {
    return extractGeoIdFromProfile(profileData.locationInfo);
  }

  return null;
}

/**
 * Discovers LinkedIn location ID using filter_geography_location_region_suggestions
 * This is the fastest and most accurate method
 */
async function discoverLocationIdViaSuggestions(
  locationText: string,
  rapidApiKey: string
): Promise<DiscoveryResult | null> {
  try {
    const { findLocationByExactMatch } = await import('./linkedinLocationSuggestions');
    const suggestion = await findLocationByExactMatch(locationText, rapidApiKey);
    
    if (suggestion && suggestion.fullId) {
      const idMatch = suggestion.fullId.match(/urn:li:fs_geo:(\d+)/);
      if (idMatch) {
        return {
          locationId: idMatch[1],
          fullId: suggestion.fullId,
          source: 'discovered',
        };
      }
    }
  } catch (error) {
    console.log(`Location suggestions API failed for "${locationText}":`, error);
  }
  
  return null;
}

/**
 * Discovers LinkedIn location ID using dedicated location search APIs
 * Tries multiple APIs in order: Suggestions API, HarvestAPI, saleLeads.ai, then json_to_url fallback
 */
async function discoverLocationIdViaSearchAPIs(
  locationText: string,
  rapidApiKey: string
): Promise<DiscoveryResult | null> {
  // Try location suggestions API first (fastest and most accurate)
  const suggestionsResult = await discoverLocationIdViaSuggestions(locationText, rapidApiKey);
  if (suggestionsResult) {
    return suggestionsResult;
  }
  // Try HarvestAPI first (most reliable for location IDs)
  try {
    const harvestResponse = await fetch(
      `https://harvest-api.p.rapidapi.com/linkedin/geo-id/search?location=${encodeURIComponent(locationText)}`,
      {
        method: 'GET',
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': 'harvest-api.p.rapidapi.com',
        },
      }
    );

    if (harvestResponse.ok) {
      const data = await harvestResponse.json();
      // Extract location ID from HarvestAPI response
      // Response format may vary, so we'll try multiple extraction methods
      let locationId: string | null = null;
      
      if (data.geoId) {
        locationId = String(data.geoId);
      } else if (data.id) {
        locationId = String(data.id);
      } else if (data.data?.geoId) {
        locationId = String(data.data.geoId);
      } else if (data.data?.id) {
        locationId = String(data.data.id);
      } else if (Array.isArray(data) && data.length > 0) {
        // If it's an array, take the first result
        locationId = String(data[0].geoId || data[0].id || '');
      }

      if (locationId && /^\d+$/.test(locationId)) {
        return {
          locationId,
          fullId: `urn:li:fs_geo:${locationId}`,
          source: 'discovered',
        };
      }
    }
  } catch (error) {
    console.log(`HarvestAPI location search failed for "${locationText}":`, error);
  }

  // Try saleLeads.ai as fallback
  try {
    const saleLeadsResponse = await fetch(
      `https://saleleads-ai.p.rapidapi.com/search/location?query=${encodeURIComponent(locationText)}`,
      {
        method: 'GET',
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': 'saleleads-ai.p.rapidapi.com',
        },
      }
    );

    if (saleLeadsResponse.ok) {
      const data = await saleLeadsResponse.json();
      // Extract location ID from saleLeads response
      let locationId: string | null = null;
      
      if (data.geoId) {
        locationId = String(data.geoId);
      } else if (data.id) {
        locationId = String(data.id);
      } else if (data.data?.geoId) {
        locationId = String(data.data.geoId);
      } else if (Array.isArray(data) && data.length > 0) {
        locationId = String(data[0].geoId || data[0].id || '');
      }

      if (locationId && /^\d+$/.test(locationId)) {
        return {
          locationId,
          fullId: `urn:li:fs_geo:${locationId}`,
          source: 'discovered',
        };
      }
    }
  } catch (error) {
    console.log(`saleLeads location search failed for "${locationText}":`, error);
  }

  return null;
}

/**
 * Discovers LinkedIn location ID using json_to_url endpoint
 * This is the fallback discovery mechanism - let the API tell us the correct ID
 */
export async function discoverLocationId(
  locationText: string,
  rapidApiKey: string
): Promise<DiscoveryResult> {
  // First, try dedicated location search APIs (faster and more reliable)
  const searchApiResult = await discoverLocationIdViaSearchAPIs(locationText, rapidApiKey);
  if (searchApiResult) {
    return searchApiResult;
  }
  if (!locationText || !rapidApiKey) {
    return {
      locationId: null,
      fullId: null,
      source: 'failed',
    };
  }

  try {
    // Parse location to extract city, state, country
    const locationParts = locationText.split(',').map(s => s.trim());
    const city = locationParts[0] || '';
    const state = locationParts[1] || '';
    const country = locationParts[2] || locationParts[1] || '';
    
    // Build multiple location format variations to try
    const testFormats: Array<{ id: string; text: string }> = [
      // Original full location
      { id: locationText, text: locationText },
      // City, State format
      ...(city && state ? [{ id: `${city}, ${state}`, text: `${city}, ${state}` }] : []),
      // State only (broader, more likely to work)
      ...(state ? [{ id: state, text: state }] : []),
      // City only
      ...(city ? [{ id: city, text: city }] : []),
      // Normalized formats
      { id: locationText.toLowerCase().replace(/\s+/g, '_'), text: locationText },
      { id: locationText.toLowerCase().replace(/[^a-z0-9]/g, '_'), text: locationText },
      // US prefix formats
      { id: `us:${locationText}`, text: locationText },
      ...(state ? [{ id: `us:${state}`, text: state }] : []),
      // State abbreviation lookup (if we can detect it)
      ...(state && state.length <= 3 ? [{ id: state, text: state }] : []),
    ];
    
    // Remove duplicates
    const uniqueFormats = Array.from(
      new Map(testFormats.map(f => [f.id, f])).values()
    );

    for (const format of uniqueFormats) {
      try {
        const response = await fetch(
          'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/json_to_url',
          {
            method: 'POST',
            headers: {
              'x-rapidapi-key': rapidApiKey,
              'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              filters: [
                {
                  type: 'LOCATION',
                  values: [
                    {
                      id: format.id,
                      text: format.text,
                      selectionType: 'INCLUDED',
                    },
                  ],
                },
              ],
              keywords: '',
            }),
          }
        );

        if (!response.ok) {
          continue; // Try next format
        }

        const result = await response.text();
        let data;
        try {
          data = JSON.parse(result);
        } catch {
          data = { url: result };
        }

        const url = data.url || data.data?.url || (typeof data === 'string' ? data : null);
        
        if (url && typeof url === 'string') {
          const locationId = extractLocationIdFromUrl(url);
          if (locationId) {
            return {
              locationId,
              fullId: `urn:li:fs_geo:${locationId}`,
              source: 'discovered',
              url,
            };
          }
        }
      } catch (error) {
        console.error(`Error discovering location ID with format ${format.id}:`, error);
        continue; // Try next format
      }
    }

    return {
      locationId: null,
      fullId: null,
      source: 'failed',
    };
  } catch (error) {
    console.error('Error in discoverLocationId:', error);
    return {
      locationId: null,
      fullId: null,
      source: 'failed',
    };
  }
}

/**
 * Cache for discovered location IDs
 * In production, this could be a database, Redis, or file-based cache
 */
class LocationIdCache {
  private cache: Map<string, { id: string; fullId: string; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

  /**
   * Get cached location ID
   */
  get(locationText: string): string | null {
    const normalized = this.normalizeKey(locationText);
    const cached = this.cache.get(normalized);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.fullId;
    }
    
    // Remove expired entry
    if (cached) {
      this.cache.delete(normalized);
    }
    
    return null;
  }

  /**
   * Store location ID in cache
   */
  set(locationText: string, locationId: string, fullId: string): void {
    const normalized = this.normalizeKey(locationText);
    this.cache.set(normalized, {
      id: locationId,
      fullId,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if location is in cache (without expiration check)
   */
  has(locationText: string): boolean {
    return this.cache.has(this.normalizeKey(locationText));
  }

  /**
   * Normalize location text for cache key
   */
  private normalizeKey(locationText: string): string {
    return locationText
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9\s,]/g, '');
  }

  /**
   * Get all cached locations (for debugging/admin)
   */
  getAll(): Array<{ location: string; id: string; fullId: string }> {
    const results: Array<{ location: string; id: string; fullId: string }> = [];
    for (const [location, data] of this.cache.entries()) {
      results.push({
        location,
        id: data.id,
        fullId: data.fullId,
      });
    }
    return results;
  }

  /**
   * Clear expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp >= this.CACHE_TTL) {
        this.cache.delete(key);
      }
    }
  }
}

// Singleton cache instance
const locationCache = new LocationIdCache();

/**
 * Main function: Get location ID with multi-strategy approach
 * 
 * Strategy:
 * 1. Check static mappings (fastest, most reliable)
 * 2. Check cache (fast, previously discovered)
 * 3. Discover via API (accurate, but slower)
 * 4. Return null (will fallback to keywords)
 */
export async function getLocationId(
  locationText: string,
  rapidApiKey: string,
  useCache: boolean = true
): Promise<DiscoveryResult> {
  if (!locationText) {
    return {
      locationId: null,
      fullId: null,
      source: 'failed',
    };
  }

  // Strategy 1: Check cache first (if enabled)
  if (useCache) {
    const cachedId = locationCache.get(locationText);
    if (cachedId) {
      const idMatch = cachedId.match(/urn:li:fs_geo:(\d+)/);
      return {
        locationId: idMatch ? idMatch[1] : null,
        fullId: cachedId,
        source: 'cache',
      };
    }
  }

  // Strategy 2: Discover via API
  const discovery = await discoverLocationId(locationText, rapidApiKey);
  
  // Strategy 3: Cache the discovered ID for future use
  if (discovery.locationId && discovery.fullId && useCache) {
    locationCache.set(locationText, discovery.locationId, discovery.fullId);
    
    // Immediately save to persistent cache (don't wait for periodic save)
    if (typeof window === 'undefined' && typeof require !== 'undefined') {
      try {
        const { saveCache } = require('./linkedinLocationCache');
        saveCache();
      } catch (error) {
        // Cache save failed - not critical, will be saved periodically
        console.warn('Failed to immediately save location cache:', error);
      }
    }
  }

  return discovery;
}

/**
 * Batch discover multiple locations
 * Useful for pre-populating cache
 */
export async function discoverMultipleLocations(
  locations: string[],
  rapidApiKey: string
): Promise<Map<string, DiscoveryResult>> {
  const results = new Map<string, DiscoveryResult>();
  
  // Process in parallel with rate limiting
  const batchSize = 5;
  for (let i = 0; i < locations.length; i += batchSize) {
    const batch = locations.slice(i, i + batchSize);
    const promises = batch.map(loc => 
      getLocationId(loc, rapidApiKey).then(result => ({ location: loc, result }))
    );
    
    const batchResults = await Promise.all(promises);
    for (const { location, result } of batchResults) {
      results.set(location, result);
    }
    
    // Rate limiting: wait between batches
    if (i + batchSize < locations.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
}

/**
 * Export cache for persistence (can be saved to file/database)
 */
export function exportCache(): Array<{ location: string; id: string; fullId: string; timestamp: number }> {
  return locationCache.getAll().map(item => ({
    ...item,
    timestamp: Date.now(), // Current timestamp for export
  }));
}

/**
 * Import cache from persistence
 */
export function importCache(
  cacheData: Array<{ location: string; id: string; fullId: string }>
): void {
  for (const item of cacheData) {
    locationCache.set(item.location, item.id, item.fullId);
  }
}

// Cleanup expired entries periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    locationCache.cleanup();
  }, 60 * 60 * 1000); // Every hour
}

