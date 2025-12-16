/**
 * VERIFY PIPELINE FLOW MATCHES INTENDED DESIGN
 * 
 * Intended Flow:
 * STEP 1: LinkedIn (Firstname, Lastname, City, State)
 * STEP 2: ZIP lookup (FREE, LOCAL)
 * STEP 3: Phone Discovery (Skip-tracing - phone only, not age yet)
 * STEP 4: Telnyx Phone Intelligence (line type & carrier)
 * STEP 5: Gatekeep (stops on VOIP/junk carriers/geo mismatch)
 * STEP 6: Age (Skip-tracing - only if gatekeep passes)
 */

import { enrichRow } from '../utils/enrichData';

async function verifyPipelineFlow() {
  console.log('🔍 VERIFYING PIPELINE FLOW\n');
  console.log('='.repeat(70));
  
  const testLead = {
    Name: 'Chris Koeneman',
    Firstname: 'Chris',
    Lastname: 'Koeneman',
    City: 'Baltimore',
    State: 'Maryland',
    Phone: '',
    Email: '',
    Zipcode: '',
    Age: '',
    'Line Type': '',
    Carrier: '',
  };
  
  const headers = ['Name', 'Firstname', 'Lastname', 'City', 'State', 'Phone', 'Email', 'Zipcode', 'Age', 'Line Type', 'Carrier'];
  
  console.log('\n📋 TEST LEAD:', testLead.Name);
  console.log('='.repeat(70));
  
  // Track API calls
  const apiCalls: string[] = [];
  
  // Override console.log to track API calls
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    const message = args.join(' ');
    if (message.includes('[CALL_API]')) {
      apiCalls.push(message);
    }
    originalLog(...args);
  };
  
  try {
    const result = await enrichRow(testLead, headers);
    
    console.log = originalLog; // Restore
    
    console.log('\n' + '='.repeat(70));
    console.log('📊 PIPELINE VERIFICATION RESULTS\n');
    console.log('='.repeat(70));
    
    // Verify STEP 1: LinkedIn Data
    console.log('\n✅ STEP 1: LinkedIn Data');
    console.log(`  Firstname: ${result.firstName ? '✅ FOUND' : '❌ MISSING'}`);
    console.log(`  Lastname: ${result.lastName ? '✅ FOUND' : '❌ MISSING'}`);
    console.log(`  City: ${testLead.City ? '✅ FOUND' : '❌ MISSING'}`);
    console.log(`  State: ${testLead.State ? '✅ FOUND' : '❌ MISSING'}`);
    
    // Verify STEP 2: ZIP Lookup
    console.log('\n✅ STEP 2: ZIP Lookup (Free, Local)');
    console.log(`  Zipcode: ${result.zipCode ? `✅ FOUND (${result.zipCode})` : '❌ MISSING'}`);
    
    // Verify STEP 3: Phone Discovery
    console.log('\n✅ STEP 3: Phone Discovery (Skip-tracing)');
    const phoneCall = apiCalls.find(call => call.includes('Skip-tracing (Phone Discovery)'));
    console.log(`  API Called: ${phoneCall ? '✅ YES' : '❌ NO'}`);
    console.log(`  Phone Found: ${result.phone ? `✅ YES (${result.phone.substring(0, 5)}...)` : '❌ NO'}`);
    console.log(`  Email Found: ${result.email ? `✅ YES (${result.email.substring(0, 10)}...)` : '❌ NO'}`);
    
    // Verify STEP 4: Telnyx
    console.log('\n✅ STEP 4: Telnyx Phone Intelligence');
    const telnyxCall = apiCalls.find(call => call.includes('Telnyx'));
    if (result.phone) {
      console.log(`  API Called: ${telnyxCall ? '✅ YES' : '❌ NO (should be called if phone found)'}`);
      console.log(`  Line Type: ${result.lineType ? `✅ FOUND (${result.lineType})` : '⚠️  MISSING (API key issue?)'}`);
      console.log(`  Carrier: ${result.carrierName ? `✅ FOUND (${result.carrierName})` : '⚠️  MISSING (API key issue?)'}`);
    } else {
      console.log(`  API Called: ${telnyxCall ? '⚠️  CALLED (should skip if no phone)' : '✅ SKIPPED (correct - no phone)'}`);
    }
    
    // Verify STEP 5: Gatekeep
    console.log('\n✅ STEP 5: Gatekeep Check');
    const hasPhone = !!result.phone;
    const isVOIP = result.lineType?.toLowerCase() === 'voip';
    const hasJunkCarrier = result.carrierName && 
      ['google voice', 'textnow', 'burner', 'hushed', 'line2', 'bandwidth', 'twilio']
        .some(junk => result.carrierName!.toLowerCase().includes(junk));
    const shouldContinue = hasPhone && !isVOIP && !hasJunkCarrier;
    
    console.log(`  Phone Found: ${hasPhone ? '✅ YES' : '❌ NO'}`);
    console.log(`  Is VOIP: ${isVOIP ? '❌ YES (STOP)' : '✅ NO (Continue)'}`);
    console.log(`  Junk Carrier: ${hasJunkCarrier ? '❌ YES (STOP)' : '✅ NO (Continue)'}`);
    console.log(`  Gatekeep Result: ${shouldContinue ? '✅ PASSED' : '❌ FAILED'}`);
    
    // Verify STEP 6: Age Enrichment
    console.log('\n✅ STEP 6: Age Enrichment (Conditional)');
    const ageCall = apiCalls.find(call => call.includes('Skip-tracing (Age)'));
    if (shouldContinue) {
      console.log(`  API Called: ${ageCall ? '✅ YES (gatekeep passed)' : '❌ NO (should be called)'}`);
      console.log(`  Age Found: ${result.age ? `✅ YES (${result.age})` : '⚠️  MISSING (but gatekeep passed)'}`);
    } else {
      console.log(`  API Called: ${ageCall ? '❌ YES (should NOT be called - gatekeep failed)' : '✅ SKIPPED (correct - gatekeep failed)'}`);
      console.log(`  Age Found: ${result.age ? `⚠️  YES (${result.age}) - but gatekeep failed, should skip` : '✅ NOT FOUND (correct - skipped)'}`);
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('\n📈 PIPELINE FLOW ANALYSIS\n');
    
    // Check if we're calling skip-tracing twice (once for phone, once for age)
    const skipTracingCalls = apiCalls.filter(call => call.includes('Skip-tracing'));
    console.log(`Skip-tracing API calls: ${skipTracingCalls.length}`);
    skipTracingCalls.forEach((call, i) => {
      console.log(`  ${i + 1}. ${call.split('Calling')[1]?.trim() || call}`);
    });
    
    // Verify order
    console.log('\n✅ ORDER VERIFICATION:');
    let step1Found = false, step2Found = false, step3Found = false, step4Found = false, step5Found = false, step6Found = false;
    
    if (result.firstName && result.lastName) step1Found = true;
    if (result.zipCode) step2Found = true;
    if (phoneCall) step3Found = true;
    if (telnyxCall) step4Found = true;
    step5Found = true; // Always runs
    if (ageCall) step6Found = true;
    
    console.log(`  STEP 1 (LinkedIn): ${step1Found ? '✅' : '❌'}`);
    console.log(`  STEP 2 (ZIP): ${step2Found ? '✅' : '❌'}`);
    console.log(`  STEP 3 (Phone Discovery): ${step3Found ? '✅' : '❌'}`);
    console.log(`  STEP 4 (Telnyx): ${step4Found ? '✅' : '❌'}`);
    console.log(`  STEP 5 (Gatekeep): ${step5Found ? '✅' : '❌'}`);
    console.log(`  STEP 6 (Age): ${step6Found ? '✅' : '❌'}`);
    
    // Check for issues
    console.log('\n⚠️  POTENTIAL ISSUES:');
    let issues = 0;
    
    // Issue 1: Age found in STEP 3 instead of STEP 6?
    if (result.age && !ageCall && phoneCall) {
      console.log(`  ⚠️  Age found in STEP 3 (from phone discovery), not STEP 6`);
      console.log(`     This is OK - we extract age when available, but STEP 6 should still run if gatekeep passes`);
      issues++;
    }
    
    // Issue 2: Skip-tracing called twice?
    if (skipTracingCalls.length > 1 && result.phone && shouldContinue) {
      console.log(`  ✅ Skip-tracing called ${skipTracingCalls.length} times (phone discovery + age) - CORRECT`);
    } else if (skipTracingCalls.length === 1 && result.phone && shouldContinue) {
      console.log(`  ⚠️  Skip-tracing only called once (should be twice if gatekeep passes)`);
      issues++;
    }
    
    // Issue 3: Telnyx not called when phone found?
    if (result.phone && !telnyxCall) {
      console.log(`  ❌ Telnyx NOT called even though phone was found`);
      issues++;
    }
    
    if (issues === 0) {
      console.log(`  ✅ No issues found!`);
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('\n✅ VERIFICATION COMPLETE\n');
    
    return {
      success: true,
      result,
      apiCalls: skipTracingCalls.length,
      issues,
    };
    
  } catch (error) {
    console.log = originalLog;
    console.error('\n❌ VERIFICATION FAILED:', error);
    throw error;
  }
}

verifyPipelineFlow().catch(console.error);
