/**
 * Build Geo ID Database
 * 
 * Script to pre-populate the geo ID database with common US states
 * Run with: npx tsx scripts/build-geo-id-database.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { discoverLocationIdsBatch } from '../utils/geoIdDiscoveryService';
import { getGeoIdDatabaseStats, exportGeoIdDatabaseToCSV } from '../utils/geoIdDatabase';
import * as fs from 'fs';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

// Common US states to discover
const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
  'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
  'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
  'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
  'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
  'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma',
  'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming'
];

// Major cities
const MAJOR_CITIES = [
  'New York, NY', 'Los Angeles, CA', 'Chicago, IL', 'Houston, TX', 'Phoenix, AZ',
  'Philadelphia, PA', 'San Antonio, TX', 'San Diego, CA', 'Dallas, TX', 'San Jose, CA',
  'Austin, TX', 'Jacksonville, FL', 'Fort Worth, TX', 'Columbus, OH', 'Charlotte, NC',
  'San Francisco, CA', 'Indianapolis, IN', 'Seattle, WA', 'Denver, CO', 'Boston, MA',
  'Nashville, TN', 'Detroit, MI', 'Portland, OR', 'Las Vegas, NV', 'Miami, FL',
  'Atlanta, GA', 'Baltimore, MD', 'Washington, DC'
];

async function buildDatabase() {
  if (!RAPIDAPI_KEY) {
    console.error('❌ RAPIDAPI_KEY not found in .env.local');
    process.exit(1);
  }

  console.log('🔨 Building Geo ID Database\n');
  console.log('This will discover location IDs for all US states and major cities');
  console.log('It may take 10-15 minutes to complete due to rate limiting\n');

  // Discover US states
  console.log('📍 Discovering US States...\n');
  await discoverLocationIdsBatch(US_STATES, RAPIDAPI_KEY, (current, total, location) => {
    console.log(`[${current}/${total}] Discovering: ${location}`);
  });

  console.log('\n📍 Discovering Major Cities...\n');
  await discoverLocationIdsBatch(MAJOR_CITIES, RAPIDAPI_KEY, (current, total, location) => {
    console.log(`[${current}/${total}] Discovering: ${location}`);
  });

  // Show statistics
  console.log('\n' + '='.repeat(80));
  console.log('📊 Database Statistics\n');
  
  const stats = getGeoIdDatabaseStats();
  console.log(`Total Entries: ${stats.totalEntries}`);
  console.log(`\nBy Source:`);
  Object.entries(stats.bySource).forEach(([source, count]) => {
    console.log(`  ${source}: ${count}`);
  });
  
  console.log(`\nBy Country:`);
  Object.entries(stats.byCountry).forEach(([country, count]) => {
    console.log(`  ${country}: ${count}`);
  });
  
  console.log(`\nMost Recently Added:`);
  stats.recentlyAdded.slice(0, 5).forEach((entry, i) => {
    console.log(`  ${i + 1}. ${entry.locationName} (${entry.locationId})`);
  });

  // Export to CSV
  const csv = exportGeoIdDatabaseToCSV();
  fs.writeFileSync('data/geo-id-database.csv', csv, 'utf-8');
  console.log('\n✅ Database exported to: data/geo-id-database.csv');
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Database build complete!');
  console.log('Location IDs are now cached for fast lookup');
}

buildDatabase().catch(console.error);

