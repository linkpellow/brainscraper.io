#!/usr/bin/env tsx
/**
 * Script to get a fresh USHA JWT token
 * 
 * This script attempts to obtain a fresh USHA JWT token using all available methods:
 * 1. Cognito authentication (if configured)
 * 2. Direct OAuth authentication (if configured)
 * 3. Token refresh (if existing token is available)
 * 
 * Usage:
 *   npx tsx scripts/get-fresh-usha-token.ts
 * 
 * The script will output the token and instructions for updating your environment variables.
 */

import { getUshaToken } from '../utils/getUshaToken';
import { getUshaTokenDirect } from '../utils/ushaDirectAuth';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function getFreshToken() {
  console.log('\n🔑 [TOKEN_FETCH] ============================================');
  console.log('🔑 [TOKEN_FETCH] Attempting to get fresh USHA JWT token');
  console.log('🔑 [TOKEN_FETCH] ============================================\n');

  let token: string | null = null;
  let method = '';

  // Method 1: Try Cognito authentication (if configured)
  if (process.env.COGNITO_REFRESH_TOKEN || process.env.COGNITO_USERNAME) {
    console.log('📋 [TOKEN_FETCH] Method 1: Trying Cognito authentication...');
    try {
      token = await getUshaToken(null, true); // Force refresh
      if (token) {
        method = 'Cognito';
        console.log('✅ [TOKEN_FETCH] Successfully obtained token via Cognito');
      }
    } catch (error) {
      console.log('⚠️  [TOKEN_FETCH] Cognito authentication failed:', error instanceof Error ? error.message : 'Unknown error');
    }
  } else {
    console.log('⚠️  [TOKEN_FETCH] Cognito credentials not configured (COGNITO_REFRESH_TOKEN or COGNITO_USERNAME missing)');
  }

  // Method 2: Try direct OAuth authentication (if configured)
  if (!token && (process.env.USHA_USERNAME || process.env.USHA_CLIENT_ID)) {
    console.log('\n📋 [TOKEN_FETCH] Method 2: Trying direct OAuth authentication...');
    try {
      token = await getUshaTokenDirect(null, true); // Force refresh
      if (token) {
        method = 'Direct OAuth';
        console.log('✅ [TOKEN_FETCH] Successfully obtained token via Direct OAuth');
      }
    } catch (error) {
      console.log('⚠️  [TOKEN_FETCH] Direct OAuth authentication failed:', error instanceof Error ? error.message : 'Unknown error');
    }
  } else if (!token) {
    console.log('⚠️  [TOKEN_FETCH] Direct OAuth credentials not configured (USHA_USERNAME/USHA_PASSWORD or USHA_CLIENT_ID/USHA_CLIENT_SECRET missing)');
  }

  // Method 3: Try token refresh (if existing token is available)
  if (!token && process.env.USHA_JWT_TOKEN) {
    console.log('\n📋 [TOKEN_FETCH] Method 3: Trying token refresh...');
    try {
      // Check if token is expired
      const existingToken = process.env.USHA_JWT_TOKEN;
      const parts = existingToken.split('.');
      if (parts.length === 3) {
        try {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
          if (payload.exp) {
            const expiration = payload.exp * 1000;
            const now = Date.now();
            if (expiration > now) {
              console.log('✅ [TOKEN_FETCH] Existing token is still valid (not expired)');
              token = existingToken;
              method = 'Existing token (still valid)';
            } else {
              console.log('⚠️  [TOKEN_FETCH] Existing token is expired, attempting refresh...');
              // Try to refresh it
              token = await getUshaToken(null, true);
              if (token) {
                method = 'Token refresh';
                console.log('✅ [TOKEN_FETCH] Successfully refreshed token');
              } else {
                console.log('❌ [TOKEN_FETCH] Token refresh failed - expired tokens cannot be refreshed');
              }
            }
          }
        } catch (e) {
          console.log('⚠️  [TOKEN_FETCH] Could not decode token expiration, using existing token');
          token = existingToken;
          method = 'Existing token (expiration unknown)';
        }
      }
    } catch (error) {
      console.log('⚠️  [TOKEN_FETCH] Token refresh failed:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  // Output results
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 [TOKEN_FETCH] Results');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (token) {
    // Decode token to show expiration
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        if (payload.exp) {
          const expiration = new Date(payload.exp * 1000);
          const now = new Date();
          const expiresIn = Math.floor((payload.exp * 1000 - Date.now()) / 1000 / 60);
          console.log(`✅ Method: ${method}`);
          console.log(`✅ Token expires: ${expiration.toISOString()}`);
          console.log(`✅ Expires in: ${expiresIn} minutes`);
        }
      }
    } catch (e) {
      // Couldn't decode, but token is valid
    }

    console.log('\n📋 [TOKEN_FETCH] Token (first 50 chars):', token.substring(0, 50) + '...');
    console.log('\n📋 [TOKEN_FETCH] Full token:');
    console.log(token);
    
    console.log('\n📝 [TOKEN_FETCH] To update your environment variables:');
    console.log('   1. Add to .env.local:');
    console.log(`      USHA_JWT_TOKEN=${token}`);
    console.log('   2. Or update Railway environment variables:');
    console.log(`      USHA_JWT_TOKEN=${token}`);
    console.log('   3. Restart your server/application');
  } else {
    console.log('❌ [TOKEN_FETCH] Failed to obtain token using any method');
    console.log('\n📝 [TOKEN_FETCH] To get a token manually:');
    console.log('   1. Log into https://agent.ushadvisors.com');
    console.log('   2. Open browser DevTools (F12) → Network tab');
    console.log('   3. Find any request to the USHA API');
    console.log('   4. Copy the Authorization header value (Bearer <token>)');
    console.log('   5. Update USHA_JWT_TOKEN in your environment variables');
    console.log('\n📝 [TOKEN_FETCH] Or configure automated authentication:');
    console.log('   - Cognito: COGNITO_REFRESH_TOKEN or COGNITO_USERNAME/COGNITO_PASSWORD');
    console.log('   - Direct OAuth: USHA_USERNAME/USHA_PASSWORD or USHA_CLIENT_ID/USHA_CLIENT_SECRET');
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  return token;
}

// Run the script
getFreshToken()
  .then(token => {
    if (token) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ [TOKEN_FETCH] Fatal error:', error);
    process.exit(1);
  });

