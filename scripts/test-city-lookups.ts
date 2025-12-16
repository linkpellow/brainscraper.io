/**
 * Test City Lookups
 * 
 * Verify that city lookups work for all formats
 * Run with: npx tsx scripts/test-city-lookups.ts
 */

import { lookupGeoId, normalizeLocationText } from '../utils/geoIdDatabase';

const TEST_CITIES = [
  // Test different input formats
  { input: 'Miami', expected: '102394087', description: 'City name only' },
  { input: 'Miami, Florida', expected: '102394087', description: 'City, State' },
  { input: 'Miami, FL', expected: '102394087', description: 'City, Abbr' },
  { input: 'miami', expected: '102394087', description: 'Lowercase city' },
  { input: 'MIAMI', expected: '102394087', description: 'Uppercase city' },
  
  { input: 'Carmel', expected: '104433150', description: 'City name (verified)' },
  { input: 'Carmel, Indiana', expected: '104433150', description: 'City, State' },
  { input: 'Carmel, IN', expected: '104433150', description: 'City, Abbr' },
  
  { input: 'Chicago', expected: '103112676', description: 'Major city' },
  { input: 'Chicago, IL', expected: '103112676', description: 'City, Abbr' },
  
  { input: 'Austin, TX', expected: '90000064', description: 'City, Abbr' },
  { input: 'Houston, Texas', expected: '103743442', description: 'City, State' },
  
  // Multi-word cities
  { input: 'Colorado Springs', expected: '100182490', description: 'Multi-word city' },
  { input: 'Colorado Springs, CO', expected: '100182490', description: 'Multi-word, Abbr' },
  { input: 'Virginia Beach', expected: '106468467', description: 'Multi-word city' },
  { input: 'Silver Spring', expected: '106026178', description: 'Multi-word city' },
  
  // North Carolina cities
  { input: 'Charlotte, NC', expected: '102264677', description: 'NC city' },
  { input: 'Raleigh, North Carolina', expected: '100197101', description: 'NC city, full state' },
  
  // Tennessee cities
  { input: 'Nashville', expected: '105573479', description: 'TN city' },
  { input: 'Memphis, TN', expected: '100420597', description: 'TN city' },
  { input: 'Knoxville, Tennessee', expected: '104362759', description: 'TN city, full state' },
];

function testCityLookups() {
  console.log('🧪 Testing City Lookups\n');
  console.log('='.repeat(80));
  
  let passed = 0;
  let failed = 0;
  const issues: string[] = [];
  
  for (const test of TEST_CITIES) {
    const entry = lookupGeoId(test.input);
    
    if (!entry) {
      console.log(`❌ "${test.input}" (${test.description}): Not found`);
      issues.push(`"${test.input}" not found`);
      failed++;
      continue;
    }
    
    if (entry.locationId !== test.expected) {
      console.log(`❌ "${test.input}" (${test.description}): ID mismatch`);
      console.log(`   Expected: ${test.expected}, Got: ${entry.locationId}`);
      issues.push(`"${test.input}" mismatch: expected ${test.expected}, got ${entry.locationId}`);
      failed++;
      continue;
    }
    
    console.log(`✅ "${test.input.padEnd(30)}" (${test.description.padEnd(20)}) → ${entry.locationId}`);
    passed++;
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY:');
  console.log(`✅ Passed: ${passed}/${TEST_CITIES.length} lookups`);
  console.log(`❌ Failed: ${failed}/${TEST_CITIES.length} lookups`);
  
  if (issues.length > 0) {
    console.log('\n⚠️  Issues found:');
    issues.forEach(issue => console.log(`   - ${issue}`));
  }
  
  if (failed === 0) {
    console.log('\n🎉 ALL CITY LOOKUPS PASSED!');
    console.log('✅ City lookup system is working correctly');
    
    console.log('\n💡 Example normalizations:');
    const examples = [
      'Miami, Florida',
      'Carmel, IN',
      'Colorado Springs',
      'Charlotte, North Carolina'
    ];
    
    examples.forEach(example => {
      const normalized = normalizeLocationText(example);
      console.log(`   "${example}" → "${normalized}"`);
    });
    
    return true;
  } else {
    console.log('\n❌ City lookup test failed');
    return false;
  }
}

const success = testCityLookups();
process.exit(success ? 0 : 1);
