/**
 * Test Newly Added Cities
 * Quick test for South Carolina, Iowa, Utah cities
 */

import { lookupGeoId } from '../utils/geoIdDatabase';

const NEW_CITIES = [
  // South Carolina
  { input: 'Columbia, SC', expected: '90000176', description: 'Columbia, SC' },
  { input: 'Charleston, SC', expected: '90000144', description: 'Charleston, SC' },
  { input: 'Columbia, South Carolina', expected: '90000176', description: 'Columbia, full state' },
  
  // Iowa
  { input: 'Iowa City', expected: '105410114', description: 'Iowa City' },
  { input: 'Des Moines', expected: '105056705', description: 'Des Moines' },
  { input: 'Iowa City, IA', expected: '105410114', description: 'Iowa City, IA' },
  { input: 'Des Moines, Iowa', expected: '105056705', description: 'Des Moines, full state' },
  
  // Utah
  { input: 'Salt Lake City', expected: '103250458', description: 'Salt Lake City' },
  { input: 'Salt Lake City, UT', expected: '103250458', description: 'Salt Lake City, UT' },
  { input: 'West Valley City', expected: '104252509', description: 'West Valley City' },
  { input: 'Ogden', expected: '105219479', description: 'Ogden' },
  { input: 'Ogden, Utah', expected: '105219479', description: 'Ogden, full state' },
];

console.log('🧪 Testing Newly Added Cities\n');
console.log('='.repeat(80));

let passed = 0;
let failed = 0;

for (const test of NEW_CITIES) {
  const entry = lookupGeoId(test.input);
  
  if (!entry) {
    console.log(`❌ "${test.input}" (${test.description}): Not found`);
    failed++;
    continue;
  }
  
  if (entry.locationId !== test.expected) {
    console.log(`❌ "${test.input}" (${test.description}): ID mismatch`);
    console.log(`   Expected: ${test.expected}, Got: ${entry.locationId}`);
    failed++;
    continue;
  }
  
  console.log(`✅ "${test.input.padEnd(30)}" → ${entry.locationId}`);
  passed++;
}

console.log('\n' + '='.repeat(80));
console.log(`📊 TEST SUMMARY:`);
console.log(`✅ Passed: ${passed}/${NEW_CITIES.length}`);
console.log(`❌ Failed: ${failed}/${NEW_CITIES.length}`);

if (failed === 0) {
  console.log('\n🎉 ALL NEW CITIES WORKING PERFECTLY!');
  console.log('\n📊 Total Database Coverage:');
  console.log('   • 30 States');
  console.log('   • 29 Cities (across 14 states)');
  console.log('   • 192 total lookup entries');
}

process.exit(failed === 0 ? 0 : 1);

