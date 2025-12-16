/**
 * Add Cities to Geo ID Database
 * 
 * Adds city-level location IDs to the database
 * Run with: npx tsx scripts/add-cities-to-database.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface GeoEntry {
  name: string;
  id: string;
  fullId: string;
  locationName: string;
  city?: string;
  state?: string;
  country?: string;
  source: string;
  timestamp: string;
  usageCount?: number;
}

// ADD CITY IDs HERE (from Ghost Genius screenshots)
const CITY_GEO_IDS: Array<{
  city: string;
  state: string;
  id: string;
  fullName?: string; // Optional: if different from "City, State, United States"
}> = [
  // Tennessee cities
  { city: 'Nashville', state: 'Tennessee', id: '105573479' },
  { city: 'Memphis', state: 'Tennessee', id: '100420597' },
  { city: 'Knoxville', state: 'Tennessee', id: '104362759' },
  
  // Indiana cities
  { city: 'Carmel', state: 'Indiana', id: '104433150' },
  { city: 'Indianapolis', state: 'Indiana', id: '100871315' },
  
  // Add more cities here as you find them...
];

function normalizeLocationText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, '_').replace(/[,]+/g, '').replace(/_+/g, '_');
}

function addCitiesToDatabase() {
  const dbPath = path.join(process.cwd(), 'data', 'geo-id-database.json');
  
  // Load existing database
  let db: any = {};
  
  if (fs.existsSync(dbPath)) {
    const content = fs.readFileSync(dbPath, 'utf-8');
    db = JSON.parse(content);
  }
  
  let added = 0;
  let updated = 0;
  let skipped = 0;
  
  console.log('🏙️  Adding Cities to Geo ID Database\n');
  console.log('='.repeat(80));
  
  for (const cityData of CITY_GEO_IDS) {
    // Skip empty IDs
    if (!cityData.id || cityData.id.trim() === '') {
      console.log(`⏭️  Skipped: ${cityData.city}, ${cityData.state} (no ID provided)`);
      skipped++;
      continue;
    }
    
    // Validate ID is numeric
    if (!/^\d+$/.test(cityData.id)) {
      console.log(`❌ Error: ${cityData.city} - Invalid ID format: ${cityData.id}`);
      skipped++;
      continue;
    }
    
    const locationName = cityData.fullName || `${cityData.city}, ${cityData.state}, United States`;
    
    const entry: GeoEntry = {
      name: cityData.city,
      id: cityData.id,
      fullId: `urn:li:fs_geo:${cityData.id}`,
      locationName: locationName,
      city: cityData.city,
      state: cityData.state,
      country: 'United States',
      source: 'manual',
      timestamp: new Date().toISOString(),
      usageCount: 0
    };
    
    // Add city name entry (e.g., "nashville")
    const cityKey = normalizeLocationText(cityData.city);
    const cityStateKey = normalizeLocationText(`${cityData.city} ${cityData.state}`);
    const cityStateFullKey = normalizeLocationText(`${cityData.city}, ${cityData.state}`);
    
    // Check if updating existing entry
    const isUpdate = db[cityKey] || db[cityStateKey];
    
    // Add/update entries with different key formats
    db[cityKey] = entry;
    db[cityStateKey] = entry;
    db[cityStateFullKey] = entry;
    
    if (isUpdate) {
      console.log(`🔄 Updated: ${cityData.city}, ${cityData.state} = ${cityData.id}`);
      updated++;
    } else {
      console.log(`✅ Added: ${cityData.city}, ${cityData.state} = ${cityData.id}`);
      added++;
    }
  }
  
  // Save database
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 Summary:');
  console.log(`✅ Added: ${added} cities (${added * 3} entries with variants)`);
  console.log(`🔄 Updated: ${updated} cities`);
  console.log(`⏭️  Skipped: ${skipped} cities`);
  console.log(`\n💾 Database saved to: ${dbPath}`);
  console.log(`📁 Total entries in database: ${Object.keys(db).length}`);
  
  // Show what was added
  if (added > 0 || updated > 0) {
    console.log('\n✨ Cities now in database:');
    CITY_GEO_IDS.forEach(city => {
      if (city.id && city.id.trim() !== '') {
        console.log(`   📍 ${city.city}, ${city.state} (${city.id})`);
      }
    });
  }
  
  console.log('\n💡 To add more cities:');
  console.log('   1. Look up city at: https://www.ghostgenius.fr/tools/search-sales-navigator-locations-id');
  console.log('   2. Add to CITY_GEO_IDS array in this script');
  console.log('   3. Run: npx tsx scripts/add-cities-to-database.ts');
}

addCitiesToDatabase();

