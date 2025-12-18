/**
 * Check Network Tab for Login Requests
 * 
 * This script helps you manually inspect the Network tab to find login credentials.
 * Run this, then check the instructions it provides.
 */

(function() {
  'use strict';
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 NETWORK TAB INSPECTION GUIDE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('📋 STEP-BY-STEP INSTRUCTIONS:\n');
  
  console.log('1. Open DevTools (F12)');
  console.log('2. Go to Network tab');
  console.log('3. Clear the network log (🚫 icon)');
  console.log('4. Filter by "Fetch/XHR" or "All"');
  console.log('5. Log out and log back in');
  console.log('6. Look for these request types:\n');
  
  console.log('   🔍 LOOK FOR:');
  console.log('   - POST requests (not GET)');
  console.log('   - URLs containing:');
  console.log('     • /login');
  console.log('     • /auth');
  console.log('     • /token');
  console.log('     • /connect');
  console.log('     • /api/account');
  console.log('     • /api/auth');
  console.log('     • optic-prod-api.leadarena.com (Tampa API)\n');
  
  console.log('7. Click on each POST request');
  console.log('8. Check these tabs:\n');
  
  console.log('   📄 Headers Tab:');
  console.log('   - Look for "Authorization: Basic ..."');
  console.log('   - Look for custom headers with credentials\n');
  
  console.log('   📦 Payload Tab (or Request):');
  console.log('   - Look for:');
  console.log('     • client_id');
  console.log('     • client_secret');
  console.log('     • grant_type');
  console.log('     • username / email');
  console.log('     • password');
  console.log('     • Any JSON body with credentials\n');
  
  console.log('   📥 Response Tab:');
  console.log('   - Look for:');
  console.log('     • access_token');
  console.log('     • refresh_token');
  console.log('     • token');
  console.log('     • Any credential in response\n');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 QUICK CHECK:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('After logging in, check what was captured:');
  console.log('  window.__ushaPermanentCredentials');
  console.log('  window.__ushaLoginFlowCapture\n');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 ALTERNATIVE: Use Complete Capture Script');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('For automatic capture:');
  console.log('1. Log out');
  console.log('2. Run: scripts/capture-login-flow-complete.js');
  console.log('3. Log in');
  console.log('4. Run: showLoginCaptureSummary()\n');
  
  // Check if we can see any captured data
  if (window.__ushaPermanentCredentials) {
    const data = window.__ushaPermanentCredentials;
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 CURRENTLY CAPTURED DATA:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    if (Object.keys(data.clientCredentials || {}).length > 0) {
      console.log('✅ Client Credentials Found:');
      Object.keys(data.clientCredentials).forEach(key => {
        console.log(`   ${key}: ${data.clientCredentials[key].substring(0, 50)}...`);
      });
      console.log('');
    } else {
      console.log('⚠️  No client credentials captured yet\n');
    }
    
    if (data.recommendations && data.recommendations.length > 0) {
      console.log('💡 Recommendations:');
      data.recommendations.forEach((rec, i) => {
        console.log(`   ${i + 1}. ${rec.type} - ${rec.endpoint}`);
      });
      console.log('');
    }
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  return {
    instructions: 'Follow the steps above to manually inspect Network tab',
    checkData: () => {
      if (window.__ushaPermanentCredentials) {
        return window.__ushaPermanentCredentials;
      }
      if (window.__ushaLoginFlowCapture) {
        return window.__ushaLoginFlowCapture;
      }
      return null;
    }
  };
})();
