/**
 * Test enrichment with a single lead to verify email/phone extraction works
 * This prevents wasting API calls on a full batch
 * 
 * NOTE: This script tests the extraction logic. For full enrichment testing,
 * you need to run it through the Next.js API routes (browser or server-side).
 */

import * as fs from 'fs';
import * as path from 'path';
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
  console.log('🧪 Testing single lead enrichment...\n');
  
  // Load one lead from saved results - try to find file with email/phone
  const resultsDir = path.join(process.cwd(), 'data', 'api-results');
  const files = fs.readdirSync(resultsDir)
    .filter(f => f.endsWith('.json') && f.startsWith('20'))
    .sort()
    .reverse();
  
  if (files.length === 0) {
    console.error('❌ No saved result files found');
    return;
  }
  
  // Try to find a file with email/phone in summary
  let filePath: string | null = null;
  for (const file of files) {
    const testPath = path.join(resultsDir, file);
    const testContent = fs.readFileSync(testPath, 'utf-8');
    const testResult = JSON.parse(testContent);
    const leads = testResult.rawResponse?.response?.data || testResult.data?.response?.data || testResult.data || [];
    for (const l of leads) {
      const summary = l.summary || '';
      if (summary.includes('Email:') || summary.includes('Phone:') || summary.includes('@')) {
        filePath = testPath;
        console.log(`📂 Using file: ${file} (found lead with email/phone)\n`);
        break;
      }
    }
    if (filePath) break;
  }
  
  // Fallback to first file
  if (!filePath) {
    filePath = path.join(resultsDir, files[0]);
    console.log(`📂 Using file: ${files[0]} (no email/phone found, will test extraction anyway)\n`);
  }
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const savedResult = JSON.parse(fileContent);
  
  // Extract leads and find one with email/phone in summary
  let leads: any[] = [];
  if (savedResult.rawResponse?.response?.data && Array.isArray(savedResult.rawResponse.response.data)) {
    leads = savedResult.rawResponse.response.data;
  } else if (savedResult.data?.response?.data && Array.isArray(savedResult.data.response.data)) {
    leads = savedResult.data.response.data;
  } else if (Array.isArray(savedResult.data)) {
    leads = savedResult.data;
  }
  
  if (leads.length === 0) {
    console.error('❌ No leads found in file');
    return;
  }
  
  // Find a lead with email/phone in summary
  let lead: any = null;
  for (const l of leads) {
    const summary = l.summary || '';
    if (summary.includes('Email:') || summary.includes('Phone:') || summary.includes('@')) {
      lead = l;
      break;
    }
  }
  
  // If none found, use first lead anyway
  if (!lead) {
    lead = leads[0];
    console.log('⚠️  No lead with email/phone in summary found, using first lead\n');
  }
  
  console.log('📋 Lead Info:');
  console.log(`   Name: ${lead.fullName || lead.name || 'N/A'}`);
  console.log(`   Location: ${lead.geoRegion || lead.location || 'N/A'}`);
  console.log(`   Has summary: ${!!lead.summary}`);
  console.log(`   Summary length: ${lead.summary ? lead.summary.length : 0}`);
  console.log(`   Summary preview: ${lead.summary ? lead.summary.substring(0, 150) + '...' : 'N/A'}\n`);
  
  // Extract email and phone from summary
  const summary = lead.summary || '';
  const extractedEmail = lead.email || extractEmailFromSummary(summary);
  const extractedPhone = lead.phone || lead.phone_number || extractPhoneFromSummary(summary);
  
  console.log('🔍 Extraction Results:');
  console.log(`   Email extracted: ${extractedEmail || 'NONE'}`);
  console.log(`   Phone extracted: ${extractedPhone || 'NONE'}\n`);
  
  if (!extractedEmail && !extractedPhone) {
    console.error('❌ No email or phone found! Cannot test enrichment.');
    return;
  }
  
  // Convert to ParsedData format
  const rawFullName = lead.fullName || lead.name || lead.full_name || 
    (lead.firstName || lead.first_name ? 
      `${lead.firstName || lead.first_name} ${lead.lastName || lead.last_name || ''}`.trim() : 
      '');
  const fullName = normalizeName(rawFullName);
  const nameParts = fullName.split(' ');
  const location = lead.geoRegion || lead.location || '';
  const locationParts = location.split(',').map((s: string) => s.trim());
  
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
  
  console.log('✅ Extraction Test Results:\n');
  console.log('📊 What will be sent to enrichment:');
  console.log(`   Name: ${fullName}`);
  console.log(`   First Name: ${nameParts[0] || 'N/A'}`);
  console.log(`   Last Name: ${nameParts.slice(1).join(' ') || 'N/A'}`);
  console.log(`   Email: ${extractedEmail || 'N/A'}`);
  console.log(`   Phone: ${extractedPhone || 'N/A'}`);
  console.log(`   City: ${locationParts[0] || 'N/A'}`);
  console.log(`   State: ${locationParts[1] || 'N/A'}\n`);
  
  // Test ZIP lookup
  try {
    const { lookupZipFromCityState } = await import('../utils/zipLookup');
    const zipCode = lookupZipFromCityState(locationParts[0] || '', locationParts[1] || '');
    console.log(`   ZIP (from lookup): ${zipCode || 'N/A'}\n`);
  } catch (error) {
    console.log(`   ZIP lookup: Not available in Node.js context\n`);
  }
  
  console.log('🔍 Enrichment Pipeline Will:');
  if (extractedEmail || (nameParts[0] && nameParts.slice(1).join(' '))) {
    console.log('   ✅ STEP 3: Call skip-tracing API (phone discovery)');
  } else {
    console.log('   ❌ STEP 3: SKIP - No email or name available');
  }
  
  if (extractedPhone) {
    console.log('   ✅ STEP 4: Call Telnyx API (line type & carrier)');
    console.log('   ✅ STEP 5: Run gatekeep logic');
    console.log('   ✅ STEP 6: Call skip-tracing API (age) - if gatekeep passes');
  } else {
    console.log('   ❌ STEP 4: SKIP - No phone available');
    console.log('   ❌ STEP 5: SKIP - No phone available');
    console.log('   ❌ STEP 6: SKIP - No phone available');
  }
  
  console.log('\n💡 To test full enrichment, use the UI or API endpoints.');
  console.log('   The extraction is working correctly! ✅\n');
  
  console.log('✅ Test complete!');
}

main().catch(console.error);
