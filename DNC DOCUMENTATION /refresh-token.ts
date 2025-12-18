#!/usr/bin/env tsx
/**
 * USHA Token Refresh - Standalone Script
 * Usage: npx tsx scripts/refresh-token.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { getUshaToken, clearTokenCache } from '../utils/getUshaToken';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function refreshToken() {
  console.log('🔄 Refreshing USHA token...\n');

  try {
    // Clear cache to force refresh
    clearTokenCache();
    console.log('✅ Token cache cleared\n');

    // Get fresh token (will trigger refresh if needed)
    const token = await getUshaToken(null, true); // forceRefresh = true

    if (token) {
      console.log('✅ Token refreshed successfully!');
      console.log(`   Token: ${token.substring(0, 50)}...`);
      console.log(`   Length: ${token.length} characters`);
      
      // Decode token to show expiration
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
          if (payload.exp) {
            const expiration = new Date(payload.exp * 1000);
            const now = new Date();
            const expiresIn = Math.floor((payload.exp * 1000 - now.getTime()) / 1000 / 60);
            console.log(`   Expires: ${expiration.toISOString()}`);
            console.log(`   Expires in: ${expiresIn} minutes`);
          }
        }
      } catch (e) {
        // Couldn't decode, but token is valid
      }
    } else {
      throw new Error('Token is null or undefined');
    }
  } catch (error) {
    console.error('❌ Token refresh failed!');
    console.error(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('\n💡 Check your .env.local configuration:');
    console.error('   - COGNITO_REFRESH_TOKEN (recommended)');
    console.error('   - USHA_JWT_TOKEN (temporary)');
    process.exit(1);
  }
}

refreshToken();
