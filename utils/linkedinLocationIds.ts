/**
 * LinkedIn Location ID mappings
 * These are LinkedIn's internal location IDs for Sales Navigator API
 * 
 * Static mappings for common locations (fastest lookup).
 * For unknown locations, the system will automatically discover IDs using
 * the location discovery service (linkedinLocationDiscovery.ts).
 * 
 * Format: urn:li:fs_geo:<LocationID>
 */

export interface LocationMapping {
  name: string;
  id: string; // The numeric part of urn:li:fs_geo:<id>
  fullId: string; // Complete format: urn:li:fs_geo:<id>
}

// Common US state location IDs
// Source: LinkedIn Sales Navigator location system
export const US_STATE_LOCATION_IDS: Record<string, LocationMapping> = {
  'Maryland': {
    name: 'Maryland, United States',
    id: '103644278',
    fullId: 'urn:li:fs_geo:103644278'
  },
  'MD': {
    name: 'Maryland, United States',
    id: '103644278',
    fullId: 'urn:li:fs_geo:103644278'
  },
  // Note: Other states removed - use location discovery for accurate IDs
  // Placeholder IDs caused incorrect searches (all states searched Maryland)
  // Location discovery will find correct IDs automatically
};

// City-specific location IDs (more specific)
export const CITY_LOCATION_IDS: Record<string, LocationMapping> = {
  // Note: City mappings removed - use location discovery for accurate IDs
  // Placeholder IDs caused incorrect searches
  // Location discovery will find correct IDs automatically
};

/**
 * Attempts to find a LinkedIn location ID for a given location string
 * @param locationText - Location string (e.g., "Maryland, MD, United States", "Chevy Chase, MD")
 * @returns LocationMapping if found, null otherwise
 */
export function findLocationId(locationText: string): LocationMapping | null {
  if (!locationText) return null;
  
  const normalized = locationText.trim();
  
  // Try exact city match first
  for (const [key, mapping] of Object.entries(CITY_LOCATION_IDS)) {
    if (normalized.toLowerCase().includes(key.toLowerCase())) {
      return mapping;
    }
  }
  
  // Try state match
  for (const [key, mapping] of Object.entries(US_STATE_LOCATION_IDS)) {
    if (normalized.toLowerCase().includes(key.toLowerCase())) {
      return mapping;
    }
  }
  
  return null;
}

/**
 * Converts a location string to LinkedIn filter format
 * @param locationText - Location string
 * @returns Filter object with proper location ID if found, or null
 */
export function locationToFilter(locationText: string): {
  type: string;
  values: Array<{ id: string; text: string; selectionType: string }>;
  selectedSubFilter?: number;
} | null {
  const locationMapping = findLocationId(locationText);
  
  if (locationMapping) {
    return {
      type: 'REGION',  // CRITICAL FIX: Use REGION not LOCATION (matches RapidAPI playground)
      values: [{
        id: locationMapping.id,  // CRITICAL FIX: Use just numeric ID, not full URN
        text: locationMapping.name,
        selectionType: 'INCLUDED'
      }],
      selectedSubFilter: 50  // Required field per RapidAPI playground
    };
  }
  
  return null;
}

