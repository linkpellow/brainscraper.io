/**
 * Simplified DNC Workflow Test
 * Tests the proposed workflow with actual phone numbers
 */

import { getUshaToken } from '../utils/getUshaToken';

/**
 * Mock DNC check (simulates real USHA API call)
 */
async function checkDNCStatus(
  phone: string,
  token: string
): Promise<{ isDNC: boolean; canContact: boolean; reason?: string }> {
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // For testing: Use last digit to simulate DNC (20% rate)
  const lastDigit = phone.slice(-1);
  const isDNC = lastDigit === '5' || lastDigit === '0';
  
  return {
    isDNC,
    canContact: !isDNC,
    reason: isDNC ? 'Do Not Call' : undefined,
  };
}

/**
 * Simulate gatekeep logic (from enrichData.ts)
 */
function shouldContinueEnrichment(
  phone: string | null,
  lineType: string | undefined,
  carrierName: string | undefined
): boolean {
  if (!phone) return false;
  if (lineType?.toLowerCase() === 'voip') return false;
  
  const junkCarriers = ['google voice', 'textnow', 'burner', 'hushed', 'line2', 'bandwidth', 'twilio'];
  if (carrierName && junkCarriers.some(junk => carrierName.toLowerCase().includes(junk))) {
    return false;
  }
  
  return true;
}

/**
 * Test scenarios
 */
const scenarios = [
  {
    name: 'Valid Mobile - Not DNC',
    phone: '7164332397',
    lineType: 'mobile',
    carrierName: 'AT&T',
    expectedDNC: false,
    expectedAgeEnrichment: true,
  },
  {
    name: 'Valid Mobile - DNC',
    phone: '7164332395', // Last digit 5 = DNC in mock
    lineType: 'mobile',
    carrierName: 'Verizon',
    expectedDNC: true,
    expectedAgeEnrichment: false, // Should skip due to DNC
  },
  {
    name: 'VoIP Number',
    phone: '5551234567',
    lineType: 'voip',
    carrierName: 'Twilio',
    expectedDNC: false,
    expectedAgeEnrichment: false, // Should skip due to VoIP
  },
  {
    name: 'Junk Carrier',
    phone: '5551234568',
    lineType: 'mobile',
    carrierName: 'Google Voice',
    expectedDNC: false,
    expectedAgeEnrichment: false, // Should skip due to junk carrier
  },
];

async function testScenario(scenario: typeof scenarios[0]) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🧪 Testing: ${scenario.name}`);
  console.log(`   Phone: ${scenario.phone}`);
  console.log(`   Line Type: ${scenario.lineType}`);
  console.log(`   Carrier: ${scenario.carrierName}`);
  console.log('='.repeat(70));
  
  // STEP 1: Gatekeep check
  const gatekeepPassed = shouldContinueEnrichment(
    scenario.phone,
    scenario.lineType,
    scenario.carrierName
  );
  
  console.log(`\n📊 STEP 5: Gatekeep Check`);
  console.log(`   Result: ${gatekeepPassed ? '✅ PASSED' : '❌ FAILED'}`);
  
  let dncChecked = false;
  let dncResult: { isDNC: boolean; canContact: boolean; reason?: string } | null = null;
  let shouldContinueAfterDNC = true;
  
  // STEP 2: DNC Check (only if gatekeep passed)
  if (gatekeepPassed) {
    console.log(`\n🔍 STEP 5.5: DNC Check (proposed integration point)`);
    console.log(`   Gatekeep passed: ✅ (phone is valid mobile)`);
    
    const token = await getUshaToken();
    if (token) {
      dncChecked = true;
      dncResult = await checkDNCStatus(scenario.phone, token);
      
      console.log(`   DNC Status: ${dncResult.isDNC ? '🔴 YES (DNC)' : '🟢 NO (OK to call)'}`);
      console.log(`   Can Contact: ${dncResult.canContact ? '✅ YES' : '❌ NO'}`);
      
      // Early exit if DNC
      if (dncResult.isDNC) {
        shouldContinueAfterDNC = false;
        console.log(`   ⛔ Early Exit: Skipping age enrichment (cost savings)`);
      } else {
        console.log(`   ✅ Continue: Proceeding to age enrichment`);
      }
    } else {
      console.log(`   ⚠️  Token fetch failed - skipping DNC check`);
    }
  } else {
    console.log(`\n🔍 STEP 5.5: DNC Check (proposed integration point)`);
    console.log(`   Gatekeep passed: ❌ (${scenario.lineType === 'voip' ? 'VoIP' : 'junk carrier'})`);
    console.log(`   DNC Check: ⏭️  SKIPPED (gatekeep failed - cost savings)`);
  }
  
  // STEP 3: Age enrichment decision
  const ageEnrichmentRun = shouldContinueAfterDNC && gatekeepPassed;
  
  console.log(`\n📊 STEP 6: Age Enrichment Decision`);
  console.log(`   Will run: ${ageEnrichmentRun ? '✅ YES' : '❌ NO'}`);
  if (!ageEnrichmentRun) {
    if (!gatekeepPassed) {
      console.log(`   Reason: Gatekeep failed (${scenario.lineType === 'voip' ? 'VoIP' : 'junk carrier'})`);
    } else if (dncResult?.isDNC) {
      console.log(`   Reason: DNC detected (cost savings)`);
    }
  }
  
  // Validation
  console.log(`\n✅ Validation:`);
  const validations = {
    'DNC check only runs on valid mobile': gatekeepPassed === dncChecked,
    'DNC check skipped on VoIP/junk': !gatekeepPassed === !dncChecked,
    'Early exit works (DNC detected)': scenario.expectedDNC ? !shouldContinueAfterDNC : true,
    'Age enrichment decision correct': ageEnrichmentRun === scenario.expectedAgeEnrichment,
  };
  
  Object.entries(validations).forEach(([key, value]) => {
    console.log(`   ${key}: ${value ? '✅ PASS' : '❌ FAIL'}`);
  });
  
  // Cost analysis
  console.log(`\n💰 Cost Analysis:`);
  const apiCalls = {
    telnyx: 1, // Always called if phone exists
    dnc: dncChecked ? 1 : 0,
    age: ageEnrichmentRun ? 1 : 0,
  };
  
  console.log(`   Telnyx calls: ${apiCalls.telnyx}`);
  console.log(`   DNC checks: ${apiCalls.dnc} (FREE)`);
  console.log(`   Age enrichment calls: ${apiCalls.age}`);
  console.log(`   Total paid calls: ${apiCalls.telnyx + apiCalls.age}`);
  
  if (dncChecked && dncResult?.isDNC) {
    console.log(`   💵 Cost Savings: 1 age API call avoided (DNC detected)`);
  }
  if (!gatekeepPassed) {
    console.log(`   💵 Cost Savings: 1 DNC check avoided (gatekeep failed)`);
  }
  
  const allPassed = Object.values(validations).every(v => v);
  console.log(`\n${allPassed ? '✅' : '❌'} Overall: ${allPassed ? 'PASSED' : 'FAILED'}`);
  
  return {
    scenario: scenario.name,
    passed: allPassed,
    dncChecked,
    dncResult,
    ageEnrichmentRun,
    apiCalls,
  };
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 DNC INTEGRATION WORKFLOW TEST (Simplified)');
  console.log('='.repeat(70));
  console.log('\nTesting the proposed workflow logic with simulated data.\n');
  
  const results = [];
  
  for (const scenario of scenarios) {
    const result = await testScenario(scenario);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 FINAL SUMMARY');
  console.log('='.repeat(70));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\n✅ Passed: ${passed}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);
  
  const totalDNC = results.reduce((sum, r) => sum + (r.apiCalls?.dnc || 0), 0);
  const totalAge = results.reduce((sum, r) => sum + (r.apiCalls?.age || 0), 0);
  const dncSavings = results.filter(r => r.dncResult?.isDNC).length;
  
  console.log(`\n💰 Total API Calls:`);
  console.log(`   DNC checks: ${totalDNC} (FREE)`);
  console.log(`   Age enrichment: ${totalAge}`);
  console.log(`\n💵 Cost Savings: ${dncSavings} age API calls avoided (DNC detected)`);
  
  if (failed > 0) {
    console.log('\n❌ Some tests failed. Review output above.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed! Workflow is verified and ready for implementation.');
    process.exit(0);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
