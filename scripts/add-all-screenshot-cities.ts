/**
 * Add All Cities from Ghost Genius Screenshots
 * 
 * Pre-populated with cities visible in your screenshots.
 * Just paste the IDs you see and run!
 * 
 * Run with: npx tsx scripts/add-all-screenshot-cities.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface CityEntry {
  city: string;
  state: string;
  stateAbbr: string;
  id: string;
  verified?: boolean; // Mark cities you've verified with ✓
}

// Cities from your Ghost Genius screenshots - PASTE IDs AS YOU VERIFY THEM
const CITIES: CityEntry[] = [
  // ✅ VERIFIED CITIES (from screenshots)
  { city: 'Carmel', state: 'Indiana', stateAbbr: 'IN', id: '104433150', verified: true },
  
  // FLORIDA (from Florida screenshot)
  { city: 'Miami', state: 'Florida', stateAbbr: 'FL', id: '102394087' },
  { city: 'Orlando', state: 'Florida', stateAbbr: 'FL', id: '105142029' },
  { city: 'Tampa', state: 'Florida', stateAbbr: 'FL', id: '105517665' },
  
  // COLORADO (from Colorado screenshot)
  { city: 'Colorado Springs', state: 'Colorado', stateAbbr: 'CO', id: '100182490' },
  { city: 'Denver', state: 'Colorado', stateAbbr: 'CO', id: '103736294' },
  
  // ILLINOIS (from Illinois screenshot)
  { city: 'Chicago', state: 'Illinois', stateAbbr: 'IL', id: '103112676' },
  
  // TEXAS (from Texas screenshot)
  { city: 'Austin', state: 'Texas', stateAbbr: 'TX', id: '90000064' },
  { city: 'Houston', state: 'Texas', stateAbbr: 'TX', id: '103743442' },
  
  // MICHIGAN (from Michigan screenshot)
  { city: 'Detroit', state: 'Michigan', stateAbbr: 'MI', id: '103624908' },
  { city: 'Grand Rapids', state: 'Michigan', stateAbbr: 'MI', id: '100061294' },
  
  // INDIANA (from Indiana screenshot)
  { city: 'Indianapolis', state: 'Indiana', stateAbbr: 'IN', id: '100871315' },
  
  // OHIO (from Ohio screenshot)
  { city: 'Columbus', state: 'Ohio', stateAbbr: 'OH', id: '102812094' },
  { city: 'Cincinnati', state: 'Ohio', stateAbbr: 'OH', id: '106310628' },
  
  // NORTH CAROLINA (from North Carolina screenshot)
  { city: 'Charlotte', state: 'North Carolina', stateAbbr: 'NC', id: '102264677' },
  { city: 'Raleigh', state: 'North Carolina', stateAbbr: 'NC', id: '100197101' },
  
  // VIRGINIA (from Virginia screenshot)
  { city: 'Virginia Beach', state: 'Virginia', stateAbbr: 'VA', id: '106468467' },
  
  // MARYLAND (from Maryland screenshot)
  { city: 'Baltimore', state: 'Maryland', stateAbbr: 'MD', id: '106330734' },
  { city: 'Silver Spring', state: 'Maryland', stateAbbr: 'MD', id: '106026178' },
  
  // TENNESSEE (from Tennessee screenshot)
  { city: 'Nashville', state: 'Tennessee', stateAbbr: 'TN', id: '105573479' },
  { city: 'Memphis', state: 'Tennessee', stateAbbr: 'TN', id: '100420597' },
  { city: 'Knoxville', state: 'Tennessee', stateAbbr: 'TN', id: '104362759' },
  
  // SOUTH CAROLINA (from South Carolina screenshot)
  { city: 'Columbia', state: 'South Carolina', stateAbbr: 'SC', id: '90000176' },
  { city: 'Charleston', state: 'South Carolina', stateAbbr: 'SC', id: '90000144' },
  
  // IOWA (from Iowa screenshot)
  { city: 'Iowa City', state: 'Iowa', stateAbbr: 'IA', id: '105410114' },
  { city: 'Des Moines', state: 'Iowa', stateAbbr: 'IA', id: '105056705' },
  
  // UTAH (from Utah screenshot)
  { city: 'Salt Lake City', state: 'Utah', stateAbbr: 'UT', id: '103250458' },
  { city: 'West Valley City', state: 'Utah', stateAbbr: 'UT', id: '104252509' },
  { city: 'Ogden', state: 'Utah', stateAbbr: 'UT', id: '105219479' },
  
  // ADD MORE CITIES AS YOU FIND THEM:
  // Just copy the format above and paste new cities here!
  // { city: 'CityName', state: 'StateName', stateAbbr: 'XX', id: 'XXXXXXXXX' },
];

function normalizeLocationText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[,]+/g, '')  // Remove commas FIRST
    .replace(/\s+/g, '_')  // Then convert spaces to underscores
    .replace(/_+/g, '_')   // Collapse multiple underscores
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
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
  const addedCities: string[] = [];
  const updatedCities: string[] = [];
  
  console.log('🏙️  Adding Cities from Screenshots to Geo ID Database\n');
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
    
    const fullLocationName = `${city.city}, ${city.state}, United States`;
    
    // Create entry for "city, state" format (e.g., "miami,_florida")
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
      source: 'ghostgenius',
      timestamp: new Date().toISOString(),
      usageCount: 0,
      verified: city.verified || false
    };
    
    // Create entry for "city, state abbr" format (e.g., "miami,_fl")
    const cityAbbrKey = normalizeLocationText(`${city.city}, ${city.stateAbbr}`);
    const cityAbbrEntry = { ...cityStateEntry };
    
    // Create entry for just city name (e.g., "miami")
    const cityOnlyKey = normalizeLocationText(city.city);
    const cityOnlyEntry = { ...cityStateEntry };
    
    // Check if this is a new city
    const isNew = !db[cityStateKey];
    
    // Add all three variants
    db[cityStateKey] = cityStateEntry;
    db[cityAbbrKey] = cityAbbrEntry;
    db[cityOnlyKey] = cityOnlyEntry;
    
    const verifiedMark = city.verified ? ' ✓' : '';
    
    if (isNew) {
      console.log(`✅ Added: ${city.city}, ${city.state} (${city.stateAbbr}) = ${city.id}${verifiedMark}`);
      added++;
      addedCities.push(`${city.city}, ${city.stateAbbr}`);
    } else {
      console.log(`🔄 Updated: ${city.city}, ${city.state} (${city.stateAbbr}) = ${city.id}${verifiedMark}`);
      updated++;
      updatedCities.push(`${city.city}, ${city.stateAbbr}`);
    }
  }
  
  // Save database
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY:');
  console.log(`✅ Added: ${added} new cities (${added * 3} entries with variants)`);
  console.log(`🔄 Updated: ${updated} existing cities`);
  console.log(`⏭️  Skipped: ${skipped} cities (no ID provided)`);
  console.log(`\n💾 Database saved to: ${dbPath}`);
  console.log(`📁 Total entries in database: ${Object.keys(db).length}`);
  
  if (addedCities.length > 0) {
    console.log(`\n✨ New Cities Added:`);
    addedCities.forEach(c => console.log(`   • ${c}`));
  }
  
  if (updatedCities.length > 0) {
    console.log(`\n🔄 Cities Updated:`);
    updatedCities.forEach(c => console.log(`   • ${c}`));
  }
  
  // Show breakdown by state
  const byState: Record<string, number> = {};
  CITIES.forEach(c => {
    byState[c.stateAbbr] = (byState[c.stateAbbr] || 0) + 1;
  });
  
  console.log(`\n📍 Cities by State:`);
  Object.entries(byState)
    .sort(([, a], [, b]) => b - a)
    .forEach(([state, count]) => {
      console.log(`   ${state}: ${count} cities`);
    });
  
  console.log('\n💡 Next Steps:');
  console.log('   1. Test location lookup: npx tsx scripts/test-location-lookup.ts');
  console.log('   2. Try searching: "Miami, FL" or "Chicago" or "Austin, Texas"');
  console.log('   3. Add more cities from Ghost Genius tool and re-run this script');
}

addCitiesToDatabase();

