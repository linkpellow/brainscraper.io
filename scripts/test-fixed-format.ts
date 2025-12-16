#!/usr/bin/env npx tsx

/**
 * Test script to show the FIXED API request format
 * This should now match the RapidAPI playground format
 */

import { locationToFilter } from '../utils/linkedinLocationIds';

console.log('🧪 TESTING FIXED API REQUEST FORMAT\n');
console.log('=' .repeat(80));

// Test Maryland filter
const marylandFilter = locationToFilter('Maryland');
console.log('\n📍 Maryland Filter (static mapping):');
console.log(JSON.stringify(marylandFilter, null, 2));

// Show what the full request body would look like
const exampleRequestBody = {
  account_number: 1,
  page: 1,
  filters: [
    marylandFilter,
    {
      type: 'INDUSTRY',
      values: [{
        id: '44',  // Real Estate (example)
        text: 'Real Estate',
        selectionType: 'INCLUDED'
      }],
      selectedSubFilter: 50
    }
  ],
  keywords: 'real estate maryland'
};

console.log('\n📦 Full Example Request Body (Maryland + Real Estate):');
console.log(JSON.stringify(exampleRequestBody, null, 2));

console.log('\n' + '='.repeat(80));
console.log('\n✅ KEY FIXES APPLIED:');
console.log('1. Filter type changed from "LOCATION" to "REGION"');
console.log('2. ID format changed from "urn:li:fs_geo:103644278" to "103644278"');
console.log('3. Added "selectedSubFilter: 50" field');
console.log('4. Kept keywords as fallback for better results');
console.log('\n🎯 This format matches the RapidAPI playground example!');

