/**
 * Test Location Lookup System
 * 
 * Tests that the geo ID database lookups work correctly for all states
 * Run with: npx tsx scripts/test-location-lookup.ts
 */

import { lookupGeoId, normalizeLocationText } from '../utils/geoIdDatabase';

const TEST_LOCATIONS = [
  // Test various formats for each state
  { input: 'Florida', expected: '101318387', description: 'Full state name' },
  { input: 'FL', expected: '101318387', description: 'State abbreviation' },
  { input: 'florida', expected: '101318387', description: 'Lowercase' },
  { input: 'FLORIDA', expected: '101318387', description: 'Uppercase' },
  
  { input: 'Texas', expected: '102748797', description: 'Full state name' },
  { input: 'TX', expected: '102748797', description: 'State abbreviation' },
  
  { input: 'Colorado', expected: '105763813', description: 'Full state name' },
  { input: 'CO', expected: '105763813', description: 'State abbreviation' },
  
  { input: 'Illinois', expected: '101949407', description: 'Full state name' },
  { input: 'IL', expected: '101949407', description: 'State abbreviation' },
  
  { input: 'Maryland', expected: '100809221', description: 'Full state name' },
  { input: 'MD', expected: '100809221', description: 'State abbreviation' },
  
  // Multi-word states (special case)
  { input: 'North Carolina', expected: '103255397', description: 'Multi-word state' },
  { input: 'NC', expected: '103255397', description: 'Multi-word abbreviation' },
  { input: 'north carolina', expected: '103255397', description: 'Lowercase multi-word' },
  
  { input: 'South Carolina', expected: '102687171', description: 'Multi-word state' },
  { input: 'SC', expected: '102687171', description: 'Multi-word abbreviation' },
  
  { input: 'South Dakota', expected: '100115110', description: 'Multi-word state' },
  { input: 'SD', expected: '100115110', description: 'Multi-word abbreviation' },
  
  { input: 'West Virginia', expected: '106420769', description: 'Multi-word state' },
  { input: 'WV', expected: '106420769', description: 'Multi-word abbreviation' },
];

function testLocationLookups() {
  console.log('🧪 Testing Location Lookup System\n');
  console.log('='.repeat(80));
  
  let passed = 0;
  let failed = 0;
  const issues: string[] = [];
  
  for (const test of TEST_LOCATIONS) {
    const entry = lookupGeoId(test.input);
    
    if (!entry) {
      console.log(`❌ "${test.input}" (${test.description}): Not found in database`);
      issues.push(`"${test.input}" not found`);
      failed++;
      continue;
    }
    
    if (entry.locationId !== test.expected) {
      console.log(`❌ "${test.input}" (${test.description}): ID mismatch`);
      console.log(`   Expected: ${test.expected}, Got: ${entry.locationId}`);
      issues.push(`"${test.input}" ID mismatch: expected ${test.expected}, got ${entry.locationId}`);
      failed++;
      continue;
    }
    
    // Verify fullId format
    const expectedFullId = `urn:li:fs_geo:${test.expected}`;
    if (entry.fullId !== expectedFullId) {
      console.log(`⚠️  "${test.input}": fullId format issue`);
      console.log(`   Expected: ${expectedFullId}, Got: ${entry.fullId}`);
      issues.push(`"${test.input}" fullId format issue`);
    }
    
    console.log(`✅ "${test.input.padEnd(20)}" (${test.description.padEnd(25)}) → ${entry.locationId}`);
    passed++;
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY:');
  console.log(`✅ Passed: ${passed}/${TEST_LOCATIONS.length} lookups`);
  console.log(`❌ Failed: ${failed}/${TEST_LOCATIONS.length} lookups`);
  
  if (issues.length > 0) {
    console.log('\n⚠️  Issues found:');
    issues.forEach(issue => console.log(`   - ${issue}`));
  }
  
  if (failed === 0) {
    console.log('\n🎉 ALL LOOKUPS PASSED!');
    console.log('✅ Location lookup system is working correctly');
    console.log('\n💡 Testing normalization examples:');
    
    const examples = [
      'Florida',
      'TEXAS',
      'north carolina',
      'South Dakota',
      'IL'
    ];
    
    examples.forEach(example => {
      const normalized = normalizeLocationText(example);
      console.log(`   "${example}" → "${normalized}"`);
    });
    
    return true;
  } else {
    console.log('\n❌ Location lookup test failed');
    return false;
  }
}

const success = testLocationLookups();
process.exit(success ? 0 : 1);

