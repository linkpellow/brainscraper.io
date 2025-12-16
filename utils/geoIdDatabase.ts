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
 * Loads the geo ID database from disk
 */
export function loadGeoIdDatabase(): GeoIdDatabase {
  try {
    ensureDataDirectory();
    const dbFilePath = getDbFilePath();
    
    // Load existing database
    const data = safeReadFile(dbFilePath);
    if (data) {
      return JSON.parse(data);
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
  
  // Handle both {entries: {}} and direct {} database formats
  const entries = db.entries || db;
  
  const rawEntry = entries[normalizedKey];
  if (rawEntry) {
    // Normalize entry structure (some entries use 'id' instead of 'locationId')
    const entry: GeoIdEntry = {
      locationId: rawEntry.locationId || rawEntry.id || '',
      fullId: rawEntry.fullId || `urn:li:fs_geo:${rawEntry.id || rawEntry.locationId}`,
      locationName: rawEntry.locationName || rawEntry.name || locationText,
      locationText: rawEntry.locationText || locationText,
      city: rawEntry.city,
      state: rawEntry.state || rawEntry.name,
      country: rawEntry.country,
      source: (rawEntry.source as GeoIdEntry['source']) || 'manual',
      discoveredAt: rawEntry.discoveredAt || rawEntry.timestamp || new Date().toISOString(),
      verifiedAt: rawEntry.verifiedAt,
      usageCount: (rawEntry.usageCount || 0) + 1
    };
    
    // Update usage count in database
    entries[normalizedKey] = { ...rawEntry, usageCount: entry.usageCount };
    
    // Save back to database (preserve structure)
    if (db.entries) {
      db.entries = entries;
    }
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
  const entries = Object.values(db.entries);}

