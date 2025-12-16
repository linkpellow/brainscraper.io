/**
 * Geo ID Discovery Service
 * 
 * Discovers LinkedIn location IDs using multiple API sources:
 * 1. HarvestAPI - LinkedIn data API
 * 2. saleLeads.ai - Sales Navigator API
 * 3. Fresh LinkedIn Profile Data - Profile enrichment
 * 4. json_to_url - URL generation (already implemented)
 * 
 * Auto-saves discovered IDs to the geo ID database
 */

import { addGeoIdEntry, extractGeoIdFromProfile } from './geoIdDatabase';

/**
 * Discovers location ID using HarvestAPI
 * Searches for profiles in the location and extracts geo IDs
 */
export async function discoverViaHarvestAPI(
  locationText: string,
  rapidApiKey: string
): Promise<{ locationId: string; fullId: string; locationName: string } | null> {
  try {
    const response = await fetch('https://fresh-linkedin-profile-data.p.rapidapi.com/search-results', {
      method: 'POST',
      headers: {
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': 'fresh-linkedin-profile-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: locationText,
        search_type: 'people',
        page: 1,
        limit: 10
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const results = data?.results || data?.data?.results || data?.data || [];
    
    if (Array.isArray(results) && results.length > 0) {
      for (const result of results) {
        const geoData = extractGeoIdFromProfile(result);
        if (geoData?.locationId && geoData?.locationName) {
          // Save to database
          addGeoIdEntry(
            locationText,
            geoData.locationId,
            `urn:li:fs_geo:${geoData.locationId}`,
            geoData.locationName,
            'harvest'
          );
          
          return {
            locationId: geoData.locationId,
            fullId: `urn:li:fs_geo:${geoData.locationId}`,
            locationName: geoData.locationName
          };
        }
      }
    }
  } catch (error) {
    console.error('HarvestAPI discovery error:', error);
  }
  
  return null;
}

/**
 * Discovers location ID using saleLeads.ai API
 */
export async function discoverViaSaleLeads(
  locationText: string,
  rapidApiKey: string
): Promise<{ locationId: string; fullId: string; locationName: string } | null> {
  try {
    // saleLeads.ai endpoint for location search
    const response = await fetch('https://saleleads-ai.p.rapidapi.com/search/people', {
      method: 'POST',
      headers: {
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': 'saleleads-ai.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        location: locationText,
        page: 1,
        limit: 10
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const results = data?.results || data?.data || [];
    
    if (Array.isArray(results) && results.length > 0) {
      for (const result of results) {
        const geoData = extractGeoIdFromProfile(result);
        if (geoData?.locationId && geoData?.locationName) {
          // Save to database
          addGeoIdEntry(
            locationText,
            geoData.locationId,
            `urn:li:fs_geo:${geoData.locationId}`,
            geoData.locationName,
            'saleleads'
          );
          
          return {
            locationId: geoData.locationId,
            fullId: `urn:li:fs_geo:${geoData.locationId}`,
            locationName: geoData.locationName
          };
        }
      }
    }
  } catch (error) {
    console.error('saleLeads.ai discovery error:', error);
  }
  
  return null;
}

/**
 * Discovers location ID using json_to_url endpoint
 * (Already implemented in linkedinLocationDiscovery.ts)
 */
export async function discoverViaJsonToUrl(
  locationText: string,
  rapidApiKey: string
): Promise<{ locationId: string; fullId: string; locationName: string } | null> {
  try {
    const response = await fetch('https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/json_to_url', {
      method: 'POST',
      headers: {
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filters: [{
          type: 'LOCATION',
          values: [{
            id: locationText, // Try with text to see if API provides ID
            text: locationText,
            selectionType: 'INCLUDED'
          }]
        }],
        keywords: ''
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const url = data?.url || data?.data || data;
    
    if (typeof url === 'string') {
      // Extract location ID from generated URL
      const locationMatch = url.match(/(?:geo|location)[=:](?:urn:li:(?:fs_)?geo:)?(\d{8,})/i);
      if (locationMatch) {
        const locationId = locationMatch[1];
        
        // Save to database
        addGeoIdEntry(
          locationText,
          locationId,
          `urn:li:fs_geo:${locationId}`,
          locationText,
          'json_to_url'
        );
        
        return {
          locationId,
          fullId: `urn:li:fs_geo:${locationId}`,
          locationName: locationText
        };
      }
    }
  } catch (error) {
    console.error('json_to_url discovery error:', error);
  }
  
  return null;
}

/**
 * Multi-source discovery with fallback chain
 */
export async function discoverLocationId(
  locationText: string,
  rapidApiKey: string
): Promise<{ locationId: string; fullId: string; locationName: string; source: string } | null> {
  console.log(`🔍 Discovering location ID for "${locationText}"...`);
  
  // Try all sources in parallel for speed
  const [harvestResult, saleLeadsResult, jsonToUrlResult] = await Promise.allSettled([
    discoverViaHarvestAPI(locationText, rapidApiKey),
    discoverViaSaleLeads(locationText, rapidApiKey),
    discoverViaJsonToUrl(locationText, rapidApiKey)
  ]);
  
  // Return first successful result
  if (harvestResult.status === 'fulfilled' && harvestResult.value) {
    console.log(`✅ Found via HarvestAPI: ${harvestResult.value.locationId}`);
    return { ...harvestResult.value, source: 'harvest' };
  }
  
  if (saleLeadsResult.status === 'fulfilled' && saleLeadsResult.value) {
    console.log(`✅ Found via saleLeads.ai: ${saleLeadsResult.value.locationId}`);
    return { ...saleLeadsResult.value, source: 'saleleads' };
  }
  
  if (jsonToUrlResult.status === 'fulfilled' && jsonToUrlResult.value) {
    console.log(`✅ Found via json_to_url: ${jsonToUrlResult.value.locationId}`);
    return { ...jsonToUrlResult.value, source: 'json_to_url' };
  }
  
  console.log(`❌ Could not discover location ID for "${locationText}"`);
  return null;
}

/**
 * Batch discovery for multiple locations
 */
export async function discoverLocationIdsBatch(
  locations: string[],
  rapidApiKey: string,
  onProgress?: (current: number, total: number, location: string) => void
): Promise<Map<string, { locationId: string; fullId: string; locationName: string }>> {
  const results = new Map();
  
  for (let i = 0; i < locations.length; i++) {
    const location = locations[i];
    if (onProgress) {
      onProgress(i + 1, locations.length, location);
    }
    
    const result = await discoverLocationId(location, rapidApiKey);
    if (result) {
      results.set(location, result);
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return results;
}

