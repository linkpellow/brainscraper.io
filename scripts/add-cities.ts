/**
 * Add Cities to Geo ID Database
 * 
 * Easy script to add cities with their geo IDs
 * Run with: npx tsx scripts/add-cities.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface CityEntry {
  city: string;
  state: string;
  stateAbbr: string;
  id: string;
  fullName?: string; // e.g., "Greater Indianapolis" or "Miami, Florida, United States"
}

// ADD CITIES HERE (from Ghost Genius tool screenshots)
const CITIES: CityEntry[] = [
  // Indiana cities
  { city: 'Carmel', state: 'Indiana', stateAbbr: 'IN', id: '104433150' },
  
  // Add more cities as you find them from Ghost Genius screenshots
  // Examples from screenshots you've shown:
  // { city: 'Miami', state: 'Florida', stateAbbr: 'FL', id: '102394087' },
  // { city: 'Orlando', state: 'Florida', stateAbbr: 'FL', id: '105142029' },
  // { city: 'Tampa', state: 'Florida', stateAbbr: 'FL', id: '105517665' },
  // { city: 'Denver', state: 'Colorado', stateAbbr: 'CO', id: '103736294' },
  // { city: 'Chicago', state: 'Illinois', stateAbbr: 'IL', id: '103112676' },
  // { city: 'Detroit', state: 'Michigan', stateAbbr: 'MI', id: '103624908' },
  // { city: 'Baltimore', state: 'Maryland', stateAbbr: 'MD', id: '106330734' },
  // { city: 'Austin', state: 'Texas', stateAbbr: 'TX', id: '90000064' },
  // { city: 'Houston', state: 'Texas', stateAbbr: 'TX', id: '103743442' },
  // { city: 'Charlotte', state: 'North Carolina', stateAbbr: 'NC', id: '102264677' },
  // { city: 'Raleigh', state: 'North Carolina', stateAbbr: 'NC', id: '100197101' },
  // { city: 'Columbus', state: 'Ohio', stateAbbr: 'OH', id: '102812094' },
  // { city: 'Cincinnati', state: 'Ohio', stateAbbr: 'OH', id: '106310628' },
  // { city: 'Virginia Beach', state: 'Virginia', stateAbbr: 'VA', id: '106468467' },
  // { city: 'Nashville', state: 'Tennessee', stateAbbr: 'TN', id: '105573479' },
  // { city: 'Memphis', state: 'Tennessee', stateAbbr: 'TN', id: '100420597' },
  // { city: 'Indianapolis', state: 'Indiana', stateAbbr: 'IN', id: '100871315' },
  // { city: 'Grand Rapids', state: 'Michigan', stateAbbr: 'MI', id: '100061294' },
];

function normalizeLocationText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, '_');
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
  
  for (const city of CITIES) {
    if (!city.id || city.id.trim() === '') {
      console.log(`⏭️  Skipped: ${city.city}, ${city.state} (no ID provided)`);
      skipped++;
      continue;
    }
    
    // Validate ID is numeric
    if (!/^\d+$/.test(city.id)) {
      console.log(`❌ Error: ${city.city}, ${city.state} - Invalid ID format: ${city.id}`);
      continue;
    }
    
    const fullLocationName = city.fullName || `${city.city}, ${city.state}, United States`;
    
    // Create entry for "city, state" format (e.g., "carmel, indiana")
    const cityStateKey = normalizeLocationText(`${city.city}, ${city.state}`);
    const cityStateEntry = {
      id: city.id,
      fullId: `urn:li:fs_geo:${city.id}`,
      locationName: fullLocationName,
      name: city.city,
      city: city.city,
      state: city.state,
      stateAbbr: city.stateAbbr,
      country: 'United States',
      source: 'manual',
      timestamp: new Date().toISOString(),
      usageCount: 0
    };
    
    // Create entry for "city, state abbr" format (e.g., "carmel, in")
    const cityAbbrKey = normalizeLocationText(`${city.city}, ${city.stateAbbr}`);
    const cityAbbrEntry = {
      ...cityStateEntry,
      locationName: `${city.city}, ${city.stateAbbr}, United States`
    };
    
    // Create entry for just city name (e.g., "carmel")
    const cityOnlyKey = normalizeLocationText(city.city);
    const cityOnlyEntry = {
      ...cityStateEntry,
      locationName: `${city.city}, ${city.state}, United States`
    };
    
    // Add all three variants
    const isNew = !db[cityStateKey];
    
    db[cityStateKey] = cityStateEntry;
    db[cityAbbrKey] = cityAbbrEntry;
    db[cityOnlyKey] = cityOnlyEntry;
    
    if (isNew) {
      console.log(`✅ Added: ${city.city}, ${city.state} (${city.stateAbbr}) = ${city.id}`);
      console.log(`   Keys: "${cityStateKey}", "${cityAbbrKey}", "${cityOnlyKey}"`);
      added++;
    } else {
      console.log(`🔄 Updated: ${city.city}, ${city.state} (${city.stateAbbr}) = ${city.id}`);
      updated++;
    }
  }
  
  // Save database
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 Summary:');
  console.log(`✅ Added: ${added} new cities (${added * 3} entries with variants)`);
  console.log(`🔄 Updated: ${updated} existing cities`);
  console.log(`⏭️  Skipped: ${skipped} cities (no ID provided)`);
  console.log(`\n💾 Database saved to: ${dbPath}`);
  console.log(`📁 Total entries in database: ${Object.keys(db).length}`);
  
  console.log('\n💡 Usage examples:');
  console.log('   Search: "Carmel, Indiana" → ID: 104433150');
  console.log('   Search: "Carmel, IN" → ID: 104433150');
  console.log('   Search: "Carmel" → ID: 104433150');
  
  console.log('\n📝 To add more cities:');
  console.log('   1. Use Ghost Genius tool: https://www.ghostgenius.fr/tools/search-sales-navigator-locations-id');
  console.log('   2. Add entries to CITIES array in this script');
  console.log('   3. Run: npx tsx scripts/add-cities.ts');
}

addCitiesToDatabase();

