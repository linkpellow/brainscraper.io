/**
 * Enhanced Location Discovery
 * 
 * Integrates with the geo ID database for fast lookup and auto-discovery
 */

import { lookupGeoId, addGeoIdEntry } from './geoIdDatabase';
import { discoverLocationId } from './geoIdDiscoveryService';

export interface LocationDiscoveryResult {
  locationId: string;
  fullId: string;
  locationName: string;
  source: 'database' | 'discovery';
  cached: boolean;
}

/**
 * Get location ID with auto-discovery and caching
 */
export async function getLocationIdWithCache(
  locationText: string,
  rapidApiKey: string,
  autoDiscover: boolean = true
): Promise<LocationDiscoveryResult | null> {
  // Step 1: Check database first (fastest)
  const cached = lookupGeoId(locationText);
  if (cached) {
    console.log(`✅ Found location ID in database: ${cached.locationId} (${cached.locationName})`);
    return {
      locationId: cached.locationId,
      fullId: cached.fullId,
      locationName: cached.locationName,
      source: 'database',
      cached: true
    };
  }

  // Step 2: Auto-discover if enabled
  if (autoDiscover && rapidApiKey) {
    console.log(`🔍 Location not in database, discovering...`);
    const discovered = await discoverLocationId(locationText, rapidApiKey);
    
    if (discovered) {
      console.log(`✅ Discovered and cached: ${discovered.locationId} (${discovered.locationName})`);
      return {
        locationId: discovered.locationId,
        fullId: discovered.fullId,
        locationName: discovered.locationName,
        source: 'discovery',
        cached: false
      };
    }
  }

  console.log(`❌ Could not find or discover location ID for: ${locationText}`);
  return null;
}

/**
 * Extract and cache geo IDs from API response leads
 */
export function extractAndCacheGeoIds(leads: any[]): number {
  if (!Array.isArray(leads) || leads.length === 0) return 0;
  
  let cached = 0;
  
  for (const lead of leads) {
    const locationName = lead.geoRegion || lead.location || lead.locationName;
    
    // Check if lead has a geo ID we can extract
    const geoIdFields = ['geoId', 'geo_id', 'locationId', 'location_id', 'geoUrn', 'geo_urn'];
    
    for (const field of geoIdFields) {
      if (lead[field]) {
        const geoId = String(lead[field]);
        const urnMatch = geoId.match(/urn:li:(?:fs_)?geo:(\d+)/);
        
        if (urnMatch && locationName) {
          const locationId = urnMatch[1];
          addGeoIdEntry(
            locationName,
            locationId,
            `urn:li:fs_geo:${locationId}`,
            locationName,
            'profile'
          );
          cached++;
          break;
        } else if (/^\d+$/.test(geoId) && locationName) {
          addGeoIdEntry(
            locationName,
            geoId,
            `urn:li:fs_geo:${geoId}`,
            locationName,
            'profile'
          );
          cached++;
          break;
        }
      }
    }
  }
  
  return cached;
}

