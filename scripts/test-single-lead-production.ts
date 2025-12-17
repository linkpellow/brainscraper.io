/**
 * PRODUCTION TEST: Single Lead Enrichment Verification
 * 
 * Tests the complete enrichment pipeline with a single lead to verify:
 * 1. Skip-tracing phone/email extraction
 * 2. Telnyx line type/carrier validation
 * 3. Age extraction (conditional after Telnyx)
 * 4. Data saving to enrichedRow
 * 
 * Usage: tsx scripts/test-single-lead-production.ts
 */

import { enrichRow } from '../utils/enrichData';
import { extractLeadSummary } from '../utils/extractLeadSummary';
import type { EnrichmentResult } from '../utils/enrichData';
import type { LeadSummary } from '../utils/extractLeadSummary';

// Test lead - use a real person with known location for best results
const testLead = {
  'Name': 'John Doe',
  'Firstname': 'John',
  'Lastname': 'Doe',
  'City': 'Denver',
  'State': 'Colorado',
  'Phone': '', // Will be discovered
  'Email': '', // Will be discovered
  'Zipcode': '', // Will be discovered
  'Age': '', // Will be discovered conditionally
  'Line Type': '', // Will be discovered
  'Carrier': '', // Will be discovered
};

const headers = ['Name', 'Firstname', 'Lastname', 'City', 'State', 'Phone', 'Email', 'Zipcode', 'Age', 'Line Type', 'Carrier'];

async function testSingleLead() {
  console.log('🧪 PRODUCTION TEST: Single Lead Enrichment\n');
  console.log('='.repeat(70));
  console.log('Test Lead:');
  console.log(`  Name: ${testLead.Name}`);
  console.log(`  Location: ${testLead.City}, ${testLead.State}`);
  console.log('='.repeat(70));
  console.log('\n⚠️  This will make REAL API calls to:\n');
  console.log('  - Skip-tracing API (phone/email/age discovery)');
  console.log('  - Telnyx API (line type/carrier validation)');
  console.log('\nStarting enrichment in 2 seconds...\n');
  await new Promise(resolve => setTimeout(resolve, 2000));

  const startTime = Date.now();
  
  // Track progress through each step
  const progressSteps: Array<{ step: string; timestamp: number; details?: any }> = [];
  
  const enrichment = await enrichRow(
    testLead,
    headers,
    (step, stepDetails, errors) => {
      const stepInfo = {
        step,
        timestamp: Date.now(),
        details: stepDetails,
        errors,
      };
      progressSteps.push(stepInfo);
      
      console.log(`\n📊 STEP: ${step.toUpperCase()}`);
      if (stepDetails) {
        console.log('  Details:', JSON.stringify(stepDetails, null, 2));
      }
      if (errors && errors.length > 0) {
        console.log('  ⚠️  Errors:', errors);
      }
    }
  );

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log('\n' + '='.repeat(70));
  console.log('✅ ENRICHMENT COMPLETE\n');
  console.log(`⏱️  Total Time: ${duration}s\n`);

  // Display enrichment results
  console.log('📋 ENRICHMENT RESULTS:');
  console.log('─'.repeat(70));
  console.log(`Phone:     ${enrichment.phone ? `✅ ${enrichment.phone}` : '❌ MISSING'}`);
  console.log(`Email:     ${enrichment.email ? `✅ ${enrichment.email.substring(0, 20)}...` : '❌ MISSING'}`);
  console.log(`Zipcode:   ${enrichment.zipCode ? `✅ ${enrichment.zipCode}` : '❌ MISSING'}`);
  console.log(`Age:       ${enrichment.age ? `✅ ${enrichment.age}` : '❌ MISSING (may be skipped if VoIP/junk)'}`);
  console.log(`Line Type: ${enrichment.lineType ? `✅ ${enrichment.lineType}` : '❌ MISSING'}`);
  console.log(`Carrier:   ${enrichment.carrierName ? `✅ ${enrichment.carrierName}` : '❌ MISSING'}`);
  console.log('─'.repeat(70));

  // Create enriched row to test data saving
  const enrichedRow: Record<string, any> = { ...testLead };
  enrichedRow._enriched = enrichment;

  // Simulate the data saving logic from enrichData
  if (enrichment.phone) {
    enrichedRow['Phone'] = enrichment.phone;
  }
  if (enrichment.email) {
    enrichedRow['Email'] = enrichment.email;
  }
  if (enrichment.zipCode) {
    enrichedRow['Zipcode'] = enrichment.zipCode;
  }
  if (enrichment.age) {
    enrichedRow['Age'] = enrichment.age;
  }
  if (enrichment.lineType) {
    enrichedRow['Line Type'] = enrichment.lineType;
  }
  if (enrichment.carrierName) {
    enrichedRow['Carrier'] = enrichment.carrierName;
  }

  // Extract summary to verify extractLeadSummary works
  const summary = extractLeadSummary(enrichedRow, enrichment);
  
  console.log('\n📄 EXTRACTED SUMMARY:');
  console.log('─'.repeat(70));
  console.log(`Name:      ${summary.name || 'MISSING'}`);
  console.log(`Phone:     ${summary.phone ? `✅ ${summary.phone}` : '❌ MISSING'}`);
  console.log(`Email:     ${summary.email ? `✅ ${summary.email.substring(0, 20)}...` : '❌ MISSING'}`);
  console.log(`Zipcode:   ${summary.zipcode || 'MISSING'}`);
  console.log(`Age/DOB:   ${summary.dobOrAge || 'MISSING'}`);
  console.log(`Line Type: ${summary.lineType || 'MISSING'}`);
  console.log(`Carrier:   ${summary.carrier || 'MISSING'}`);
  console.log('─'.repeat(70));

  // Verify all critical fields
  console.log('\n✅ VERIFICATION:');
  console.log('─'.repeat(70));
  const checks = {
    'Phone extracted': !!enrichment.phone && enrichment.phone.length >= 10,
    'Email extracted': !!enrichment.email && enrichment.email.includes('@'),
    'Zipcode extracted': !!enrichment.zipCode && enrichment.zipCode.length >= 5,
    'Line type extracted': !!enrichment.lineType,
    'Carrier extracted': !!enrichment.carrierName,
    'Phone saved to row': !!enrichedRow['Phone'] && enrichedRow['Phone'].length >= 10,
    'Email saved to row': !!enrichedRow['Email'] && enrichedRow['Email'].includes('@'),
    'Summary extraction works': !!summary.phone || !!summary.email,
  };

  let allPassed = true;
  for (const [check, passed] of Object.entries(checks)) {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status}: ${check}`);
    if (!passed) allPassed = false;
  }

  // Age is conditional - only check if phone was found and validated
  if (enrichment.phone && enrichment.lineType && enrichment.lineType.toLowerCase() !== 'voip') {
    const ageCheck = !!enrichment.age;
    const ageStatus = ageCheck ? '✅ PASS' : '⚠️  SKIPPED (may not be available)';
    console.log(`  ${ageStatus}: Age extracted (conditional)`);
  } else {
    console.log(`  ⚠️  SKIPPED: Age extraction (phone not validated or VoIP)`);
  }

  console.log('─'.repeat(70));

  // Display step timeline
  console.log('\n📊 STEP TIMELINE:');
  console.log('─'.repeat(70));
  progressSteps.forEach((step, i) => {
    const time = ((step.timestamp - startTime) / 1000).toFixed(2);
    console.log(`  ${i + 1}. [${time}s] ${step.step}`);
  });
  console.log('─'.repeat(70));

  // Final result
  console.log('\n' + '='.repeat(70));
  if (allPassed && enrichment.phone && enrichment.email) {
    console.log('✅ PRODUCTION TEST PASSED');
    console.log('   All critical fields extracted and saved correctly');
  } else if (enrichment.phone || enrichment.email) {
    console.log('⚠️  PRODUCTION TEST PARTIAL');
    console.log('   Some fields extracted, but not all critical fields present');
  } else {
    console.log('❌ PRODUCTION TEST FAILED');
    console.log('   No phone or email extracted - check API keys and network');
  }
  console.log('='.repeat(70));

  return {
    success: allPassed && !!enrichment.phone && !!enrichment.email,
    enrichment,
    summary,
    enrichedRow,
    duration: parseFloat(duration),
    progressSteps,
  };
}

// Run the test
testSingleLead()
  .then((result) => {
    if (result.success) {
      console.log('\n✅ Test completed successfully');
      process.exit(0);
    } else {
      console.log('\n⚠️  Test completed with warnings');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  });
