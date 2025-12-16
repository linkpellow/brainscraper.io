/**
 * Test script for USHA DNC single phone number check
 * Usage: npx tsx scripts/test-usha-dnc.ts [phone-number]
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const USHA_API_URL = 'https://api-business-agent.ushadvisors.com/Leads/api/leads/scrubphonenumber';
const DEFAULT_AGENT_NUMBER = '00044447';

async function testDNC(phone: string, token?: string) {
  const jwtToken = token || process.env.USHA_JWT_TOKEN;
  
  if (!jwtToken) {
    console.error('❌ ERROR: USHA_JWT_TOKEN not found');
    console.error('Options:');
    console.error('  1. Add USHA_JWT_TOKEN=your-token to .env.local');
    console.error('  2. Pass token as second argument: npx tsx scripts/test-usha-dnc.ts [phone] [token]');
    process.exit(1);
  }

  // Clean phone number - remove all non-digits
  const cleanedPhone = phone.replace(/\D/g, '');
  
  if (cleanedPhone.length < 10) {
    console.error(`❌ ERROR: Invalid phone number format: ${phone}`);
    console.error('Phone number must be at least 10 digits');
    process.exit(1);
  }

  console.log(`\n🔍 Testing DNC status for phone: ${cleanedPhone}`);
  console.log(`📞 Original input: ${phone}`);
  console.log(`🔑 Using agent number: ${DEFAULT_AGENT_NUMBER}`);
  console.log('⏳ Calling USHA API...\n');

  try {
    const url = `${USHA_API_URL}?currentContextAgentNumber=${encodeURIComponent(DEFAULT_AGENT_NUMBER)}&phone=${encodeURIComponent(cleanedPhone)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Origin': 'https://agent.ushadvisors.com',
        'Referer': 'https://agent.ushadvisors.com',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API Error (${response.status}): ${response.statusText}`);
      console.error(`Details: ${errorText}`);
      process.exit(1);
    }

    const result = await response.json();
    
    // Determine DNC status from response
    // Check the nested data structure first, then fallback to top-level
    const responseData = result.data || result;
    const isDNC = responseData.isDoNotCall === true || 
                  responseData.contactStatus?.canContact === false ||
                  result.isDNC === true || 
                  result.isDoNotCall === true || 
                  result.status === 'DNC' || 
                  result.status === 'Do Not Call' ||
                  result.canContact === false;
    
    const canContact = responseData.contactStatus?.canContact !== false && !isDNC;
    const reason = responseData.contactStatus?.reason || responseData.reason || (isDNC ? 'Do Not Call' : undefined);

    console.log('✅ API Response received\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 DNC CHECK RESULTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log(`Phone Number:     ${cleanedPhone}`);
    console.log(`DNC Status:        ${isDNC ? '🔴 DO NOT CALL' : '🟢 OK TO CALL'}`);
    console.log(`Can Contact:       ${canContact ? '✅ YES' : '❌ NO'}`);
    if (reason) {
      console.log(`Reason:            ${reason}`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('📋 Full API Response:');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n');

    // Exit with appropriate code
    process.exit(isDNC ? 1 : 0);
  } catch (error) {
    console.error('❌ Error calling USHA API:');
    console.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Get phone number and optional token from command line arguments
const phoneNumber = process.argv[2] || '2694621403';
const token = process.argv[3];

if (!phoneNumber) {
  console.error('Usage: npx tsx scripts/test-usha-dnc.ts [phone-number] [token]');
  console.error('Example: npx tsx scripts/test-usha-dnc.ts 2694621403');
  console.error('Or: npx tsx scripts/test-usha-dnc.ts 2694621403 your-jwt-token');
  process.exit(1);
}

testDNC(phoneNumber, token);
