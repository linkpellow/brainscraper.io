/**
 * Verify Geo ID Database
 * 
 * Tests that all 30 states are properly stored and accessible
 * Run with: npx tsx scripts/verify-geo-database.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const EXPECTED_STATES = [
  { name: 'Alabama', abbr: 'AL', id: '102240587' },
  { name: 'Arkansas', abbr: 'AR', id: '102790221' },
  { name: 'Colorado', abbr: 'CO', id: '105763813' },
  { name: 'Delaware', abbr: 'DE', id: '105375497' },
  { name: 'Florida', abbr: 'FL', id: '101318387' },
  { name: 'Georgia', abbr: 'GA', id: '106315325' },
  { name: 'Illinois', abbr: 'IL', id: '101949407' },
  { name: 'Indiana', abbr: 'IN', id: '103336534' },
  { name: 'Iowa', abbr: 'IA', id: '103078544' },
  { name: 'Kansas', abbr: 'KS', id: '104403803' },
  { name: 'Kentucky', abbr: 'KY', id: '106470801' },
  { name: 'Louisiana', abbr: 'LA', id: '101822552' },
  { name: 'Maryland', abbr: 'MD', id: '100809221' },
  { name: 'Michigan', abbr: 'MI', id: '103051080' },
  { name: 'Mississippi', abbr: 'MS', id: '106899551' },
  { name: 'Missouri', abbr: 'MO', id: '101486475' },
  { name: 'Montana', abbr: 'MT', id: '101758306' },
  { name: 'Nebraska', abbr: 'NE', id: '101197782' },
  { name: 'Nevada', abbr: 'NV', id: '101690912' },
  { name: 'North Carolina', abbr: 'NC', id: '103255397' },
  { name: 'Ohio', abbr: 'OH', id: '106981407' },
  { name: 'Oklahoma', abbr: 'OK', id: '101343299' },
  { name: 'South Carolina', abbr: 'SC', id: '102687171' },
  { name: 'South Dakota', abbr: 'SD', id: '100115110' },
  { name: 'Tennessee', abbr: 'TN', id: '104629187' },
  { name: 'Texas', abbr: 'TX', id: '102748797' },
  { name: 'Utah', abbr: 'UT', id: '104102239' },
  { name: 'Virginia', abbr: 'VA', id: '101630962' },
  { name: 'Wisconsin', abbr: 'WI', id: '104454774' },
  { name: 'West Virginia', abbr: 'WV', id: '106420769' },
];

function normalizeLocationText(text: string): string {
  // Multi-word states use underscores in the database
  return text.toLowerCase().trim().replace(/\s+/g, '_');
}

function verifyDatabase() {
  const dbPath = path.join(process.cwd(), 'data', 'geo-id-database.json');
  
  console.log('🔍 Verifying Geo ID Database\n');
  console.log('='.repeat(80));
  
  // Check if database exists
  if (!fs.existsSync(dbPath)) {
    console.error('❌ Database file not found at:', dbPath);
    process.exit(1);
  }
  
  // Load database
  const content = fs.readFileSync(dbPath, 'utf-8');
  const db = JSON.parse(content);
  
  console.log(`📂 Database file: ${dbPath}`);
  console.log(`📊 Total entries: ${Object.keys(db.entries || db).length}`);
  console.log(`📅 Last updated: ${db.lastUpdated || 'Unknown'}\n`);
  
  let passed = 0;
  let failed = 0;
  const issues: string[] = [];
  
  // Get entries object (handle both {entries: {}} and direct {} formats)
  const entries = db.entries || db;
  
  // Verify each state
  for (const state of EXPECTED_STATES) {
    const nameKey = normalizeLocationText(state.name);
    const abbrKey = normalizeLocationText(state.abbr);
    
    const nameEntry = entries[nameKey];
    const abbrEntry = entries[abbrKey];
    
    if (!nameEntry) {
      console.log(`❌ ${state.name} (${state.abbr}): Name entry missing`);
      issues.push(`Missing name entry for ${state.name}`);
      failed++;
      continue;
    }
    
    if (!abbrEntry) {
      console.log(`⚠️  ${state.name} (${state.abbr}): Abbreviation entry missing`);
      issues.push(`Missing abbreviation entry for ${state.abbr}`);
    }
    
    if (nameEntry.id !== state.id) {
      console.log(`❌ ${state.name}: ID mismatch (expected ${state.id}, got ${nameEntry.id})`);
      issues.push(`ID mismatch for ${state.name}: expected ${state.id}, got ${nameEntry.id}`);
      failed++;
      continue;
    }
    
    if (abbrEntry && abbrEntry.id !== state.id) {
      console.log(`❌ ${state.abbr}: ID mismatch (expected ${state.id}, got ${abbrEntry.id})`);
      issues.push(`ID mismatch for ${state.abbr}: expected ${state.id}, got ${abbrEntry.id}`);
      failed++;
      continue;
    }
    
    // Verify fullId format
    const expectedFullId = `urn:li:fs_geo:${state.id}`;
    if (nameEntry.fullId !== expectedFullId) {
      console.log(`⚠️  ${state.name}: fullId format issue (expected ${expectedFullId}, got ${nameEntry.fullId})`);
      issues.push(`fullId format issue for ${state.name}`);
    }
    
    console.log(`✅ ${state.name.padEnd(20)} (${state.abbr}) = ${state.id}`);
    passed++;
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 VERIFICATION SUMMARY:');
  console.log(`✅ Passed: ${passed}/${EXPECTED_STATES.length} states`);
  console.log(`❌ Failed: ${failed}/${EXPECTED_STATES.length} states`);
  
  if (issues.length > 0) {
    console.log('\n⚠️  Issues found:');
    issues.forEach(issue => console.log(`   - ${issue}`));
  }
  
  if (failed === 0) {
    console.log('\n🎉 ALL STATES VERIFIED SUCCESSFULLY!');
    console.log('✅ Database is ready for production use');
    console.log('\n💡 Next step: Test location filtering in the app');
    console.log('   Example: Search for "Software Engineer" in "Texas"');
  } else {
    console.log('\n❌ Database verification failed');
    process.exit(1);
  }
}

verifyDatabase();

