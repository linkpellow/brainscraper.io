/**
 * Enrichment Station Configuration System
 * 
 * Manages enrichment stations and calculates optimal order based on:
 * - Dependencies between stations
 * - Cost efficiency (free operations first)
 * - Enabled/disabled state
 */

export type EnrichmentStation = 
  | 'linkedin'      // STEP 1: Extract name, city, state (foundation, no API cost)
  | 'zip'           // STEP 2: ZIP lookup (free local DB)
  | 'income-pre-qual' // STEP 2.5: Income check (free census API) - BEFORE phone discovery
  | 'gender'        // STEP 2.6: Gender detection from name (free, local)
  | 'phone-discovery' // STEP 3: Skip-tracing phone discovery (paid) - only if income >= $60k
  | 'telnyx'        // STEP 4: Phone validation/carrier (paid)
  | 'gatekeep'      // STEP 5: Filter VoIP/junk (logic, no API)
  | 'dnc-check'     // STEP 5.5: DNC scrubbing (free)
  | 'age';          // STEP 6: Age enrichment (paid, conditional)

export interface StationConfig {
  id: EnrichmentStation;
  name: string;
  description: string;
  cost: 'free' | 'paid';
  dependencies: EnrichmentStation[]; // Stations that must run before this
  provides: string[]; // Data fields this station provides
  required: boolean; // If true, cannot be disabled
}

type StationDependencyIssue = {
  station: EnrichmentStation;
  missingDependencies: EnrichmentStation[];
};

const STATION_ID_ALIASES: Record<string, EnrichmentStation> = {
  'skip-tracing': 'phone-discovery',
};

/**
 * Station definitions with dependencies and metadata
 */
export const STATION_DEFINITIONS: Record<EnrichmentStation, StationConfig> = {
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn Data',
    description: 'Extract name, city, state from LinkedIn (foundation data)',
    cost: 'free',
    dependencies: [],
    provides: ['firstName', 'lastName', 'city', 'state'],
    required: true, // Always needed as foundation
  },
  zip: {
    id: 'zip',
    name: 'ZIP Code Lookup',
    description: 'Lookup ZIP code from city/state (free local database)',
    cost: 'free',
    dependencies: ['linkedin'], // Needs city/state
    provides: ['zipCode'],
    required: false,
  },
  gender: {
    id: 'gender',
    name: 'Gender Detection',
    description: 'Infer gender from first name using comprehensive name database (free, local)',
    cost: 'free',
    dependencies: ['linkedin'], // Needs first name
    provides: ['gender'],
    required: false,
  },
  'phone-discovery': {
    id: 'phone-discovery',
    name: 'Phone Discovery',
    description: 'Find phone numbers via skip-tracing API (paid)',
    cost: 'paid',
    dependencies: ['linkedin'], // Needs name (can work with just name)
    provides: ['phone', 'email', 'address'],
    required: false,
  },
  telnyx: {
    id: 'telnyx',
    name: 'Phone Validation',
    description: 'Validate phone and get carrier/line type (paid)',
    cost: 'paid',
    dependencies: ['phone-discovery'], // Needs phone number
    provides: ['lineType', 'carrierName', 'carrierType'],
    required: false,
  },
  'income-pre-qual': {
    id: 'income-pre-qual',
    name: 'Income Pre-Qualification',
    description: 'Estimate income from job title/location (free census API)',
    cost: 'free',
    dependencies: ['linkedin', 'zip'], // Needs ZIP for accuracy
    provides: ['incomePreQual'],
    required: false,
  },
  gatekeep: {
    id: 'gatekeep',
    name: 'Gatekeep Filter',
    description: 'Filter out VoIP/junk carriers (logic only, no API)',
    cost: 'free',
    dependencies: ['telnyx'], // Needs lineType/carrier
    provides: ['gatekeepPassed'],
    required: false,
  },
  'dnc-check': {
    id: 'dnc-check',
    name: 'DNC Check',
    description: 'Check Do Not Call registry (free)',
    cost: 'free',
    dependencies: ['phone-discovery', 'gatekeep'], // Needs phone + gatekeep must pass
    provides: ['dncStatus', 'canContact'],
    required: false,
  },
  age: {
    id: 'age',
    name: 'Age Enrichment',
    description: 'Get age/DOB via skip-tracing (paid, conditional)',
    cost: 'paid',
    dependencies: ['phone-discovery', 'gatekeep', 'dnc-check'], // Needs phone + gatekeep + DNC must pass
    provides: ['age', 'dob'],
    required: false,
  },
};

/**
 * Calculate optimal order of stations based on enabled stations
 * 
 * Rules:
 * 1. Free operations before paid operations
 * 2. Respect dependencies
 * 3. Foundation stations first (linkedin)
 * 4. Conditional stations last (age)
 */
export function calculateOptimalOrder(enabledStations: Set<EnrichmentStation>): EnrichmentStation[] {
  const order: EnrichmentStation[] = [];
  const processed = new Set<EnrichmentStation>();
  
  // Always include linkedin (required foundation)
  if (!enabledStations.has('linkedin')) {
    enabledStations.add('linkedin');
  }
  
  // Helper to check if all dependencies are satisfied
  const dependenciesSatisfied = (station: EnrichmentStation): boolean => {
    const config = STATION_DEFINITIONS[station];
    return config.dependencies.every(dep => 
      processed.has(dep) || (dep === 'linkedin' && enabledStations.has('linkedin'))
    );
  };
  
  // Helper to get station priority (lower = earlier)
  const getPriority = (station: EnrichmentStation): number => {
    const config = STATION_DEFINITIONS[station];
    let priority = 0;
    
    // Free operations first
    if (config.cost === 'free') priority -= 100;
    
    // Foundation stations first
    if (station === 'linkedin') priority -= 1000;
    
    // Conditional stations last
    if (station === 'age') priority += 100;
    
    // Count dependencies (more dependencies = later)
    priority += config.dependencies.length * 10;
    
    return priority;
  };
  
  // Process stations in optimal order
  const remaining = new Set(enabledStations);
  
  while (remaining.size > 0) {
    // Find stations with satisfied dependencies, sorted by priority
    const ready = Array.from(remaining)
      .filter(station => dependenciesSatisfied(station))
      .sort((a, b) => getPriority(a) - getPriority(b));
    
    if (ready.length === 0) {
      // Circular dependency or missing required station - add remaining in dependency order
      const fallback = Array.from(remaining).sort((a, b) => 
        STATION_DEFINITIONS[a].dependencies.length - STATION_DEFINITIONS[b].dependencies.length
      );
      order.push(...fallback);
      break;
    }
    
    // Add the highest priority ready station
    const next = ready[0];
    order.push(next);
    processed.add(next);
    remaining.delete(next);
  }
  
  return order;
}

/**
 * Get all possible station combinations and their optimal orders
 * Useful for validation and testing
 */
export function getAllStationCombinations(): Array<{
  enabled: EnrichmentStation[];
  order: EnrichmentStation[];
  cost: { free: number; paid: number };
}> {
  const stations: EnrichmentStation[] = [
    'linkedin',
    'zip',
    'phone-discovery',
    'telnyx',
    'income-pre-qual',
    'gatekeep',
    'dnc-check',
    'age',
  ];
  
  const combinations: Array<{
    enabled: EnrichmentStation[];
    order: EnrichmentStation[];
    cost: { free: number; paid: number };
  }> = [];
  
  // Generate all 2^8 = 256 combinations (excluding linkedin since it's always required)
  const optionalStations = stations.filter(s => s !== 'linkedin');
  const numCombinations = Math.pow(2, optionalStations.length);
  
  for (let i = 0; i < numCombinations; i++) {
    const enabled = new Set<EnrichmentStation>(['linkedin']); // Always include linkedin
    
    // Add stations based on bit pattern
    optionalStations.forEach((station, idx) => {
      if (i & (1 << idx)) {
        enabled.add(station);
      }
    });
    
    const order = calculateOptimalOrder(enabled);
    
    // Calculate cost
    const cost = {
      free: order.filter(s => STATION_DEFINITIONS[s].cost === 'free').length,
      paid: order.filter(s => STATION_DEFINITIONS[s].cost === 'paid').length,
    };
    
    combinations.push({
      enabled: Array.from(enabled),
      order,
      cost,
    });
  }
  
  return combinations;
}

/**
 * Validate station configuration
 * Returns errors if configuration is invalid
 */
export function validateStationConfig(enabledStations: Set<EnrichmentStation>): string[] {
  const errors: string[] = [];
  
  // Check required stations
  if (!enabledStations.has('linkedin')) {
    errors.push('LinkedIn station is required and cannot be disabled');
  }
  
  // Check dependencies
  for (const station of enabledStations) {
    const config = STATION_DEFINITIONS[station];
    for (const dep of config.dependencies) {
      if (!enabledStations.has(dep)) {
        errors.push(`${config.name} requires ${STATION_DEFINITIONS[dep].name}`);
      }
    }
  }
  
  return errors;
}

export function normalizeStationId(station: string): EnrichmentStation | null {
  if ((Object.keys(STATION_DEFINITIONS) as EnrichmentStation[]).includes(station as EnrichmentStation)) {
    return station as EnrichmentStation;
  }

  return STATION_ID_ALIASES[station] || null;
}

function getDirectDependents(station: EnrichmentStation): EnrichmentStation[] {
  return (Object.keys(STATION_DEFINITIONS) as EnrichmentStation[]).filter(candidate =>
    STATION_DEFINITIONS[candidate].dependencies.includes(station)
  );
}

function collectDependencies(
  station: EnrichmentStation,
  visited: Set<EnrichmentStation> = new Set()
): EnrichmentStation[] {
  if (visited.has(station)) {
    return [];
  }

  visited.add(station);

  const dependencies = STATION_DEFINITIONS[station].dependencies;
  const collected: EnrichmentStation[] = [];

  for (const dependency of dependencies) {
    collected.push(...collectDependencies(dependency, visited));
    collected.push(dependency);
  }

  return Array.from(new Set(collected));
}

function collectDependents(
  station: EnrichmentStation,
  visited: Set<EnrichmentStation> = new Set()
): EnrichmentStation[] {
  if (visited.has(station)) {
    return [];
  }

  visited.add(station);

  const dependents = getDirectDependents(station);
  const collected: EnrichmentStation[] = [];

  for (const dependent of dependents) {
    collected.push(dependent);
    collected.push(...collectDependents(dependent, visited));
  }

  return Array.from(new Set(collected));
}

export function addStationWithDependencies(
  enabledStations: Set<EnrichmentStation>,
  station: EnrichmentStation
): Set<EnrichmentStation> {
  const next = new Set(enabledStations);

  for (const dependency of collectDependencies(station)) {
    next.add(dependency);
  }

  next.add(station);
  next.add('linkedin');

  return next;
}

export function removeStationWithDependents(
  enabledStations: Set<EnrichmentStation>,
  station: EnrichmentStation
): Set<EnrichmentStation> {
  const next = new Set(enabledStations);

  if (STATION_DEFINITIONS[station].required) {
    return next;
  }

  next.delete(station);

  for (const dependent of collectDependents(station)) {
    if (!STATION_DEFINITIONS[dependent].required) {
      next.delete(dependent);
    }
  }

  return next;
}

export function normalizeStationConfig(
  enabledStations: Iterable<EnrichmentStation | string>
): { stations: Set<EnrichmentStation>; issues: StationDependencyIssue[] } {
  const normalized = new Set<EnrichmentStation>();
  for (const station of enabledStations) {
    const normalizedStation = normalizeStationId(String(station));
    if (normalizedStation) {
      normalized.add(normalizedStation);
    }
  }
  normalized.add('linkedin');

  const issues: StationDependencyIssue[] = [];

  let changed = true;
  while (changed) {
    changed = false;

    for (const station of Array.from(normalized)) {
      if (station === 'linkedin') {
        continue;
      }

      const missingDependencies = STATION_DEFINITIONS[station].dependencies.filter(
        dependency => !normalized.has(dependency)
      );

      if (missingDependencies.length > 0) {
        normalized.delete(station);
        issues.push({ station, missingDependencies });
        changed = true;
      }
    }
  }

  return { stations: normalized, issues };
}

/**
 * Get default station configuration (all enabled)
 */
export function getDefaultStationConfig(): Set<EnrichmentStation> {
  return new Set<EnrichmentStation>([
    'linkedin',
    'zip',
    'gender',
    'income-pre-qual',
    'phone-discovery',
    'telnyx',
    'gatekeep',
    'dnc-check',
    'age',
  ]);
}
