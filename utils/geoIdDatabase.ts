/**
 * Geo ID Database - Persistent Location ID Storage
 * 
 * Builds and maintains a database of LinkedIn location IDs by:
 * 1. Extracting from API responses (lead profiles, company data)
 * 2. Discovering via external APIs (HarvestAPI, saleLeads, json_to_url)
 * 3. Storing in a persistent JSON file
 * 4. Auto-expanding as we encounter new locations
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDataFilePath, ensureDataDirectory, safeWriteFile, safeReadFile } from './dataDirectory';

export interface GeoIdEntry {
  locationId: string; // Numeric ID (e.g., "103644278")
  fullId: string; // URN format (e.g., "urn:li:fs_geo:103644278")
  locationName: string; // Human-readable name (e.g., "Maryland, United States")
  locationText: string; // Original search text (e.g., "Maryland")
  city?: string;
  state?: string;
  country?: string;
  source: 'profile' | 'company' | 'harvest' | 'saleleads' | 'json_to_url' | 'manual';
  discoveredAt: string; // ISO timestamp
  verifiedAt?: string; // Last verified timestamp
  usageCount: number; // How many times this ID has been used
}

/**
 * Legacy entry format found in existing database files
 * These entries use 'id' instead of 'locationId', 'name' instead of 'locationName', etc.
 */
interface LegacyGeoIdEntry {
  id?: string; // Legacy: numeric ID
  locationId?: string; // Current: numeric ID
  fullId?: string; // URN format
  name?: string; // Legacy: location name
  locationName?: string; // Current: location name
  locationText?: string; // Current: original search text
  city?: string;
  state?: string;
  country?: string;
  abbr?: string; // Legacy: state abbreviation
  source?: 'profile' | 'company' | 'harvest' | 'saleleads' | 'json_to_url' | 'manual' | string;
  timestamp?: string; // Legacy: ISO timestamp
  discoveredAt?: string; // Current: ISO timestamp
  verifiedAt?: string;
  usageCount?: number;
}

export interface GeoIdDatabase {
  version: string;
  lastUpdated: string;
  entries: Record<string, GeoIdEntry>; // Key: normalized location text
}

const DB_VERSION = '1.0.0';

/**
 * Gets the database file path using centralized data directory
 */
function getDbFilePath(): string {
  return getDataFilePath('geo-id-database.json');
}

/**
 * Normalizes location text for consistent lookup
 * Uses underscores for multi-word locations to match database keys
 */
export function normalizeLocationText(locationText: string): string {
  return locationText
    .toLowerCase()
    .trim()
    .replace(/[,]+/g, '')  // Remove commas FIRST
    .replace(/\s+/g, '_')  // Then convert spaces to underscores
    .replace(/_+/g, '_')   // Collapse multiple underscores
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
}

/**
 * Parses location text into components (city, state, country)
 */
export function parseLocationComponents(locationText: string): {
  city?: string;
  state?: string;
  country?: string;
} {
  const parts = locationText.split(',').map(p => p.trim()).filter(p => p.length > 0);
  
  const components: { city?: string; state?: string; country?: string } = {};
  
  // Common country patterns
  const countries = ['united states', 'usa', 'canada', 'uk', 'united kingdom', 'australia', 'germany', 'france', 'spain', 'italy', 'india', 'china', 'japan'];
  
  // Check last part for country
  if (parts.length > 0) {
    const lastPart = parts[parts.length - 1].toLowerCase();
    if (countries.some(c => lastPart.includes(c))) {
      components.country = parts[parts.length - 1];
    }
  }
  
  // For US/Canada format: "City, State, Country"
  if (parts.length === 3) {
    components.city = parts[0];
    components.state = parts[1];
    components.country = parts[2];
  } else if (parts.length === 2) {
    // Could be "City, State" or "City, Country"
    const secondPart = parts[1].toLowerCase();
    if (countries.some(c => secondPart.includes(c))) {
      components.city = parts[0];
      components.country = parts[1];
    } else {
      // Assume State
      components.state = parts[0];
      components.country = parts[1];
    }
  } else if (parts.length === 1) {
    // Could be state or country
    const singlePart = parts[0].toLowerCase();
    if (countries.some(c => singlePart.includes(c))) {
      components.country = parts[0];
    } else {
      components.state = parts[0];
    }
  }
  
  return components;
}

/**
 * Normalizes a legacy entry to the current GeoIdEntry format
 */
function normalizeLegacyEntry(
  rawEntry: LegacyGeoIdEntry,
  normalizedKey: string
): GeoIdEntry {
  const locationId = rawEntry.locationId || rawEntry.id || '';
  const locationName = rawEntry.locationName || rawEntry.name || normalizedKey;
  const locationText = rawEntry.locationText || rawEntry.name || normalizedKey;
  const fullId = rawEntry.fullId || (locationId ? `urn:li:fs_geo:${locationId}` : '');
  const discoveredAt = rawEntry.discoveredAt || rawEntry.timestamp || new Date().toISOString();
  
  // Normalize source to valid type
  const validSources: GeoIdEntry['source'][] = ['profile', 'company', 'harvest', 'saleleads', 'json_to_url', 'manual'];
  const source = (validSources.includes(rawEntry.source as GeoIdEntry['source']) 
    ? rawEntry.source 
    : 'manual') as GeoIdEntry['source'];
  
  return {
    locationId,
    fullId,
    locationName,
    locationText,
    city: rawEntry.city,
    state: rawEntry.state || rawEntry.name,
    country: rawEntry.country,
    source,
    discoveredAt,
    verifiedAt: rawEntry.verifiedAt,
    usageCount: rawEntry.usageCount ?? 0
  };
}

/**
 * Loads the geo ID database from disk and normalizes legacy entries
 */
export function loadGeoIdDatabase(): GeoIdDatabase {
  try {
    ensureDataDirectory();
    const dbFilePath = getDbFilePath();
    
    // Load existing database
    const data = safeReadFile(dbFilePath);
    if (data) {
      const rawDb = JSON.parse(data);
      
      // Handle both {entries: {}} and direct {} database formats
      const rawEntries = rawDb.entries || rawDb;
      
      // Normalize all entries to current format
      const normalizedEntries: Record<string, GeoIdEntry> = {};
      for (const [key, rawEntry] of Object.entries(rawEntries)) {
        // Skip metadata fields
        if (key === 'version' || key === 'lastUpdated') {
          continue;
        }
        
        const entry = normalizeLegacyEntry(rawEntry as LegacyGeoIdEntry, key);
        normalizedEntries[key] = entry;
      }
      
      return {
        version: rawDb.version || DB_VERSION,
        lastUpdated: rawDb.lastUpdated || new Date().toISOString(),
        entries: normalizedEntries
      };
    }
  } catch (error) {
    console.error('Error loading geo ID database:', error);
  }
  
  // Return empty database if file doesn't exist or error occurred
  return {
    version: DB_VERSION,
    lastUpdated: new Date().toISOString(),
    entries: {}
  };
}

/**
 * Saves the geo ID database to disk
 */
export function saveGeoIdDatabase(db: GeoIdDatabase): void {
  try {
    ensureDataDirectory();
    const dbFilePath = getDbFilePath();
    
    db.lastUpdated = new Date().toISOString();
    safeWriteFile(dbFilePath, JSON.stringify(db, null, 2));
  } catch (error) {
    console.error('Error saving geo ID database:', error);
  }
}

/**
 * Adds or updates a geo ID entry
 */
export function addGeoIdEntry(
  locationText: string,
  locationId: string,
  fullId: string,
  locationName: string,
  source: GeoIdEntry['source'],
  components?: { city?: string; state?: string; country?: string }
): GeoIdEntry {
  const db = loadGeoIdDatabase();
  const normalizedKey = normalizeLocationText(locationText);
  
  const parsedComponents = components || parseLocationComponents(locationName);
  
  const entry: GeoIdEntry = {
    locationId,
    fullId,
    locationName,
    locationText,
    ...parsedComponents,
    source,
    discoveredAt: new Date().toISOString(),
    usageCount: 0
  };
  
  // Update existing or add new
  if (db.entries[normalizedKey]) {
    // Keep discovery date, update other fields
    entry.discoveredAt = db.entries[normalizedKey].discoveredAt;
    entry.usageCount = db.entries[normalizedKey].usageCount;
    entry.verifiedAt = new Date().toISOString();
  }
  
  db.entries[normalizedKey] = entry;
  saveGeoIdDatabase(db);
  
  return entry;
}

/**
 * Looks up a geo ID from the database
 */
export function lookupGeoId(locationText: string): GeoIdEntry | null {
  const db = loadGeoIdDatabase();
  const normalizedKey = normalizeLocationText(locationText);
  
  const entry = db.entries[normalizedKey];
  if (entry) {
    // Increment usage count
    entry.usageCount = (entry.usageCount || 0) + 1;
    
    // Save updated usage count back to database
    db.entries[normalizedKey] = entry;
    saveGeoIdDatabase(db);
    
    return entry;
  }
  
  return null;
}

/**
 * Extracts geo ID from a LinkedIn profile response
 */
export function extractGeoIdFromProfile(profile: any): {
  locationId: string | null;
  locationName: string | null;
} | null {
  if (!profile || typeof profile !== 'object') return null;
  
  const locationName = profile.geoRegion || profile.location || profile.locationName || null;
  
  // Check for geo ID fields
  const geoIdFields = [
    'geoId', 'geo_id', 'locationId', 'location_id',
    'geoUrn', 'geo_urn', 'geoLocationId', 'geo_location_id'
  ];
  
  for (const field of geoIdFields) {
    if (profile[field]) {
      const geoId = String(profile[field]);
      
      // Extract numeric ID from URN format
      const urnMatch = geoId.match(/urn:li:(?:fs_)?geo:(\d+)/);
      if (urnMatch && locationName) {
        return {
          locationId: urnMatch[1],
          locationName
        };
      }
      
      // If it's just numeric, return it
      if (/^\d+$/.test(geoId) && locationName) {
        return {
          locationId: geoId,
          locationName
        };
      }
    }
  }
  
  // Check nested objects
  if (profile.profile) {
    return extractGeoIdFromProfile(profile.profile);
  }
  
  if (profile.data) {
    return extractGeoIdFromProfile(profile.data);
  }
  
  return null;
}

/**
 * Extracts geo IDs from an array of lead profiles
 */
export function extractGeoIdsFromLeads(leads: any[]): number {
  if (!Array.isArray(leads) || leads.length === 0) return 0;
  
  let extracted = 0;
  
  for (const lead of leads) {
    const geoData = extractGeoIdFromProfile(lead);
    if (geoData?.locationId && geoData?.locationName) {
      addGeoIdEntry(
        geoData.locationName,
        geoData.locationId,
        `urn:li:fs_geo:${geoData.locationId}`,
        geoData.locationName,
        'profile'
      );
      extracted++;
    }
  }
  
  return extracted;
}

/**
 * Gets database statistics
 */
export function getGeoIdDatabaseStats(): {
  totalEntries: number;
  bySource: Record<string, number>;
  byCountry: Record<string, number>;
  byState: Record<string, number>;
  mostUsed: GeoIdEntry[];
  recentlyAdded: GeoIdEntry[];
} {
  const db = loadGeoIdDatabase();
  const entries = Object.values(db.entries);
  
  const stats = {
    totalEntries: entries.length,
    bySource: {} as Record<string, number>,
    byCountry: {} as Record<string, number>,
    byState: {} as Record<string, number>,
    mostUsed: entries.sort((a, b) => b.usageCount - a.usageCount).slice(0, 10),
    recentlyAdded: entries.sort((a, b) => 
      new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime()
    ).slice(0, 10)
  };
  
  for (const entry of entries) {
    // Count by source
    stats.bySource[entry.source] = (stats.bySource[entry.source] || 0) + 1;
    
    // Count by country
    if (entry.country) {
      stats.byCountry[entry.country] = (stats.byCountry[entry.country] || 0) + 1;
    }
    
    // Count by state
    if (entry.state) {
      stats.byState[entry.state] = (stats.byState[entry.state] || 0) + 1;
    }
  }
  
  return stats;
}

/**
 * Exports database to CSV format
 */
export function exportGeoIdDatabaseToCSV(): string {
  const db = loadGeoIdDatabase();
  const entries = Object.values(db.entries);
  
  // CSV header
  const headers = [
    'locationId',
    'fullId',
    'locationName',
    'locationText',
    'city',
    'state',
    'country',
    'source',
    'discoveredAt',
    'verifiedAt',
    'usageCount'
  ];
  
  // CSV rows
  const rows = entries.map(entry => [
    entry.locationId,
    entry.fullId,
    entry.locationName,
    entry.locationText,
    entry.city || '',
    entry.state || '',
    entry.country || '',
    entry.source,
    entry.discoveredAt,
    entry.verifiedAt || '',
    entry.usageCount.toString()
  ]);
  
  // Escape CSV values (handle commas and quotes)
  const escapeCsv = (value: string): string => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };
  
  // Build CSV
  const csvLines = [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => row.map(escapeCsv).join(','))
  ];
  
  return csvLines.join('\n');
}

