/**
 * Local ZIP Code Lookup - City + State → ZIP Centroid
 * FREE, LOCAL - No API calls
 * 
 * Uses a simple lookup table for common city/state combinations
 * Falls back to state-level ZIP ranges if city not found
 * 
 * NOTE: File operations (fs/path) only work server-side.
 * State centroids work everywhere (no fs needed).
 */

// Conditionally import Node.js modules only on server-side
let fs: typeof import('fs') | null = null;
let path: typeof import('path') | null = null;

if (typeof window === 'undefined') {
  // Server-side: safely import Node.js modules
  try {
    fs = require('fs');
    path = require('path');
  } catch (e) {
    // Not available (shouldn't happen server-side, but handle gracefully)
  }
}

interface ZipLookupEntry {
  city: string;
  state: string;
  zipcode: string;
  stateAbbr?: string;
}

// State-level ZIP code ranges (centroid ZIP for each state)
const STATE_ZIP_CENTROIDS: Record<string, string> = {
  'AL': '35201', 'AK': '99501', 'AZ': '85001', 'AR': '72201',
  'CA': '90001', 'CO': '80201', 'CT': '06101', 'DE': '19901',
  'FL': '33101', 'GA': '30301', 'HI': '96801', 'ID': '83701',
  'IL': '60601', 'IN': '46201', 'IA': '50301', 'KS': '66101',
  'KY': '40201', 'LA': '70101', 'ME': '04101', 'MD': '21201',
  'MA': '02101', 'MI': '48201', 'MN': '55401', 'MS': '39201',
  'MO': '63101', 'MT': '59101', 'NE': '68101', 'NV': '89101',
  'NH': '03101', 'NJ': '07001', 'NM': '87101', 'NY': '10001',
  'NC': '28201', 'ND': '58101', 'OH': '44101', 'OK': '73101',
  'OR': '97201', 'PA': '19101', 'RI': '02901', 'SC': '29201',
  'SD': '57101', 'TN': '37201', 'TX': '75201', 'UT': '84101',
  'VT': '05401', 'VA': '23201', 'WA': '98101', 'WV': '25301',
  'WI': '53201', 'WY': '82001', 'DC': '20001'
};

// Full state names to abbreviations
const STATE_ABBR_MAP: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC', 'washington dc': 'DC'
};

/**
 * Normalizes city name for lookup
 */
function normalizeCity(city: string): string {
  return city
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes state name/abbreviation
 */
function normalizeState(state: string): string {
  const normalized = state
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Check if it's already an abbreviation
  if (normalized.length === 2) {
    return normalized.toUpperCase();
  }
  
  // Look up full name
  return STATE_ABBR_MAP[normalized] || normalized.toUpperCase();
}

/**
 * Loads city/state ZIP lookup table from file (if exists)
 * Server-side only
 */
function loadZipLookupTable(): ZipLookupEntry[] {
  if (!fs || !path) return []; // Client-side: return empty, will use state centroids
  
  try {
    const zipLookupPath = path.join(process.cwd(), 'data', 'zip-lookup-table.json');
    if (fs.existsSync(zipLookupPath)) {
      const data = fs.readFileSync(zipLookupPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading ZIP lookup table:', error);
  }
  
  return [];
}

/**
 * Looks up ZIP code from city and state
 * Returns ZIP code or null if not found
 */
export function lookupZipFromCityState(city: string, state: string): string | null {
  if (!city || !state) return null;
  
  const normalizedCity = normalizeCity(city);
  const normalizedState = normalizeState(state);
  
  // Try exact city/state match from lookup table
  const lookupTable = loadZipLookupTable();
  const match = lookupTable.find(
    entry => 
      normalizeCity(entry.city) === normalizedCity &&
      normalizeState(entry.state) === normalizedState
  );
  
  if (match) {
    return match.zipcode;
  }
  
  // Fallback to state-level ZIP centroid
  if (normalizedState.length === 2 && STATE_ZIP_CENTROIDS[normalizedState]) {
    return STATE_ZIP_CENTROIDS[normalizedState];
  }
  
  // Try to find state abbreviation from full name
  const stateAbbr = STATE_ABBR_MAP[normalizedState.toLowerCase()];
  if (stateAbbr && STATE_ZIP_CENTROIDS[stateAbbr]) {
    return STATE_ZIP_CENTROIDS[stateAbbr];
  }
  
  return null;
}

/**
 * Adds a city/state ZIP mapping to the lookup table
 * Server-side only
 */
export function addZipLookupEntry(city: string, state: string, zipcode: string): void {
  if (!fs || !path) return; // Client-side: skip
  
  try {
    const zipLookupPath = path.join(process.cwd(), 'data', 'zip-lookup-table.json');
    const dataDir = path.dirname(zipLookupPath);
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const lookupTable = loadZipLookupTable();
    
    // Check if entry already exists
    const normalizedCity = normalizeCity(city);
    const normalizedState = normalizeState(state);
    
    const existingIndex = lookupTable.findIndex(
      entry => 
        normalizeCity(entry.city) === normalizedCity &&
        normalizeState(entry.state) === normalizedState
    );
    
    const entry: ZipLookupEntry = {
      city,
      state,
      zipcode,
      stateAbbr: normalizedState.length === 2 ? normalizedState : STATE_ABBR_MAP[normalizedState.toLowerCase()]
    };
    
    if (existingIndex >= 0) {
      lookupTable[existingIndex] = entry;
    } else {
      lookupTable.push(entry);
    }
    
    // Save back to file
    fs.writeFileSync(zipLookupPath, JSON.stringify(lookupTable, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving ZIP lookup table:', error);
  }
}
