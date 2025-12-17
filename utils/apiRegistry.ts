/**
 * API Registry
 * 
 * Central registry of all APIs with metadata, costs, and dependencies
 */

export interface APIMetadata {
  name: string;
  costPer1000: number;
  dependencies: string[];
  category: 'scraping' | 'enrichment' | 'compliance' | 'validation';
  locked?: boolean; // Always enabled (e.g., DNC scrub)
}

/**
 * API Registry - All available APIs with costs and dependencies
 */
export const API_REGISTRY: Record<string, APIMetadata> = {
  'linkedin-scraper': {
    name: 'LinkedIn Scraper',
    costPer1000: 15.00,
    dependencies: [],
    category: 'scraping',
    locked: true, // Always enabled - required for lead generation
  },
  'facebook-scraper': {
    name: 'Facebook Scraper',
    costPer1000: 10.00,
    dependencies: [],
    category: 'scraping',
  },
  'skip-tracing': {
    name: 'Skip Tracing',
    costPer1000: 25.00,
    dependencies: [],
    category: 'enrichment',
    locked: true, // Always enabled - required for phone/email/age enrichment
  },
  'telnyx-lookup': {
    name: 'Telnyx Lookup',
    costPer1000: 4.00,
    dependencies: ['skip-tracing'], // Auto-disables if skip-tracing off
    category: 'validation',
    locked: true, // Always enabled - required for phone validation (linetype, carrier)
  },
  // Note: The following APIs are available but not currently used in the enrichment pipeline
  // They can be enabled for future use or manual enrichment
  'income-by-zip': {
    name: 'Income by Zip',
    costPer1000: 1.00,
    dependencies: [],
    category: 'enrichment',
  },
  'website-contacts': {
    name: 'Website Contacts',
    costPer1000: 5.00,
    dependencies: [],
    category: 'enrichment',
  },
  'website-extractor': {
    name: 'Website Extractor',
    costPer1000: 3.00,
    dependencies: [],
    category: 'enrichment',
  },
  'linkedin-profile': {
    name: 'LinkedIn Profile',
    costPer1000: 2.00,
    dependencies: [],
    category: 'enrichment',
  },
  'fresh-linkedin-profile': {
    name: 'Fresh LinkedIn Profile',
    costPer1000: 3.00,
    dependencies: [],
    category: 'enrichment',
  },
  'fresh-linkedin-company': {
    name: 'Fresh LinkedIn Company',
    costPer1000: 2.50,
    dependencies: [],
    category: 'enrichment',
  },
  'linkedin-company': {
    name: 'LinkedIn Company',
    costPer1000: 2.00,
    dependencies: [],
    category: 'enrichment',
  },
  'dnc-scrub': {
    name: 'DNC Scrubbing',
    costPer1000: 2.00,
    dependencies: [],
    category: 'compliance',
    locked: true, // Always enabled (manual trigger via USHA API, not in auto-enrichment)
  },
};

/**
 * Map API name from code to registry key
 */
export function mapAPINameToKey(apiName: string): string {
  const mapping: Record<string, string> = {
    // Skip-tracing variations (all map to same API)
    'Skip-tracing': 'skip-tracing',
    'Skip-tracing (Phone Discovery)': 'skip-tracing',
    'Skip-tracing (Person Details)': 'skip-tracing',
    'Skip-tracing (Age)': 'skip-tracing',
    // Telnyx
    'Telnyx': 'telnyx-lookup',
    // Income by Zip (available but not currently used in enrichRow)
    'Income by Zip': 'income-by-zip',
    // Website APIs (available but not currently used in enrichRow)
    'Website Extractor': 'website-extractor',
    'Website Contacts': 'website-contacts',
    // LinkedIn Profile APIs (available but not currently used in enrichRow)
    'LinkedIn Profile': 'linkedin-profile',
    'Fresh LinkedIn Profile': 'fresh-linkedin-profile',
    'Fresh LinkedIn Company': 'fresh-linkedin-company',
    'LinkedIn Company': 'linkedin-company',
    // DNC Scrubbing (manual trigger, not in auto-enrichment)
    'DNC Scrubbing': 'dnc-scrub',
    'USHA DNC': 'dnc-scrub',
  };

  // Try exact match first
  if (mapping[apiName]) {
    return mapping[apiName];
  }

  // Try case-insensitive match
  const lowerName = apiName.toLowerCase();
  for (const [key, value] of Object.entries(mapping)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }

  // Fallback: convert to kebab-case
  return apiName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/**
 * Get API metadata by key
 */
export function getAPIMetadata(key: string): APIMetadata | undefined {
  return API_REGISTRY[key];
}

/**
 * Get all API keys
 */
export function getAllAPIKeys(): string[] {
  return Object.keys(API_REGISTRY);
}

/**
 * Calculate total cost for enabled APIs per 1,000 leads
 */
export function calculateCost(apiToggles: Record<string, { enabled: boolean; costPer1000: number }>, leadCount: number = 1000): number {
  let total = 0;

  for (const [apiKey, config] of Object.entries(apiToggles)) {
    if (config.enabled) {
      const cost = (config.costPer1000 / 1000) * leadCount;
      total += cost;
    }
  }

  return total;
}

