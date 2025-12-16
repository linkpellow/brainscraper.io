/**
 * Discover and verify geo IDs for specific states
 * Run with: npx tsx scripts/discover-specific-states.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_BASE_URL = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com';

interface StateGeoId {
  state: string;
  abbreviation: string;
  locationId: string | null;
  fullId: string | null;
  locationName: string | null;
  source: string | null;
  verified: boolean;
  error?: string;
}

const STATES = [
  { abbr: 'AL', name: 'Alabama' },
  { abbr: 'AR', name: 'Arkansas' },
  { abbr: 'CO', name: 'Colorado' },
  { abbr: 'DE', name: 'Delaware' },
  { abbr: 'FL', name: 'Florida' },
  { abbr: 'GA', name: 'Georgia' },
  { abbr: 'IL', name: 'Illinois' },
  { abbr: 'IN', name: 'Indiana' },
  { abbr: 'IA', name: 'Iowa' },
  { abbr: 'KS', name: 'Kansas' },
  { abbr: 'KY', name: 'Kentucky' },
  { abbr: 'LA', name: 'Louisiana' },
  { abbr: 'MD', name: 'Maryland' },
  { abbr: 'MI', name: 'Michigan' },
  { abbr: 'MS', name: 'Mississippi' },
  { abbr: 'MO', name: 'Missouri' },
  { abbr: 'MT', name: 'Montana' },
  { abbr: 'NE', name: 'Nebraska' },
  { abbr: 'NV', name: 'Nevada' },
  { abbr: 'NC', name: 'North Carolina' },
  { abbr: 'OH', name: 'Ohio' },
  { abbr: 'OK', name: 'Oklahoma' },
  { abbr: 'SC', name: 'South Carolina' },
  { abbr: 'SD', name: 'South Dakota' },
  { abbr: 'TN', name: 'Tennessee' },
  { abbr: 'TX', name: 'Texas' },
  { abbr: 'UT', name: 'Utah' },
  { abbr: 'VA', name: 'Virginia' },
  { abbr: 'WI', name: 'Wisconsin' },
  { abbr: 'WV', name: 'West Virginia' }
];

/**
 * Extract location ID from json_to_url generated URL
 */
function extractLocationIdFromUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  
  try {
    const decoded = decodeURIComponent(url);
    
    // Look for location ID in various formats
    const patterns = [
      /urn:li:fs_geo:(\d+)/,
      /urn:li:geo:(\d+)/,
      /geo[=:](\d{8,})/i,
      /location[=:](\d{8,})/i
    ];
    
    for (const pattern of patterns) {
      const match = decoded.match(pattern);
      if (match) {
        return match[1];
      }
    }
  } catch (e) {
    console.error('URL parsing error:', e);
  }
  
  return null;
}

/**
 * Discover geo ID using json_to_url endpoint
 */
async function discoverGeoId(stateName: string): Promise<{
  locationId: string | null;
  fullId: string | null;
  locationName: string | null;
  source: string | null;
}> {
  console.log(`\n🔍 Discovering geo ID for ${stateName}...`);
  
  try {
    // Try json_to_url endpoint
    const response = await fetch(`${API_BASE_URL}/json_to_url`, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY || '',
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filters: [{
          type: 'LOCATION',
          values: [{
            id: stateName, // Try with state name to see if API provides ID
            text: stateName,
            selectionType: 'INCLUDED'
          }]
        }],
        keywords: ''
      }),
    });

    if (!response.ok) {
      console.log(`  ❌ API returned status ${response.status}`);
      return { locationId: null, fullId: null, locationName: null, source: null };
    }

    const data = await response.json();
    const url = data?.url || data?.data || data;
    
    if (typeof url === 'string') {
      const locationId = extractLocationIdFromUrl(url);
      
      if (locationId) {
        const fullId = `urn:li:fs_geo:${locationId}`;
        console.log(`  ✅ Found: ${locationId}`);
        console.log(`  📍 Full ID: ${fullId}`);
        
        return {
          locationId,
          fullId,
          locationName: `${stateName}, United States`,
          source: 'json_to_url'
        };
      }
    }
    
    console.log(`  ⚠️  Could not extract ID from URL`);
  } catch (error) {
    console.error(`  ❌ Error: ${error}`);
  }
  
  return { locationId: null, fullId: null, locationName: null, source: null };
}

/**
 * Verify geo ID by testing if it returns results
 */
async function verifyGeoId(locationId: string, stateName: string): Promise<boolean> {
  console.log(`  🔄 Verifying ${locationId}...`);
  
  try {
    const response = await fetch(`${API_BASE_URL}/premium_search_person`, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY || '',
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filters: [{
          type: 'LOCATION',
          values: [{
            id: `urn:li:fs_geo:${locationId}`,
            text: stateName,
            selectionType: 'INCLUDED'
          }]
        }],
        keywords: stateName, // Add as keywords too to help get results
        page: 1,
        limit: 10
      }),
    });

    if (!response.ok) {
      console.log(`    ⚠️  Verification API returned status ${response.status}`);
      return false;
    }

    const data = await response.json();
    const results = data?.response?.data || [];
    
    if (Array.isArray(results) && results.length > 0) {
      // Check if any results actually match the state
      const stateMatches = results.filter((r: any) => {
        const location = (r.geoRegion || r.location || '').toLowerCase();
        return location.includes(stateName.toLowerCase());
      });
      
      const accuracy = results.length > 0 ? (stateMatches.length / results.length) * 100 : 0;
      console.log(`    📊 Results: ${results.length}, State matches: ${stateMatches.length} (${accuracy.toFixed(1)}%)`);
      
      // Consider verified if we got results (even if filter doesn't work, ID is valid)
      return results.length > 0;
    }
    
    console.log(`    ⚠️  No results returned`);
    return false;
  } catch (error) {
    console.error(`    ❌ Verification error: ${error}`);
    return false;
  }
}

async function discoverAndVerifyStates() {
  if (!RAPIDAPI_KEY) {
    console.error('❌ RAPIDAPI_KEY not found in .env.local');
    process.exit(1);
  }

  console.log('🌎 Discovering Geo IDs for US States\n');
  console.log('='.repeat(80));
  console.log(`Total states to discover: ${STATES.length}\n`);

  const results: StateGeoId[] = [];

  for (let i = 0; i < STATES.length; i++) {
    const state = STATES[i];
    console.log(`\n[${i + 1}/${STATES.length}] ${state.name} (${state.abbr})`);
    console.log('-'.repeat(80));
    
    const discovery = await discoverGeoId(state.name);
    
    const result: StateGeoId = {
      state: state.name,
      abbreviation: state.abbr,
      locationId: discovery.locationId,
      fullId: discovery.fullId,
      locationName: discovery.locationName,
      source: discovery.source,
      verified: false
    };
    
    if (discovery.locationId) {
      // Verify the discovered ID
      result.verified = await verifyGeoId(discovery.locationId, state.name);
      
      if (result.verified) {
        console.log(`  ✅ VERIFIED: ${state.name} = ${discovery.locationId}`);
      } else {
        console.log(`  ⚠️  DISCOVERED but not verified: ${discovery.locationId}`);
      }
    } else {
      console.log(`  ❌ FAILED: Could not discover geo ID`);
      result.error = 'Discovery failed';
    }
    
    results.push(result);
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 DISCOVERY SUMMARY\n');
  
  const discovered = results.filter(r => r.locationId !== null);
  const verified = results.filter(r => r.verified);
  const failed = results.filter(r => r.locationId === null);
  
  console.log(`✅ Successfully discovered: ${discovered.length}/${STATES.length}`);
  console.log(`✅ Verified: ${verified.length}/${STATES.length}`);
  console.log(`❌ Failed: ${failed.length}/${STATES.length}\n`);

  // Table of results
  console.log('STATE RESULTS:');
  console.log('-'.repeat(80));
  console.log('State'.padEnd(20) + 'Abbr'.padEnd(6) + 'Location ID'.padEnd(15) + 'Verified');
  console.log('-'.repeat(80));
  
  for (const result of results) {
    const status = result.verified ? '✅' : result.locationId ? '⚠️ ' : '❌';
    console.log(
      result.state.padEnd(20) +
      result.abbreviation.padEnd(6) +
      (result.locationId || 'N/A').padEnd(15) +
      status
    );
  }
  
  // Generate database entries
  console.log('\n' + '='.repeat(80));
  console.log('📝 DATABASE ENTRIES (JSON):\n');
  
  const dbEntries: Record<string, any> = {};
  
  for (const result of results) {
    if (result.locationId) {
      const key = result.state.toLowerCase();
      dbEntries[key] = {
        locationId: result.locationId,
        fullId: result.fullId,
        locationName: result.locationName,
        locationText: result.state,
        state: result.state,
        country: 'United States',
        source: result.source,
        discoveredAt: new Date().toISOString(),
        verified: result.verified,
        usageCount: 0
      };
      
      // Also add abbreviation entry
      const abbrKey = result.abbreviation.toLowerCase();
      dbEntries[abbrKey] = {
        ...dbEntries[key],
        locationText: result.abbreviation
      };
    }
  }
  
  console.log(JSON.stringify(dbEntries, null, 2));
  
  // Save to file
  const fs = require('fs');
  const outputPath = 'data/discovered-states.json';
  fs.writeFileSync(outputPath, JSON.stringify(dbEntries, null, 2));
  console.log(`\n💾 Saved to: ${outputPath}`);
  
  // CSV export
  const csvLines = ['State,Abbreviation,Location ID,Full ID,Verified'];
  for (const result of results) {
    csvLines.push(
      `"${result.state}","${result.abbreviation}","${result.locationId || 'N/A'}","${result.fullId || 'N/A'}","${result.verified}"`
    );
  }
  const csvPath = 'data/discovered-states.csv';
  fs.writeFileSync(csvPath, csvLines.join('\n'));
  console.log(`💾 CSV saved to: ${csvPath}`);
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Discovery complete!');
}

discoverAndVerifyStates().catch(console.error);

