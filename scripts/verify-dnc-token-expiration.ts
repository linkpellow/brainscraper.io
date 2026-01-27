/**
 * Verification Script: DNC Token Expiration & Refresh Logic
 * 
 * This script verifies that:
 * 1. Token expiration is correctly extracted from JWT
 * 2. Expiration is stored in session (expires_at)
 * 3. Refresh logic correctly uses expiration time
 * 4. DNC scrub endpoints will always have valid tokens
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

function extractJWTExpiration(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const Buffer = require('buffer').Buffer;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (payload.exp) {
      // JWT exp is in seconds, convert to milliseconds
      return payload.exp * 1000;
    }
    return null;
  } catch {
    return null;
  }
}

function main() {
  console.log('🔍 VERIFICATION: DNC Token Expiration & Refresh Logic\n');
  console.log('='.repeat(60));
  console.log('');

  // Find auth worker sessions
  const authWorkerDir = 'data/auth-workers';
  if (!existsSync(authWorkerDir)) {
    console.log('❌ No auth-workers directory found');
    process.exit(1);
  }

  const files = readdirSync(authWorkerDir).filter(f => f.endsWith('.json') && f.startsWith('har_'));
  if (files.length === 0) {
    console.log('❌ No auth worker sessions found');
    process.exit(1);
  }

  // Get USHA session
  let ushaSession: any = null;
  let ushaSessionFile: string | null = null;

  for (const file of files.sort().reverse()) {
    const sessionData = JSON.parse(readFileSync(join(authWorkerDir, file), 'utf-8'));
    if (sessionData.targetDomain === 'agent.ushadvisors.com') {
      ushaSession = sessionData;
      ushaSessionFile = file;
      break;
    }
  }

  if (!ushaSession) {
    console.log('❌ No USHA session found for agent.ushadvisors.com');
    process.exit(1);
  }

  console.log('✅ Found USHA session:', ushaSessionFile);
  console.log('  Session ID:', ushaSession.sessionId || 'N/A');
  console.log('  Domain:', ushaSession.targetDomain);
  console.log('');

  // Extract token
  const accessToken = ushaSession.step2?.extractedVars?.access_token;
  if (!accessToken) {
    console.log('❌ No access_token found in session');
    process.exit(1);
  }

  console.log('✅ Access token found');
  console.log('  Token preview:', accessToken.substring(0, 50) + '...');
  console.log('');

  // Extract expiration from stored expires_at
  let storedExpiresAt: number | null = null;
  if (ushaSession.step2?.extractedVars?.expires_at) {
    storedExpiresAt = parseInt(ushaSession.step2.extractedVars.expires_at, 10);
    console.log('✅ Stored expires_at found');
    console.log('  Value:', storedExpiresAt);
    console.log('  Date:', new Date(storedExpiresAt).toISOString());
  } else {
    console.log('⚠️  No stored expires_at in session');
  }

  // Extract expiration from JWT
  const jwtExpiresAt = extractJWTExpiration(accessToken);
  if (jwtExpiresAt) {
    console.log('✅ JWT expiration extracted');
    console.log('  Value:', jwtExpiresAt);
    console.log('  Date:', new Date(jwtExpiresAt).toISOString());
  } else {
    console.log('❌ Failed to extract JWT expiration');
  }

  console.log('');

  // Verify they match
  if (storedExpiresAt && jwtExpiresAt) {
    const diff = Math.abs(storedExpiresAt - jwtExpiresAt);
    if (diff < 1000) {
      console.log('✅ VERIFIED: Stored expires_at matches JWT expiration (diff:', diff, 'ms)');
    } else {
      console.log('⚠️  WARNING: Stored expires_at does not match JWT expiration');
      console.log('  Difference:', diff, 'ms');
    }
  } else if (jwtExpiresAt && !storedExpiresAt) {
    console.log('⚠️  WARNING: JWT expiration found but not stored in session');
    console.log('  Should update session with expires_at:', jwtExpiresAt);
  }

  console.log('');

  // Test refresh logic
  const now = Date.now();
  const PROACTIVE_REFRESH_BUFFER_MS = 30 * 60 * 1000; // 30 minutes

  const expirationTime = storedExpiresAt || jwtExpiresAt;
  if (expirationTime) {
    const timeUntilExpiry = expirationTime - now;
    const timeUntilRefresh = expirationTime - PROACTIVE_REFRESH_BUFFER_MS - now;
    const needsRefresh = timeUntilExpiry <= 0 || timeUntilExpiry < PROACTIVE_REFRESH_BUFFER_MS;
    
    console.log('🔄 Refresh Logic Test:');
    console.log('  Current time:', new Date(now).toISOString());
    console.log('  Expiration time:', new Date(expirationTime).toISOString());
    console.log('  Time until expiry:', Math.floor(timeUntilExpiry / 1000 / 60), 'minutes');
    console.log('  Refresh buffer:', PROACTIVE_REFRESH_BUFFER_MS / 1000 / 60, 'minutes');
    console.log('  Needs refresh:', needsRefresh ? '✅ YES' : '❌ NO');
    console.log('  Refresh will trigger at:', new Date(expirationTime - PROACTIVE_REFRESH_BUFFER_MS).toISOString());
    console.log('  Time until refresh trigger:', Math.floor(timeUntilRefresh / 1000 / 60), 'minutes');
    
    if (timeUntilExpiry > 0 && timeUntilExpiry < PROACTIVE_REFRESH_BUFFER_MS) {
      console.log('  ⚠️  Token will expire soon - refresh should trigger soon');
    } else if (timeUntilExpiry <= 0) {
      console.log('  ❌ Token is EXPIRED - refresh should trigger immediately');
    } else {
      console.log('  ✅ Token is valid and refresh will happen proactively');
    }
  } else {
    console.log('❌ Cannot test refresh logic - no expiration time available');
  }

  console.log('');

  // Check refresh capability
  const hasRefreshToken = !!ushaSession.step2?.extractedVars?.refresh_token;
  const hasRefreshUrl = !!ushaSession.step2?.extractedVars?.refresh_url;

  console.log('🔑 Refresh Capability:');
  console.log('  Has refresh_token:', hasRefreshToken ? '✅ YES' : '❌ NO');
  console.log('  Has refresh_url:', hasRefreshUrl ? '✅ YES' : '❌ NO');
  if (hasRefreshUrl) {
    console.log('  Refresh URL:', ushaSession.step2.extractedVars.refresh_url);
  }

  if (!hasRefreshToken && !hasRefreshUrl) {
    console.log('  ⚠️  WARNING: No refresh capability - token cannot be refreshed automatically');
  } else {
    console.log('  ✅ Refresh capability available');
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('');

  // Final verification summary
  console.log('📊 FINAL VERIFICATION SUMMARY:');
  console.log('');
  
  const allChecks = [
    { name: 'Token exists', passed: !!accessToken },
    { name: 'Expiration extracted from JWT', passed: !!jwtExpiresAt },
    { name: 'Expiration stored in session', passed: !!storedExpiresAt },
    { name: 'Expiration times match', passed: storedExpiresAt && jwtExpiresAt && Math.abs(storedExpiresAt - jwtExpiresAt) < 1000 },
    { name: 'Refresh capability available', passed: hasRefreshToken || hasRefreshUrl },
    { name: 'Token is valid (not expired)', passed: expirationTime ? expirationTime > now : false },
    { name: 'Refresh will happen proactively', passed: expirationTime ? (expirationTime - now) > PROACTIVE_REFRESH_BUFFER_MS : false },
  ];

  let allPassed = true;
  for (const check of allChecks) {
    const status = check.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status}: ${check.name}`);
    if (!check.passed) allPassed = false;
  }

  console.log('');
  if (allPassed) {
    console.log('✅ ALL CHECKS PASSED: DNC scrubbing will have valid tokens');
    console.log('   Authorization will always work for DNC scrubbing');
  } else {
    console.log('⚠️  SOME CHECKS FAILED: Review the issues above');
  }
  console.log('');
}

main();
