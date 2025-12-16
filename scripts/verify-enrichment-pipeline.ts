/**
 * VERIFICATION SCRIPT: Optimal Enrichment Pipeline with Telnyx
 * 
 * Tests the complete pipeline:
 * STEP 1: LinkedIn (Firstname, Lastname, City, State)
 * STEP 2: ZIP lookup (free, local)
 * STEP 3: Phone Discovery (skip-tracing)
 * STEP 4: Telnyx (line type & carrier)
 * STEP 5: Gatekeep (VOIP/junk carrier check)
 * STEP 6: Age (skip-tracing, conditional)
 */

import { enrichRow } from '../utils/enrichData';

// Test data with LinkedIn info
const testLeads = [
  {
    Name: 'John Smith',
    Firstname: 'John',
    Lastname: 'Smith',
    City: 'Denver',
    State: 'Colorado',
    Phone: '', // Will be discovered
    Email: '',
    Zipcode: '',
    Age: '',
    'Line Type': '',
    Carrier: '',
  },
  {
    Name: 'Jane Doe',
    Firstname: 'Jane',
    Lastname: 'Doe',
    City: 'Austin',
    State: 'Texas',
    Phone: '5125551234', // Already has phone
    Email: '',
    Zipcode: '',
    Age: '',
    'Line Type': '',
    Carrier: '',
  },
];

async function verifyEnrichment() {
  console.log('🧪 VERIFYING OPTIMAL ENRICHMENT PIPELINE\n');
  console.log('='.repeat(60));
  
  const headers = ['Name', 'Firstname', 'Lastname', 'City', 'State', 'Phone', 'Email', 'Zipcode', 'Age', 'Line Type', 'Carrier'];
  
  for (let i = 0; i < testLeads.length; i++) {
    const lead = testLeads[i];
    console.log(`\n📋 TEST ${i + 1}: ${lead.Name}`);
    console.log('-'.repeat(60));
    console.log('Input:', {
      Name: lead.Name,
      City: lead.City,
      State: lead.State,
      HasPhone: !!lead.Phone,
      HasEmail: !!lead.Email,
    });
    
    try {
      console.log('\n🔄 Running enrichment pipeline...\n');
      const result = await enrichRow(lead, headers);
      
      console.log('\n✅ ENRICHMENT RESULT:');
      console.log('='.repeat(60));
      console.log('STEP 1 - LinkedIn Data:');
      console.log(`  ✅ Firstname: ${result.firstName || 'NOT FOUND'}`);
      console.log(`  ✅ Lastname: ${result.lastName || 'NOT FOUND'}`);
      console.log(`  ✅ City: ${lead.City}`);
      console.log(`  ✅ State: ${lead.State}`);
      
      console.log('\nSTEP 2 - ZIP Lookup (Free):');
      console.log(`  ${result.zipCode ? `✅ Zipcode: ${result.zipCode}` : '❌ Zipcode: NOT FOUND'}`);
      
      console.log('\nSTEP 3 - Phone Discovery (Skip-tracing):');
      console.log(`  ${result.phone ? `✅ Phone: ${result.phone.substring(0, 5)}...` : '❌ Phone: NOT FOUND'}`);
      console.log(`  ${result.skipTracingData ? '✅ Skip-tracing data received' : '❌ No skip-tracing data'}`);
      
      console.log('\nSTEP 4 - Telnyx Phone Intelligence:');
      console.log(`  ${result.telnyxLookupData ? '✅ Telnyx lookup completed' : '❌ No Telnyx data'}`);
      console.log(`  ${result.lineType ? `✅ Line Type: ${result.lineType}` : '❌ Line Type: NOT FOUND'}`);
      console.log(`  ${result.carrierName ? `✅ Carrier: ${result.carrierName}` : '❌ Carrier: NOT FOUND'}`);
      
      console.log('\nSTEP 5 - Gatekeep Check:');
      const hasPhone = !!result.phone;
      const isVOIP = result.lineType?.toLowerCase() === 'voip';
      const hasJunkCarrier = result.carrierName && 
        ['google voice', 'textnow', 'burner', 'hushed', 'line2', 'bandwidth', 'twilio']
          .some(junk => result.carrierName!.toLowerCase().includes(junk));
      const shouldContinue = hasPhone && !isVOIP && !hasJunkCarrier;
      
      console.log(`  Phone found: ${hasPhone ? '✅' : '❌'}`);
      console.log(`  Is VOIP: ${isVOIP ? '❌ (STOP)' : '✅ (Continue)'}`);
      console.log(`  Junk carrier: ${hasJunkCarrier ? '❌ (STOP)' : '✅ (Continue)'}`);
      console.log(`  Should continue: ${shouldContinue ? '✅ YES' : '❌ NO'}`);
      
      console.log('\nSTEP 6 - Age Enrichment (Conditional):');
      if (shouldContinue) {
        console.log(`  ${result.age ? `✅ Age: ${result.age}` : '⚠️  Age: NOT FOUND (but gatekeep passed)'}`);
        console.log(`  ${result.dob ? `✅ DOB: ${result.dob}` : '⚠️  DOB: NOT FOUND'}`);
      } else {
        console.log('  ⏭️  SKIPPED (gatekeep failed - saves money!)');
      }
      
      console.log('\n📊 FINAL SUMMARY:');
      console.log('='.repeat(60));
      const fields = {
        'Firstname': result.firstName ? '✅' : '❌',
        'Lastname': result.lastName ? '✅' : '❌',
        'City': lead.City ? '✅' : '❌',
        'State': lead.State ? '✅' : '❌',
        'Zipcode': result.zipCode ? '✅' : '❌',
        'Phone': result.phone ? '✅' : '❌',
        'Line Type': result.lineType ? '✅' : '❌',
        'Carrier': result.carrierName ? '✅' : '❌',
        'Age': result.age ? '✅' : '❌',
      };
      
      Object.entries(fields).forEach(([field, status]) => {
        console.log(`  ${field.padEnd(15)} ${status}`);
      });
      
      if (result.error) {
        console.log(`\n⚠️  ERRORS: ${result.error}`);
      }
      
    } catch (error) {
      console.error(`\n❌ ERROR during enrichment:`, error);
      if (error instanceof Error) {
        console.error(`   Message: ${error.message}`);
        console.error(`   Stack: ${error.stack}`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
  }
  
  console.log('\n✅ VERIFICATION COMPLETE\n');
}

// Run verification
verifyEnrichment().catch(console.error);
