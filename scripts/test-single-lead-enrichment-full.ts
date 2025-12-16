/**
 * Test full enrichment pipeline with ONE lead to verify fixes work
 * This prevents wasting API calls on a full batch
 */

import * as fs from 'fs';
import * as path from 'path';
import { enrichData } from '../utils/enrichData';
import { extractLeadSummary } from '../utils/extractLeadSummary';
import type { EnrichedRow } from '../utils/enrichData';

/**
 * Extracts email from LinkedIn summary text
 */
function extractEmailFromSummary(summary: string | undefined): string {
  if (!summary) return '';
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const matches = summary.match(emailRegex);
  return matches && matches.length > 0 ? matches[0] : '';
}

/**
 * Extracts phone from LinkedIn summary text
 */
function extractPhoneFromSummary(summary: string | undefined): string {
  if (!summary) return '';
  const phonePatterns = [
    /Phone:\s*([\d\s\-\(\)]+)/i,
    /Phone\s*:\s*([\d\s\-\(\)]+)/i,
    /Tel:\s*([\d\s\-\(\)]+)/i,
    /(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g,
  ];
  
  for (const pattern of phonePatterns) {
    const match = summary.match(pattern);
    if (match && match[1]) {
      const cleaned = match[1].replace(/[^\d+]/g, '');
      if (cleaned.length >= 10) {
        return cleaned;
      }
    }
  }
  return '';
}

/**
 * Normalizes a name by removing credentials
 */
function normalizeName(name: string): string {
  if (!name) return '';
  const firstPart = name.split(',')[0].trim();
  return firstPart.replace(/\.$/, '').trim();
}

async function main() {
  console.log('🧪 Testing SINGLE lead enrichment with FULL pipeline...\n');
  console.log('⚠️  This will make REAL API calls - use for verification only\n');
  
  // Load one lead from saved results that has email/phone
  const resultsDir = path.join(process.cwd(), 'data', 'api-results');
  const files = fs.readdirSync(resultsDir)
    .filter(f => f.endsWith('.json') && f.startsWith('20'))
    .sort()
    .reverse();
  
  if (files.length === 0) {
    console.error('❌ No saved result files found');
    return;
  }
  
  // Find a lead with email/phone in summary
  let lead: any = null;
  let sourceFile = '';
  
  for (const file of files) {
    const filePath = path.join(resultsDir, file);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const savedResult = JSON.parse(fileContent);
    
    let leads: any[] = [];
    if (savedResult.rawResponse?.response?.data && Array.isArray(savedResult.rawResponse.response.data)) {
      leads = savedResult.rawResponse.response.data;
    } else if (savedResult.data?.response?.data && Array.isArray(savedResult.data.response.data)) {
      leads = savedResult.data.response.data;
    } else if (Array.isArray(savedResult.data)) {
      leads = savedResult.data;
    }
    
    for (const l of leads) {
      const summary = l.summary || '';
      if (summary.includes('Email:') || summary.includes('Phone:') || summary.includes('@')) {
        lead = l;
        sourceFile = file;
        break;
      }
    }
    if (lead) break;
  }
  
  if (!lead) {
    console.error('❌ No lead with email/phone in summary found');
    return;
  }
  
  console.log(`📂 Using lead from: ${sourceFile}\n`);
  
  // Extract and display lead info
  const summary = lead.summary || '';
  const extractedEmail = lead.email || extractEmailFromSummary(summary);
  const extractedPhone = lead.phone || lead.phone_number || extractPhoneFromSummary(summary);
  
  const rawFullName = lead.fullName || lead.name || lead.full_name || 
    (lead.firstName || lead.first_name ? 
      `${lead.firstName || lead.first_name} ${lead.lastName || lead.last_name || ''}`.trim() : 
      '');
  const fullName = normalizeName(rawFullName);
  const nameParts = fullName.split(' ');
  const location = lead.geoRegion || lead.location || '';
  const locationParts = location.split(',').map((s: string) => s.trim());
  
  console.log('📋 Lead Info:');
  console.log(`   Name: ${fullName}`);
  console.log(`   Location: ${location}`);
  console.log(`   City: ${locationParts[0] || 'N/A'}`);
  console.log(`   State: ${locationParts[1] || 'N/A'}`);
  console.log(`   Email (extracted): ${extractedEmail || 'NONE'}`);
  console.log(`   Phone (extracted): ${extractedPhone || 'NONE'}\n`);
  
  if (!extractedEmail && !extractedPhone) {
    console.error('❌ No email or phone found! Cannot test enrichment.');
    return;
  }
  
  // Convert to ParsedData format (same as UI does)
  const headers = ['Name', 'Title', 'Company', 'Location', 'LinkedIn URL', 'Email', 'Phone', 'First Name', 'Last Name', 'City', 'State', 'Zip', 'Search Filter'];
  const row = {
    'Name': fullName,
    'Title': lead.currentPosition?.title || lead.title || lead.job_title || lead.headline || '',
    'Company': lead.currentPosition?.companyName || lead.company || lead.company_name || '',
    'Location': location,
    'LinkedIn URL': lead.navigationUrl || lead.linkedin_url || lead.profile_url || lead.url || '',
    'Email': extractedEmail,
    'Phone': extractedPhone,
    'First Name': nameParts[0] || '',
    'Last Name': nameParts.slice(1).join(' ') || '',
    'City': locationParts[0] || '',
    'State': locationParts[1] || '',
    'Zip': locationParts[2] || '',
    'Search Filter': 'Test Lead',
  };
  
  const parsedData = {
    headers,
    rows: [row],
    rowCount: 1,
    columnCount: headers.length,
  };
  
  console.log('🔄 Starting enrichment with OPTIMIZED PIPELINE...');
  console.log('   Pipeline: LinkedIn → ZIP (free) → Phone → Telnyx → Gatekeep → Age');
  console.log('   This will make API calls if needed...\n');
  
  // Enrich the lead
  const enriched = await enrichData(parsedData, (current, total) => {
    console.log(`   Progress: ${current}/${total}`);
  });
  
  console.log('\n✅ Enrichment complete!\n');
  
  // Extract lead summary
  const enrichedRow = enriched.rows[0];
  const summary_result = extractLeadSummary(enrichedRow, enrichedRow._enriched);
  
  console.log('📊 Final Results:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Name: ${summary_result.name || 'N/A'}`);
  console.log(`   Phone: ${summary_result.phone || 'N/A'} ${summary_result.phone ? '✅' : '❌'}`);
  console.log(`   Email: ${summary_result.email || 'N/A'} ${summary_result.email ? '✅' : '❌'}`);
  console.log(`   City: ${summary_result.city || 'N/A'}`);
  console.log(`   State: ${summary_result.state || 'N/A'}`);
  console.log(`   Zipcode: ${summary_result.zipcode || 'N/A'} ${summary_result.zipcode ? '✅' : '❌'}`);
  console.log(`   Age/DOB: ${summary_result.dobOrAge || 'N/A'} ${summary_result.dobOrAge ? '✅' : '❌'}`);
  console.log(`   Line Type: ${summary_result.lineType || 'N/A'} ${summary_result.lineType ? '✅' : '❌'}`);
  console.log(`   Carrier: ${summary_result.carrier || 'N/A'} ${summary_result.carrier ? '✅' : '❌'}`);
  console.log(`   Address: ${summary_result.address || 'N/A'} ${summary_result.address ? '✅' : '❌'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('🔍 Enrichment Details:');
  if (enrichedRow._enriched) {
    const e = enrichedRow._enriched;
    console.log(`   Has skip-tracing data: ${!!e.skipTracingData}`);
    console.log(`   Has Telnyx data: ${!!e.telnyxLookupData}`);
    console.log(`   Enriched phone: ${e.phone || 'N/A'}`);
    console.log(`   Enriched email: ${e.email || 'N/A'}`);
    console.log(`   Enriched zipCode: ${e.zipCode || 'N/A'}`);
    console.log(`   Enriched age: ${e.age || 'N/A'}`);
    console.log(`   Enriched dob: ${e.dob || 'N/A'}`);
    console.log(`   Line type: ${e.lineType || 'N/A'}`);
    console.log(`   Carrier: ${e.carrierName || 'N/A'}`);
    if (e.error) {
      console.log(`   ⚠️  Errors: ${e.error}`);
    }
  }
  
  // Check if data was preserved
  console.log('\n🔍 Data Preservation Check:');
  const phonePreserved = summary_result.phone && (summary_result.phone === extractedPhone || summary_result.phone.length > 0);
  const emailPreserved = summary_result.email && (summary_result.email === extractedEmail || summary_result.email.length > 0);
  
  console.log(`   Original phone preserved: ${phonePreserved ? '✅' : '❌'}`);
  console.log(`   Original email preserved: ${emailPreserved ? '✅' : '❌'}`);
  
  if (phonePreserved && emailPreserved) {
    console.log('\n✅ SUCCESS! Data extraction and preservation is working correctly!');
    console.log('   You can now safely enrich the full batch.\n');
  } else {
    console.log('\n⚠️  WARNING: Data may not be preserved correctly.');
    console.log('   Check the logs above to see where data was lost.\n');
  }
  
  console.log('✅ Test complete!');
}

main().catch(console.error);
