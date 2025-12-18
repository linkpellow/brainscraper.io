#!/usr/bin/env tsx
/**
 * Test USHA DNC API Direct
 * 
 * Tests the USHA DNC API with the exact endpoint and format provided
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { getUshaToken } from '../utils/getUshaToken';

async function testUSHDNCDirect() {
  console.log('🧪 Testing USHA DNC API Direct\n');
  
  const testPhone = '2143493972';
  const currentContextAgentNumber = '00044447';
  
  try {
    // Get USHA JWT token
    console.log('🔑 Getting USHA JWT token...');
    const token = await getUshaToken();
    
    if (!token) {
      console.error('❌ Failed to get USHA token');
      return;
    }
    
    console.log(`✅ Token obtained: ${token.substring(0, 50)}...\n`);
    
    // Call USHA DNC API
    const url = `https://api-business-agent.ushadvisors.com/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=${encodeURIComponent(currentContextAgentNumber)}&phone=${encodeURIComponent(testPhone)}`;
    
    console.log(`📞 Calling: ${url}\n`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'accept': 'application/json, text/plain, */*',
        'Referer': 'https://agent.ushadvisors.com/',
        'Content-Type': 'application/json',
      }
    });
    
    console.log(`📊 Status: ${response.status} ${response.statusText}\n`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error: ${errorText}`);
      return;
    }
    
    const result = await response.json();
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ SUCCESS! Response:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(JSON.stringify(result, null, 2));
    console.log('');
    
    // Parse response
    const data = result.data;
    if (data) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📋 DNC Status:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log(`Phone: ${data.phoneNumber || testPhone}`);
      console.log(`isDoNotCall: ${data.isDoNotCall}`);
      console.log(`canContact: ${data.contactStatus?.canContact}`);
      console.log(`reason: ${data.contactStatus?.reason || 'N/A'}`);
      console.log('');
      
      if (data.isDoNotCall === true || data.contactStatus?.canContact === false) {
        console.log('🚫 DNC: Do Not Call');
      } else {
        console.log('✅ OK: Can Contact');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testUSHDNCDirect();
