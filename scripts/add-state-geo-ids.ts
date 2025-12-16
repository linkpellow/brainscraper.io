/**
 * Add State Geo IDs to Database
 * 
 * Easy script to add manually discovered state geo IDs
 * Run with: npx tsx scripts/add-state-geo-ids.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface GeoIdEntry {
  locationId: string;
  fullId: string;
  locationName: string;
  locationText: string;
  state: string;
  country: string;
  source: string;
  discoveredAt: string;
  usageCount: number;
}

// ADD YOUR STATE IDs HERE (from Ghost Genius tool or Sales Navigator)
const STATE_GEO_IDS: Record<string, string> = {
  // Example: 'Florida': '101318387',
  'Florida': '101318387',
  'Alabama': '',      // TODO: Add ID from Ghost Genius tool
  'Arkansas': '',     // TODO: Add ID
  'Colorado': '',     // TODO: Add ID
  'Delaware': '',     // TODO: Add ID
  'Georgia': '',      // TODO: Add ID
  'Illinois': '',     // TODO: Add ID
  'Indiana': '',      // TODO: Add ID
  'Iowa': '',         // TODO: Add ID
  'Kansas': '',       // TODO: Add ID
  'Kentucky': '',     // TODO: Add ID
  'Louisiana': '',    // TODO: Add ID
  'Maryland': '100809221', // Verified via Ghost Genius
  'Michigan': '',     // TODO: Add ID
  'Mississippi': '',  // TODO: Add ID
  'Missouri': '',     // TODO: Add ID
  'Montana': '',      // TODO: Add ID
  'Nebraska': '',     // TODO: Add ID
  'Nevada': '',       // TODO: Add ID
  'North Carolina': '', // TODO: Add ID
  'Ohio': '',         // TODO: Add ID
  'Oklahoma': '',     // TODO: Add ID
  'South Carolina': '', // TODO: Add ID
  'South Dakota': '', // TODO: Add ID
  'Tennessee': '',    // TODO: Add ID
  'Texas': '',        // TODO: Add ID
  'Utah': '',         // TODO: Add ID
  'Virginia': '',     // TODO: Add ID
  'Wisconsin': '',    // TODO: Add ID
  'West Virginia': '', // TODO: Add ID
};

const STATE_ABBREVIATIONS: Record<string, string> = {
  'Alabama': 'AL',
  'Arkansas': 'AR',
  'Colorado': 'CO',
  'Delaware': 'DE',
  'Florida': 'FL',
  'Georgia': 'GA',
  'Illinois': 'IL',
  'Indiana': 'IN',
  'Iowa': 'IA',
  'Kansas': 'KS',
  'Kentucky': 'KY',
  'Louisiana': 'LA',
  'Maryland': 'MD',
  'Michigan': 'MI',
  'Mississippi': 'MS',
  'Missouri': 'MO',
  'Montana': 'MT',
  'Nebraska': 'NE',
  'Nevada': 'NV',
  'North Carolina': 'NC',
  'Ohio': 'OH',
  'Oklahoma': 'OK',
  'South Carolina': 'SC',
  'South Dakota': 'SD',
  'Tennessee': 'TN',
  'Texas': 'TX',
  'Utah': 'UT',
  'Virginia': 'VA',
  'Wisconsin': 'WI',
  'West Virginia': 'WV',
};

function normalizeLocationText(text: string): string {
  return text.toLowerCase().trim().replace(/[,\s]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function addStateGeoIds() {
  const dbPath = path.join(process.cwd(), 'data', 'geo-id-database.json');
  
  // Load existing database
  let db: any = { version: '1.0.0', lastUpdated: new Date().toISOString(), entries: {} };
  
  if (fs.existsSync(dbPath)) {
    const content = fs.readFileSync(dbPath, 'utf-8');
    db = JSON.parse(content);
  }
  
  let added = 0;
  let skipped = 0;
  let errors = 0;
  
  console.log('📍 Adding State Geo IDs to Database\n');
  console.log('='.repeat(80));
  
  for (const [stateName, locationId] of Object.entries(STATE_GEO_IDS)) {
    // Skip empty IDs
    if (!locationId || locationId.trim() === '') {
      console.log(`⏭️  Skipped: ${stateName} (no ID provided)`);
      skipped++;
      continue;
    }
    
    // Validate ID is numeric
    if (!/^\d+$/.test(locationId)) {
      console.log(`❌ Error: ${stateName} - Invalid ID format: ${locationId}`);
      errors++;
      continue;
    }
    
    const abbreviation = STATE_ABBREVIATIONS[stateName] || '';
    const entry: GeoIdEntry = {
      locationId: locationId,
      fullId: `urn:li:fs_geo:${locationId}`,
      locationName: `${stateName}, United States`,
      locationText: stateName,
      state: stateName,
      country: 'United States',
      source: 'manual',
      discoveredAt: new Date().toISOString(),
      usageCount: 0
    };
    
    // Add state name entry
    const stateKey = normalizeLocationText(stateName);
    db.entries[stateKey] = entry;
    
    // Add abbreviation entry
    if (abbreviation) {
      const abbrKey = normalizeLocationText(abbreviation);
      db.entries[abbrKey] = {
        ...entry,
        locationText: abbreviation
      };
    }
    
    console.log(`✅ Added: ${stateName} (${abbreviation}) = ${locationId}`);
    added++;
  }
  
  // Update database metadata
  db.lastUpdated = new Date().toISOString();
  
  // Save database
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 Summary:');
  console.log(`✅ Added: ${added} states (${added * 2} entries with abbreviations)`);
  console.log(`⏭️  Skipped: ${skipped} states (no ID provided)`);
  console.log(`❌ Errors: ${errors} states`);
  console.log(`\n💾 Database saved to: ${dbPath}`);
  console.log(`📁 Total entries in database: ${Object.keys(db.entries).length}`);
  
  // Show missing states
  const missing = Object.entries(STATE_GEO_IDS)
    .filter(([_, id]) => !id || id.trim() === '')
    .map(([state]) => state);
  
  if (missing.length > 0) {
    console.log(`\n⚠️  Still missing ${missing.length} states:`);
    missing.forEach(state => console.log(`   - ${state}`));
    console.log('\n💡 Look these up at: https://www.ghostgenius.fr/tools/search-sales-navigator-locations-id');
  }
}

addStateGeoIds();

