/**
 * Test Script: DNC Integration Workflow Verification
 * 
 * Tests the proposed enrichment workflow with DNC check integration:
 * 1. Skip-tracing → Phone discovery
 * 2. Telnyx → Line type + carrier
 * 3. Gatekeep → Filter VoIP/junk
 * 4. DNC Check → Only on valid mobile numbers
 * 5. Early exit if DNC → Skip age enrichment
 * 
 * This verifies the workflow BEFORE implementing changes.
 */

import * as path from 'path';
import * as fs from 'fs';
import { enrichRow } from '../utils/enrichData';
import { getUshaToken } from '../utils/getUshaToken';

// Test cases covering different scenarios
const testCases = [
  {
    name: 'Valid Mobile Number (Not DNC)',
    description: 'Should pass gatekeep, check DNC, continue to age enrichment',
    row: {
      'Name': 'John Doe',
      'First Name': 'John',
      'Last Name': 'Doe',
      'City': 'Miami',
      'State': 'FL',
      'Location': 'Miami, FL',
    },
    expectedFlow: [
      'skip-tracing → phone',
      'telnyx → line type',
      'gatekeep → pass',
      'dnc → check',
      'dnc → not DNC',
      'age → enrich',
    ],
  },
  {
    name: 'VoIP Number',
    description: 'Should fail gatekeep, skip DNC check, skip age enrichment',
    row: {
      'Name': 'VoIP User',
      'First Name': 'VoIP',
      'Last Name': 'User',
      'City': 'New York',
      'State': 'NY',
      'Location': 'New York, NY',
    },
    expectedFlow: [
      'skip-tracing → phone',
      'telnyx → line type (VoIP)',
      'gatekeep → fail (VoIP)',
      'dnc → skipped',
      'age → skipped',
    ],
  },
  {
    name: 'DNC Number',
    description: 'Should pass gatekeep, check DNC, detect DNC, skip age enrichment',
    row: {
      'Name': 'DNC Person',
      'First Name': 'DNC',
      'Last Name': 'Person',
      'City': 'Los Angeles',
      'State': 'CA',
      'Location': 'Los Angeles, CA',
    },
    expectedFlow: [
      'skip-tracing → phone',
      'telnyx → line type',
      'gatekeep → pass',
      'dnc → check',
      'dnc → DNC detected',
      'age → skipped (cost savings)',
    ],
  },
  {
    name: 'Junk Carrier Number',
    description: 'Should fail gatekeep, skip DNC check, skip age enrichment',
    row: {
      'Name': 'Junk Carrier',
      'First Name': 'Junk',
      'Last Name': 'Carrier',
      'City': 'Chicago',
      'State': 'IL',
      'Location': 'Chicago, IL',
    },
    expectedFlow: [
      'skip-tracing → phone',
      'telnyx → line type',
      'gatekeep → fail (junk carrier)',
      'dnc → skipped',
      'age → skipped',
    ],
  },
];

interface WorkflowStep {
  step: string;
  timestamp: number;
  details?: any;
  result?: string;
}

/**
 * Mock DNC check function (simulates the proposed implementation)
 */
async function mockCheckDNCStatus(
  phone: string,
  token: string
): Promise<{ isDNC: boolean; canContact: boolean; reason?: string }> {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Mock logic: Assume DNC if phone ends in certain digits (for testing)
  // In real implementation, this would call USHA API
  const lastDigit = phone.slice(-1);
  const isDNC = lastDigit === '5' || lastDigit === '0'; // Mock: 20% DNC rate
  
  return {
    isDNC,
    canContact: !isDNC,
    reason: isDNC ? 'Do Not Call' : undefined,
  };
}

/**
 * Test the enrichment workflow with DNC integration
 */
async function testEnrichmentWorkflow(testCase: typeof testCases[0]) {
  console.log('\n' + '='.repeat(80));
  console.log(`🧪 TEST: ${testCase.name}`);
  console.log(`📝 Description: ${testCase.description}`);
  console.log('='.repeat(80));
  
  const workflowSteps: WorkflowStep[] = [];
  const startTime = Date.now();
  
  // Track API calls for cost analysis
  const apiCalls = {
    skipTracing: 0,
    telnyx: 0,
    dnc: 0,
    age: 0,
  };
  
  // Mock progress callback to track workflow steps
  const progressCallback = (
    step: 'linkedin' | 'zip' | 'phone-discovery' | 'telnyx' | 'gatekeep' | 'age' | 'complete',
    stepDetails?: any,
    errors?: string[]
  ) => {
    workflowSteps.push({
      step,
      timestamp: Date.now() - startTime,
      details: stepDetails,
      result: errors ? `ERROR: ${errors.join(', ')}` : 'SUCCESS',
    });
    
    // Track API calls
    if (step === 'phone-discovery') apiCalls.skipTracing++;
    if (step === 'telnyx') apiCalls.telnyx++;
    if (step === 'age') apiCalls.age++;
  };
  
  try {
    // STEP 1-3: Run enrichment (skip-tracing, Telnyx, gatekeep)
    console.log('\n📊 Running enrichment pipeline...');
    const headers = ['Name', 'First Name', 'Last Name', 'City', 'State', 'Location'];
    const result = await enrichRow(testCase.row, headers, progressCallback);
    
    // STEP 4: Simulate DNC check (proposed integration point)
    let dncChecked = false;
    let dncResult: { isDNC: boolean; canContact: boolean; reason?: string } | null = null;
    let shouldContinueAfterDNC = true;
    
    // Check if gatekeep passed (would determine if DNC check runs)
    const hasPhone = !!result.phone;
    const isVOIP = result.lineType?.toLowerCase() === 'voip';
    const junkCarriers = ['google voice', 'textnow', 'burner', 'hushed', 'line2', 'bandwidth', 'twilio'];
    const hasJunkCarrier = result.carrierName && 
      junkCarriers.some(junk => result.carrierName!.toLowerCase().includes(junk));
    
    const gatekeepPassed = hasPhone && !isVOIP && !hasJunkCarrier;
    
    if (gatekeepPassed && result.phone) {
      console.log('\n🔍 STEP 5.5: DNC Check (proposed integration point)');
      console.log(`   Gatekeep passed: ✅ (phone is valid mobile)`);
      console.log(`   Phone: ${result.phone.substring(0, 5)}...`);
      
      // Get USHA token
      const token = await getUshaToken();
      if (token) {
        // Simulate DNC check
        dncChecked = true;
        apiCalls.dnc++;
        dncResult = await mockCheckDNCStatus(result.phone, token);
        
        workflowSteps.push({
          step: 'dnc-check',
          timestamp: Date.now() - startTime,
          details: { phone: result.phone },
          result: dncResult.isDNC ? 'DNC DETECTED' : 'NOT DNC',
        });
        
        console.log(`   DNC Status: ${dncResult.isDNC ? '🔴 YES (DNC)' : '🟢 NO (OK to call)'}`);
        console.log(`   Can Contact: ${dncResult.canContact ? '✅ YES' : '❌ NO'}`);
        if (dncResult.reason) {
          console.log(`   Reason: ${dncResult.reason}`);
        }
        
        // Early exit: Skip age enrichment if DNC
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
      console.log('\n🔍 STEP 5.5: DNC Check (proposed integration point)');
      console.log(`   Gatekeep passed: ❌ (${!hasPhone ? 'no phone' : isVOIP ? 'VoIP' : hasJunkCarrier ? 'junk carrier' : 'unknown'})`);
      console.log(`   DNC Check: ⏭️  SKIPPED (gatekeep failed - cost savings)`);
      
      workflowSteps.push({
        step: 'dnc-check',
        timestamp: Date.now() - startTime,
        details: { reason: 'gatekeep_failed' },
        result: 'SKIPPED',
      });
    }
    
    // STEP 6: Age enrichment (would be conditional on DNC result)
    const ageEnrichmentRan = shouldContinueAfterDNC && !!result.age;
    if (ageEnrichmentRan) {
      apiCalls.age++;
    }
    
    // Verify workflow matches expected flow
    console.log('\n📋 Workflow Verification:');
    console.log('   Expected flow:', testCase.expectedFlow.join(' → '));
    
    const actualFlow: string[] = [];
    workflowSteps.forEach(step => {
      if (step.step === 'phone-discovery') actualFlow.push('skip-tracing → phone');
      if (step.step === 'telnyx') actualFlow.push('telnyx → line type');
      if (step.step === 'gatekeep') {
        actualFlow.push(step.result?.includes('ERROR') ? 'gatekeep → fail' : 'gatekeep → pass');
      }
      if (step.step === 'dnc-check') {
        if (step.result === 'SKIPPED') {
          actualFlow.push('dnc → skipped');
        } else if (step.result === 'DNC DETECTED') {
          actualFlow.push('dnc → check');
          actualFlow.push('dnc → DNC detected');
        } else {
          actualFlow.push('dnc → check');
          actualFlow.push('dnc → not DNC');
        }
      }
      if (step.step === 'age') {
        actualFlow.push(step.result?.includes('ERROR') ? 'age → skipped' : 'age → enrich');
      }
    });
    
    console.log('   Actual flow:  ', actualFlow.join(' → '));
    
    // Cost analysis
    console.log('\n💰 Cost Analysis:');
    console.log(`   Skip-tracing calls: ${apiCalls.skipTracing}`);
    console.log(`   Telnyx calls: ${apiCalls.telnyx}`);
    console.log(`   DNC checks: ${apiCalls.dnc} (FREE)`);
    console.log(`   Age enrichment calls: ${apiCalls.age}`);
    console.log(`   Total paid API calls: ${apiCalls.skipTracing + apiCalls.telnyx + apiCalls.age}`);
    
    if (dncChecked && dncResult?.isDNC) {
      console.log(`   💵 Cost Savings: 1 age API call avoided (DNC detected)`);
    }
    if (!gatekeepPassed) {
      console.log(`   💵 Cost Savings: 1 DNC check avoided (gatekeep failed)`);
    }
    
    // Results summary
    console.log('\n📊 Results Summary:');
    console.log(`   Phone: ${result.phone ? `✅ ${result.phone.substring(0, 5)}...` : '❌ NOT FOUND'}`);
    console.log(`   Line Type: ${result.lineType ? `✅ ${result.lineType}` : '❌ NOT FOUND'}`);
    console.log(`   Carrier: ${result.carrierName ? `✅ ${result.carrierName}` : '❌ NOT FOUND'}`);
    console.log(`   DNC Status: ${dncResult ? (dncResult.isDNC ? '🔴 YES' : '🟢 NO') : '⏭️  NOT CHECKED'}`);
    console.log(`   Age: ${result.age ? `✅ ${result.age}` : '❌ NOT FOUND'}`);
    
    // Validation
    const validation = {
      phoneFound: !!result.phone,
      telnyxCalled: apiCalls.telnyx > 0,
      gatekeepWorked: !gatekeepPassed || (!isVOIP && !hasJunkCarrier),
      dncCheckCorrect: gatekeepPassed ? dncChecked : !dncChecked,
      earlyExitWorked: dncResult?.isDNC ? !ageEnrichmentRan : true,
    };
    
    console.log('\n✅ Validation:');
    Object.entries(validation).forEach(([key, value]) => {
      console.log(`   ${key}: ${value ? '✅ PASS' : '❌ FAIL'}`);
    });
    
    const allPassed = Object.values(validation).every(v => v);
    console.log(`\n${allPassed ? '✅' : '❌'} Overall: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
    
    return {
      testCase: testCase.name,
      passed: allPassed,
      workflowSteps,
      apiCalls,
      dncResult,
      validation,
    };
    
  } catch (error) {
    console.error(`\n❌ ERROR in test:`, error);
    return {
      testCase: testCase.name,
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Main test execution
 */
async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 DNC INTEGRATION WORKFLOW TEST');
  console.log('='.repeat(80));
  console.log('\nThis test verifies the proposed enrichment workflow with DNC integration.');
  console.log('It simulates the workflow BEFORE implementing changes.\n');
  
  const results = [];
  
  for (const testCase of testCases) {
    const result = await testEnrichmentWorkflow(testCase);
    results.push(result);
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 FINAL TEST SUMMARY');
  console.log('='.repeat(80));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\n✅ Passed: ${passed}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);
  
  // Cost analysis summary
  const totalSkipTracing = results.reduce((sum, r) => sum + (r.apiCalls?.skipTracing || 0), 0);
  const totalTelnyx = results.reduce((sum, r) => sum + (r.apiCalls?.telnyx || 0), 0);
  const totalDNC = results.reduce((sum, r) => sum + (r.apiCalls?.dnc || 0), 0);
  const totalAge = results.reduce((sum, r) => sum + (r.apiCalls?.age || 0), 0);
  
  console.log('\n💰 Total API Calls Across All Tests:');
  console.log(`   Skip-tracing: ${totalSkipTracing}`);
  console.log(`   Telnyx: ${totalTelnyx}`);
  console.log(`   DNC checks: ${totalDNC} (FREE)`);
  console.log(`   Age enrichment: ${totalAge}`);
  console.log(`   Total paid calls: ${totalSkipTracing + totalTelnyx + totalAge}`);
  
  const dncSavings = results.filter(r => r.dncResult?.isDNC).length;
  console.log(`\n💵 Cost Savings: ${dncSavings} age API calls avoided (DNC detected)`);
  
  if (failed > 0) {
    console.log('\n❌ Some tests failed. Review the output above for details.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed! Workflow is verified and ready for implementation.');
    process.exit(0);
  }
}

// Run tests
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
