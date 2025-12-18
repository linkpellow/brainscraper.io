#!/usr/bin/env tsx
/**
 * USHA DNC Scrub with Automatic Token Refresh - Standalone Script
 * Usage: npx tsx scripts/scrub-with-auto-refresh.ts <phone-number> [agent-number]
 * 
 * This script scrubs a phone number and automatically refreshes the token
 * if authentication fails, then retries the scrub.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { getUshaToken, clearTokenCache } from '../utils/getUshaToken';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const phone = process.argv[2] || '2143493972';
const agentNumber = process.argv[3] || '00044447';
const MAX_RETRIES = 2;

async function scrubPhoneWithAutoRefresh(attempt: number = 1, forceRefresh: boolean = false): Promise<boolean> {
  console.log(`\n🔍 Attempt ${attempt}: Scrubbing phone number: ${phone}`);
  console.log(`📞 Agent number: ${agentNumber}`);

  if (forceRefresh) {
    console.log('🔄 Forcing token refresh...');
    clearTokenCache();
  }

  try {
    // Get token (will auto-refresh if needed)
    const token = await getUshaToken(null, forceRefresh);
    
    if (!token) {
      throw new Error('Failed to obtain token');
    }

    // Build USHA API URL
    const cleanedPhone = phone.replace(/\D/g, '');
    const url = `https://api-business-agent.ushadvisors.com/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=${encodeURIComponent(agentNumber)}&phone=${encodeURIComponent(cleanedPhone)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://agent.ushadvisors.com',
        'Referer': 'https://agent.ushadvisors.com',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // If 401 and we haven't retried yet, try again with refresh
      if (response.status === 401 && attempt < MAX_RETRIES) {
        console.log(`⚠️  Authentication error (${response.status})`);
        console.log('🔄 Retrying with token refresh...');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        return scrubPhoneWithAutoRefresh(attempt + 1, true);
      }
      
      throw new Error(`USHA API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
    }

    const result = await response.json();
    
    // Parse response
    const responseData = result.data || result;
    const isDNC = responseData.isDoNotCall === true || 
                 responseData.contactStatus?.canContact === false ||
                 result.isDNC === true || 
                 result.isDoNotCall === true;
    const canContact = responseData.contactStatus?.canContact !== false && !isDNC;
    const reason = responseData.contactStatus?.reason || responseData.reason || (isDNC ? 'Do Not Call' : undefined);
    const status = isDNC ? 'DNC' : 'OK';

    console.log('\n✅ Scrub successful!');
    console.log(`   Phone: ${cleanedPhone}`);
    console.log(`   DNC Status: ${status}`);
    console.log(`   Is DNC: ${isDNC}`);
    console.log(`   Can Contact: ${canContact}`);
    if (reason) {
      console.log(`   Reason: ${reason}`);
    }
    
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    
    // If we haven't retried yet and it's an auth error, try again
    if (attempt < MAX_RETRIES && (errorMsg.includes('401') || errorMsg.includes('Unauthorized') || errorMsg.includes('token'))) {
      console.log(`⚠️  Error: ${errorMsg}`);
      console.log('🔄 Retrying with token refresh...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      return scrubPhoneWithAutoRefresh(attempt + 1, true);
    }
    
    console.error(`\n❌ Scrub failed after ${attempt} attempt(s)!`);
    console.error(`   Error: ${errorMsg}`);
    
    if (attempt >= MAX_RETRIES) {
      console.error('\n💡 Max retries reached. Check your configuration:');
      console.error('   - COGNITO_REFRESH_TOKEN (recommended)');
      console.error('   - USHA_JWT_TOKEN (temporary)');
    }
    
    return false;
  }
}

async function main() {
  const success = await scrubPhoneWithAutoRefresh(1, false);
  process.exit(success ? 0 : 1);
}

main();
