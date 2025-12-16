/**
 * Location Validation Utilities
 * 
 * Validates that leads match the requested location filter
 * Prevents incorrect results (e.g., Canada leads when filtering for Maryland)
 */

export interface LocationValidationResult {
  matches: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason?: string;
}

/**
 * Extracts state abbreviation or name from location text
 */
export function extractState(locationText: string): string | null {
  if (!locationText) return null;
  
  const normalized = locationText.toLowerCase().trim();
  
  // US State abbreviations
  const stateAbbreviations: Record<string, string> = {
    'al': 'alabama', 'ak': 'alaska', 'az': 'arizona', 'ar': 'arkansas',
    'ca': 'california', 'co': 'colorado', 'ct': 'connecticut', 'de': 'delaware',
    'fl': 'florida', 'ga': 'georgia', 'hi': 'hawaii', 'id': 'idaho',
    'il': 'illinois', 'in': 'indiana', 'ia': 'iowa', 'ks': 'kansas',
    'ky': 'kentucky', 'la': 'louisiana', 'me': 'maine', 'md': 'maryland',
    'ma': 'massachusetts', 'mi': 'michigan', 'mn': 'minnesota', 'ms': 'mississippi',
    'mo': 'missouri', 'mt': 'montana', 'ne': 'nebraska', 'nv': 'nevada',
    'nh': 'new hampshire', 'nj': 'new jersey', 'nm': 'new mexico', 'ny': 'new york',
    'nc': 'north carolina', 'nd': 'north dakota', 'oh': 'ohio', 'ok': 'oklahoma',
    'or': 'oregon', 'pa': 'pennsylvania', 'ri': 'rhode island', 'sc': 'south carolina',
    'sd': 'south dakota', 'tn': 'tennessee', 'tx': 'texas', 'ut': 'utah',
    'vt': 'vermont', 'va': 'virginia', 'wa': 'washington', 'wv': 'west virginia',
    'wi': 'wisconsin', 'wy': 'wyoming', 'dc': 'district of columbia'
  };
  
  // Check for full state names first (more specific)
  const stateNames = Object.values(stateAbbreviations);
  for (const stateName of stateNames) {
    // Check if location text contains the full state name
    if (normalized.includes(stateName)) {
      return stateName;
    }
  }
  
  // Check for state abbreviation (less specific, but still valid)
  for (const [abbr, fullName] of Object.entries(stateAbbreviations)) {
    // Only match abbreviation if it's a standalone word (not part of another word)
    const abbrRegex = new RegExp(`\\b${abbr}\\b`, 'i');
    if (abbrRegex.test(normalized)) {
      return fullName;
    }
  }
  
  return null;
}

/**
 * Extracts country from location text
 */
export function extractCountry(locationText: string): string | null {
  if (!locationText) return null;
  
  const normalized = locationText.toLowerCase().trim();
  
  const countries = {
    'united states': 'us',
    'usa': 'us',
    'us': 'us',
    'canada': 'ca',
    'mexico': 'mx',
    'uk': 'uk',
    'united kingdom': 'uk',
    'australia': 'au',
    'germany': 'de',
    'france': 'fr',
    'spain': 'es',
    'italy': 'it',
  };
  
  for (const [countryName, code] of Object.entries(countries)) {
    if (normalized.includes(countryName)) {
      return code;
    }
  }
  
  return null;
}

/**
 * Validates if a lead's location matches the requested location
 */
export function validateLocationMatch(
  lead: any,
  requestedLocation: string
): LocationValidationResult {
  if (!lead || !requestedLocation) {
    return {
      matches: false,
      confidence: 'low',
      reason: 'Missing lead or requested location',
    };
  }

  // Extract location from various possible field names
  const leadLocation = String(
    lead.location || 
    lead.geoRegion || 
    lead.locationName ||
    lead.currentLocation ||
    lead.geoLocation ||
    lead.address ||
    (lead.profile && (lead.profile.location || lead.profile.geoRegion)) ||
    ''
  ).toLowerCase();
  const requested = requestedLocation.toLowerCase().trim();

  if (!leadLocation) {
    return {
      matches: false,
      confidence: 'low',
      reason: 'Lead has no location data',
    };
  }

  // Extract state/country from requested location
  const requestedState = extractState(requested);
  const requestedCountry = extractCountry(requested);
  const leadState = extractState(leadLocation);
  const leadCountry = extractCountry(leadLocation);

  // High confidence: Exact state match
  if (requestedState && leadState && requestedState === leadState) {
    return {
      matches: true,
      confidence: 'high',
      reason: `State match: ${requestedState}`,
    };
  }

  // High confidence: Exact country match (when requesting country-level)
  if (requestedCountry && leadCountry && requestedCountry === leadCountry) {
    // But reject if requesting US state and lead is from different country
    if (requestedState && leadCountry !== 'us') {
      return {
        matches: false,
        confidence: 'high',
        reason: `Requested US state (${requestedState}) but lead is from ${leadCountry}`,
      };
    }
    return {
      matches: true,
      confidence: 'high',
      reason: `Country match: ${requestedCountry}`,
    };
  }

  // Medium confidence: Location text contains requested location
  // Check if lead location contains the requested state or location text
  if (requestedState && leadLocation.includes(requestedState)) {
    return {
      matches: true,
      confidence: 'high', // Changed to high - state match is reliable
      reason: `Location contains requested state: ${requestedState}`,
    };
  }
  
  // High confidence: Exact location name match (e.g., "Maryland" in "Baltimore, Maryland, United States")
  // Check if requested location name appears in lead location
  const requestedParts = requested.split(',').map(p => p.trim().toLowerCase()).filter(p => p.length > 0);
  for (const part of requestedParts) {
    // Skip generic terms
    if (['united states', 'usa', 'us', 'canada', 'uk', 'united kingdom'].includes(part)) {
      continue;
    }
    // Check if the part matches (case-insensitive, word boundary aware)
    const partRegex = new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (partRegex.test(leadLocation)) {
      return {
        matches: true,
        confidence: 'high',
        reason: `Location contains requested location: ${part}`,
      };
    }
    // Also check without word boundary for partial matches (e.g., "Maryland" in "Maryland, United States")
    if (leadLocation.includes(part)) {
    return {
      matches: true,
      confidence: 'high',
        reason: `Location contains requested location: ${part}`,
    };
    }
  }
  
  // Also check if requested location text appears in lead location (fuzzy match)
  // Check if any part of the requested location matches any part of the lead location
  const requestedWords = requested.split(/[,\s]+/).filter(w => w.length > 2); // Filter out short words
  const leadWords = leadLocation.split(/[,\s]+/).filter(w => w.length > 2);
  
  // Check for word matches (more flexible)
  for (const reqWord of requestedWords) {
    // Skip generic terms
    if (['united', 'states', 'usa', 'us', 'canada', 'uk', 'united', 'kingdom'].includes(reqWord)) {
      continue;
    }
    for (const leadWord of leadWords) {
      if (reqWord === leadWord || leadWord.includes(reqWord) || reqWord.includes(leadWord)) {
        return {
          matches: true,
          confidence: 'medium',
          reason: `Location word match: ${reqWord} matches ${leadWord}`,
        };
      }
    }
  }
  
  // Fallback: simple substring match
  if (leadLocation.includes(requested) || requested.includes(leadLocation.split(',')[0])) {
    return {
      matches: true,
      confidence: 'medium',
      reason: 'Location text contains requested location',
    };
  }

  // Explicit rejections (high confidence)
  // Reject Canada when requesting US state
  if (requestedState && leadLocation.includes('canada')) {
    return {
      matches: false,
      confidence: 'high',
      reason: 'Requested US state but lead is from Canada',
    };
  }

  // Reject other countries when requesting US state
  if (requestedState && leadCountry && leadCountry !== 'us') {
    return {
      matches: false,
      confidence: 'high',
      reason: `Requested US state (${requestedState}) but lead is from ${leadCountry}`,
    };
  }

  // Reject different US states
  if (requestedState && leadState && requestedState !== leadState) {
    return {
      matches: false,
      confidence: 'high',
      reason: `Requested ${requestedState} but lead is from ${leadState}`,
    };
  }

  // Low confidence: No clear match or mismatch
  return {
    matches: false,
    confidence: 'low',
    reason: 'Location does not match requested location',
  };
}

/**
 * Filters leads to only include those matching the requested location
 */
export function filterLeadsByLocation(
  leads: any[],
  requestedLocation: string
): {
  filtered: any[];
  removed: any[];
  stats: {
    total: number;
    kept: number;
    removed: number;
    removalRate: number;
  };
} {
  const filtered: any[] = [];
  const removed: any[] = [];

  for (const lead of leads) {
    const validation = validateLocationMatch(lead, requestedLocation);
    
    if (validation.matches) {
      filtered.push(lead);
    } else {
      removed.push({
        ...lead,
        _removalReason: validation.reason,
        _removalConfidence: validation.confidence,
      });
    }
  }

  const total = leads.length;
  const kept = filtered.length;
  const removedCount = removed.length;
  const removalRate = total > 0 ? (removedCount / total) * 100 : 0;

  return {
    filtered,
    removed,
    stats: {
      total,
      kept,
      removed: removedCount,
      removalRate,
    },
  };
}

/**
 * Checks if a location string is likely a US state
 */
export function isUSState(locationText: string): boolean {
  return extractState(locationText) !== null;
}

/**
 * Checks if a location string is likely a country
 */
export function isCountry(locationText: string): boolean {
  return extractCountry(locationText) !== null;
}

