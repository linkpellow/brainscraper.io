/**
 * Test API Request Format
 * 
 * This script will make a test request and show EXACTLY what we're sending
 * Run with: npx tsx scripts/test-api-request-format.ts
 */

const testRequest = {
  location: 'Maryland',
  keywords: 'real estate',
  page: 1
};

console.log('🧪 TEST: What request format are we sending?');
console.log('='.repeat(80));
console.log('\n📤 Input from UI:');
console.log(JSON.stringify(testRequest, null, 2));

console.log('\n📋 According to RapidAPI docs, the correct format should be:');
console.log(JSON.stringify({
  filters: [
    {
      type: "REGION",
      values: [
        {
          id: "urn:li:fs_geo:100809221",  // Maryland geo ID
          text: "Maryland, United States",
          selectionType: "INCLUDED"
        }
      ]
    }
  ],
  keywords: "real estate",
  page: 1,
  count: 25
}, null, 2));

console.log('\n❓ Question: Are we sending the location as REGION or LOCATION type?');
console.log('❓ Question: Are we using the correct URN format?');
console.log('❓ Question: Should it be "REGION" instead of "LOCATION"?');

console.log('\n📝 Action needed:');
console.log('1. Check RapidAPI playground - what filter type works for location?');
console.log('2. Is it "REGION", "LOCATION", "GEO", or something else?');
console.log('3. What exact format does the playground show for Maryland?');

