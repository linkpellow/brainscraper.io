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
// Source: LinkedIn Sales Navigator location suggestion endpoint
export const US_STATE_LOCATION_IDS: Record<string, LocationMapping> = {
  'Alabama': { name: 'Alabama, United States', id: '102240587', fullId: 'urn:li:fs_geo:102240587' },
  'AL': { name: 'Alabama, United States', id: '102240587', fullId: 'urn:li:fs_geo:102240587' },
  'Alaska': { name: 'Alaska, United States', id: '100290991', fullId: 'urn:li:fs_geo:100290991' },
  'AK': { name: 'Alaska, United States', id: '100290991', fullId: 'urn:li:fs_geo:100290991' },
  'Arizona': { name: 'Arizona, United States', id: '106032500', fullId: 'urn:li:fs_geo:106032500' },
  'AZ': { name: 'Arizona, United States', id: '106032500', fullId: 'urn:li:fs_geo:106032500' },
  'Arkansas': { name: 'Arkansas, United States', id: '102790221', fullId: 'urn:li:fs_geo:102790221' },
  'AR': { name: 'Arkansas, United States', id: '102790221', fullId: 'urn:li:fs_geo:102790221' },
  'California': { name: 'California, United States', id: '102095887', fullId: 'urn:li:fs_geo:102095887' },
  'CA': { name: 'California, United States', id: '102095887', fullId: 'urn:li:fs_geo:102095887' },
  'Colorado': { name: 'Colorado, United States', id: '105763813', fullId: 'urn:li:fs_geo:105763813' },
  'CO': { name: 'Colorado, United States', id: '105763813', fullId: 'urn:li:fs_geo:105763813' },
  'Connecticut': { name: 'Connecticut, United States', id: '106914527', fullId: 'urn:li:fs_geo:106914527' },
  'CT': { name: 'Connecticut, United States', id: '106914527', fullId: 'urn:li:fs_geo:106914527' },
  'Delaware': { name: 'Delaware, United States', id: '105375497', fullId: 'urn:li:fs_geo:105375497' },
  'DE': { name: 'Delaware, United States', id: '105375497', fullId: 'urn:li:fs_geo:105375497' },
  'Florida': { name: 'Florida, United States', id: '101318387', fullId: 'urn:li:fs_geo:101318387' },
  'FL': { name: 'Florida, United States', id: '101318387', fullId: 'urn:li:fs_geo:101318387' },
  'Georgia': { name: 'Georgia, United States', id: '103950076', fullId: 'urn:li:fs_geo:103950076' },
  'GA': { name: 'Georgia, United States', id: '103950076', fullId: 'urn:li:fs_geo:103950076' },
  'Hawaii': { name: 'Hawaii, United States', id: '105051999', fullId: 'urn:li:fs_geo:105051999' },
  'HI': { name: 'Hawaii, United States', id: '105051999', fullId: 'urn:li:fs_geo:105051999' },
  'Idaho': { name: 'Idaho, United States', id: '102560739', fullId: 'urn:li:fs_geo:102560739' },
  'ID': { name: 'Idaho, United States', id: '102560739', fullId: 'urn:li:fs_geo:102560739' },
  'Illinois': { name: 'Illinois, United States', id: '101949407', fullId: 'urn:li:fs_geo:101949407' },
  'IL': { name: 'Illinois, United States', id: '101949407', fullId: 'urn:li:fs_geo:101949407' },
  'Indiana': { name: 'Indiana, United States', id: '103336534', fullId: 'urn:li:fs_geo:103336534' },
  'IN': { name: 'Indiana, United States', id: '103336534', fullId: 'urn:li:fs_geo:103336534' },
  'Iowa': { name: 'Iowa, United States', id: '103078544', fullId: 'urn:li:fs_geo:103078544' },
  'IA': { name: 'Iowa, United States', id: '103078544', fullId: 'urn:li:fs_geo:103078544' },
  'Kansas': { name: 'Kansas, United States', id: '104403803', fullId: 'urn:li:fs_geo:104403803' },
  'KS': { name: 'Kansas, United States', id: '104403803', fullId: 'urn:li:fs_geo:104403803' },
  'Kentucky': { name: 'Kentucky, United States', id: '106470801', fullId: 'urn:li:fs_geo:106470801' },
  'KY': { name: 'Kentucky, United States', id: '106470801', fullId: 'urn:li:fs_geo:106470801' },
  'Louisiana': { name: 'Louisiana, United States', id: '101822552', fullId: 'urn:li:fs_geo:101822552' },
  'LA': { name: 'Louisiana, United States', id: '101822552', fullId: 'urn:li:fs_geo:101822552' },
  'Maine': { name: 'Maine, United States', id: '101102875', fullId: 'urn:li:fs_geo:101102875' },
  'ME': { name: 'Maine, United States', id: '101102875', fullId: 'urn:li:fs_geo:101102875' },
  'Maryland': { name: 'Maryland, United States', id: '100809221', fullId: 'urn:li:fs_geo:100809221' },
  'MD': { name: 'Maryland, United States', id: '100809221', fullId: 'urn:li:fs_geo:100809221' },
  'Massachusetts': { name: 'Massachusetts, United States', id: '101098412', fullId: 'urn:li:fs_geo:101098412' },
  'MA': { name: 'Massachusetts, United States', id: '101098412', fullId: 'urn:li:fs_geo:101098412' },
  'Michigan': { name: 'Michigan, United States', id: '103051080', fullId: 'urn:li:fs_geo:103051080' },
  'MI': { name: 'Michigan, United States', id: '103051080', fullId: 'urn:li:fs_geo:103051080' },
  'Minnesota': { name: 'Minnesota, United States', id: '103411167', fullId: 'urn:li:fs_geo:103411167' },
  'MN': { name: 'Minnesota, United States', id: '103411167', fullId: 'urn:li:fs_geo:103411167' },
  'Mississippi': { name: 'Mississippi, United States', id: '106899551', fullId: 'urn:li:fs_geo:106899551' },
  'MS': { name: 'Mississippi, United States', id: '106899551', fullId: 'urn:li:fs_geo:106899551' },
  'Missouri': { name: 'Missouri, United States', id: '101486475', fullId: 'urn:li:fs_geo:101486475' },
  'MO': { name: 'Missouri, United States', id: '101486475', fullId: 'urn:li:fs_geo:101486475' },
  'Montana': { name: 'Montana, United States', id: '101758306', fullId: 'urn:li:fs_geo:101758306' },
  'MT': { name: 'Montana, United States', id: '101758306', fullId: 'urn:li:fs_geo:101758306' },
  'Nebraska': { name: 'Nebraska, United States', id: '101197782', fullId: 'urn:li:fs_geo:101197782' },
  'NE': { name: 'Nebraska, United States', id: '101197782', fullId: 'urn:li:fs_geo:101197782' },
  'Nevada': { name: 'Nevada, United States', id: '101690912', fullId: 'urn:li:fs_geo:101690912' },
  'NV': { name: 'Nevada, United States', id: '101690912', fullId: 'urn:li:fs_geo:101690912' },
  'New Hampshire': { name: 'New Hampshire, United States', id: '103532695', fullId: 'urn:li:fs_geo:103532695' },
  'NH': { name: 'New Hampshire, United States', id: '103532695', fullId: 'urn:li:fs_geo:103532695' },
  'New Jersey': { name: 'New Jersey, United States', id: '101651951', fullId: 'urn:li:fs_geo:101651951' },
  'NJ': { name: 'New Jersey, United States', id: '101651951', fullId: 'urn:li:fs_geo:101651951' },
  'New Mexico': { name: 'New Mexico, United States', id: '105048220', fullId: 'urn:li:fs_geo:105048220' },
  'NM': { name: 'New Mexico, United States', id: '105048220', fullId: 'urn:li:fs_geo:105048220' },
  'New York': { name: 'New York, United States', id: '105080838', fullId: 'urn:li:fs_geo:105080838' },
  'NY': { name: 'New York, United States', id: '105080838', fullId: 'urn:li:fs_geo:105080838' },
  'North Carolina': { name: 'North Carolina, United States', id: '103255397', fullId: 'urn:li:fs_geo:103255397' },
  'NC': { name: 'North Carolina, United States', id: '103255397', fullId: 'urn:li:fs_geo:103255397' },
  'North Dakota': { name: 'North Dakota, United States', id: '104611396', fullId: 'urn:li:fs_geo:104611396' },
  'ND': { name: 'North Dakota, United States', id: '104611396', fullId: 'urn:li:fs_geo:104611396' },
  'Ohio': { name: 'Ohio, United States', id: '106981407', fullId: 'urn:li:fs_geo:106981407' },
  'OH': { name: 'Ohio, United States', id: '106981407', fullId: 'urn:li:fs_geo:106981407' },
  'Oklahoma': { name: 'Oklahoma, United States', id: '101343299', fullId: 'urn:li:fs_geo:101343299' },
  'OK': { name: 'Oklahoma, United States', id: '101343299', fullId: 'urn:li:fs_geo:101343299' },
  'Oregon': { name: 'Oregon, United States', id: '101685541', fullId: 'urn:li:fs_geo:101685541' },
  'OR': { name: 'Oregon, United States', id: '101685541', fullId: 'urn:li:fs_geo:101685541' },
  'Pennsylvania': { name: 'Pennsylvania, United States', id: '102986501', fullId: 'urn:li:fs_geo:102986501' },
  'PA': { name: 'Pennsylvania, United States', id: '102986501', fullId: 'urn:li:fs_geo:102986501' },
  'Rhode Island': { name: 'Rhode Island, United States', id: '104877241', fullId: 'urn:li:fs_geo:104877241' },
  'RI': { name: 'Rhode Island, United States', id: '104877241', fullId: 'urn:li:fs_geo:104877241' },
  'South Carolina': { name: 'South Carolina, United States', id: '102687171', fullId: 'urn:li:fs_geo:102687171' },
  'SC': { name: 'South Carolina, United States', id: '102687171', fullId: 'urn:li:fs_geo:102687171' },
  'South Dakota': { name: 'South Dakota, United States', id: '100115110', fullId: 'urn:li:fs_geo:100115110' },
  'SD': { name: 'South Dakota, United States', id: '100115110', fullId: 'urn:li:fs_geo:100115110' },
  'Tennessee': { name: 'Tennessee, United States', id: '104629187', fullId: 'urn:li:fs_geo:104629187' },
  'TN': { name: 'Tennessee, United States', id: '104629187', fullId: 'urn:li:fs_geo:104629187' },
  'Texas': { name: 'Texas, United States', id: '102748797', fullId: 'urn:li:fs_geo:102748797' },
  'TX': { name: 'Texas, United States', id: '102748797', fullId: 'urn:li:fs_geo:102748797' },
  'Utah': { name: 'Utah, United States', id: '104102239', fullId: 'urn:li:fs_geo:104102239' },
  'UT': { name: 'Utah, United States', id: '104102239', fullId: 'urn:li:fs_geo:104102239' },
  'Vermont': { name: 'Vermont, United States', id: '104453637', fullId: 'urn:li:fs_geo:104453637' },
  'VT': { name: 'Vermont, United States', id: '104453637', fullId: 'urn:li:fs_geo:104453637' },
  'Virginia': { name: 'Virginia, United States', id: '101630962', fullId: 'urn:li:fs_geo:101630962' },
  'VA': { name: 'Virginia, United States', id: '101630962', fullId: 'urn:li:fs_geo:101630962' },
  'Washington': { name: 'Washington, United States', id: '103977389', fullId: 'urn:li:fs_geo:103977389' },
  'WA': { name: 'Washington, United States', id: '103977389', fullId: 'urn:li:fs_geo:103977389' },
  'West Virginia': { name: 'West Virginia, United States', id: '106420769', fullId: 'urn:li:fs_geo:106420769' },
  'WV': { name: 'West Virginia, United States', id: '106420769', fullId: 'urn:li:fs_geo:106420769' },
  'Wisconsin': { name: 'Wisconsin, United States', id: '104454774', fullId: 'urn:li:fs_geo:104454774' },
  'WI': { name: 'Wisconsin, United States', id: '104454774', fullId: 'urn:li:fs_geo:104454774' },
  'Wyoming': { name: 'Wyoming, United States', id: '100658004', fullId: 'urn:li:fs_geo:100658004' },
  'WY': { name: 'Wyoming, United States', id: '100658004', fullId: 'urn:li:fs_geo:100658004' },
  'District of Columbia': { name: 'District of Columbia, United States', id: '101116121', fullId: 'urn:li:fs_geo:101116121' },
  'DC': { name: 'District of Columbia, United States', id: '101116121', fullId: 'urn:li:fs_geo:101116121' },
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
