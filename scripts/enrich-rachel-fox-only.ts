/**
 * Enrich only Rachel Fox to verify the pipeline works
 */

import * as fs from 'fs';
import * as path from 'path';
import { enrichData } from '../utils/enrichData';
import { extractLeadSummary } from '../utils/extractLeadSummary';
import type { EnrichedRow } from '../utils/enrichData';
import type { LeadSummary } from '../utils/extractLeadSummary';

/**
 * Loads leads from saved API results files
 */
function loadLeadsFromFiles(): any[] {
  const resultsDir = path.join(process.cwd(), 'data', 'api-results');
  const allLeads: any[] = [];
  
  if (!fs.existsSync(resultsDir)) {
    console.log('📁 No api-results directory found');
    return [];
  }
  
  const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.json') && f.startsWith('20')).sort().reverse();
  console.log(`📁 Found ${files.length} result files`);
  
  for (const file of files) {
    try {
      const filePath = path.join(resultsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      let leads: any[] = [];
      
      if (data.processedResults && Array.isArray(data.processedResults)) {
        leads = data.processedResults;
      } else if (data.rawResponse?.response?.data && Array.isArray(data.rawResponse.response.data)) {
        leads = data.rawResponse.response.data;
      } else if (data.rawResponse?.data?.response?.data && Array.isArray(data.rawResponse.data.response.data)) {
        leads = data.rawResponse.data.response.data;
      } else if (data.results && Array.isArray(data.results)) {
        leads = data.results;
      } else if (data.rawResponse?.data && Array.isArray(data.rawResponse.data)) {
        leads = data.rawResponse.data;
      } else if (Array.isArray(data.rawResponse)) {
        leads = data.rawResponse;
      }
      
      allLeads.push(...leads);
    } catch (error) {
      console.error(`❌ Error reading ${file}:`, error);
    }
  }
  
  return allLeads;
}

/**
 * Normalizes a name by removing credentials
 */
function normalizeName(name: string): string {
  if (!name) return '';
  const firstPart = name.split(',')[0].trim();
  return firstPart.replace(/\.$/, '').trim();
}

/**
 * Converts raw leads to ParsedData format
 */
function convertLeadsToParsedData(leads: any[]): { headers: string[]; rows: any[]; rowCount: number; columnCount: number } {
  const headers = ['Name', 'Title', 'Company', 'Location', 'LinkedIn URL', 'Email', 'Phone', 'First Name', 'Last Name', 'City', 'State', 'Zip', 'Search Filter'];
  
  const rows = leads.map((lead: any) => {
    const rawFullName = lead.fullName || lead.name || lead.full_name || 
      (lead.firstName || lead.first_name ? 
        `${lead.firstName || lead.first_name} ${lead.lastName || lead.last_name || ''}`.trim() : 
        'Unknown');
    const fullName = normalizeName(rawFullName);
    const nameParts = fullName.split(' ');
    
    const location = lead.geoRegion || lead.location || '';
    const locationParts = location.split(',').map((s: string) => s.trim());
    
    const searchFilter = lead._searchParams ? 
      Object.entries(lead._searchParams)
        .filter(([k, v]) => v && k !== 'rapidApiKey' && k !== 'RAPIDAPI_KEY' && k !== 'endpoint')
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ') : 
      'From Saved Results';
    
    return {
      'Name': fullName,
      'Title': lead.currentPosition?.title || lead.title || lead.job_title || lead.headline || '',
      'Company': lead.currentPosition?.companyName || lead.company || lead.company_name || '',
      'Location': location,
      'LinkedIn URL': lead.navigationUrl || lead.linkedin_url || lead.profile_url || lead.url || '',
      'Email': lead.email || '',
      'Phone': lead.phone || lead.phone_number || '',
      'First Name': nameParts[0] || '',
      'Last Name': nameParts.slice(1).join(' ') || '',
      'City': lead.city || locationParts[0] || '',
      'State': lead.state || locationParts[1] || '',
      'Zip': lead.zip || lead.zipcode || lead.postal_code || '',
      'Search Filter': searchFilter
    };
  });
  
  return {
    headers,
    rows,
    rowCount: rows.length,
    columnCount: headers.length
  };
}

async function main() {
  console.log('🚀 Starting Rachel Fox enrichment test...\n');
  
  // Load all leads
  console.log('📥 Loading leads from saved files...');
  const allLeads = loadLeadsFromFiles();
  
  if (allLeads.length === 0) {
    console.log('❌ No leads found to enrich');
    process.exit(1);
  }
  
  console.log(`✅ Loaded ${allLeads.length} leads\n`);
  
  // Find Rachel Fox
  console.log('🔍 Searching for Rachel Fox...');
  const rachelFoxLead = allLeads.find((lead: any) => {
    const name = normalizeName(lead.fullName || lead.name || '').toLowerCase();
    return name.includes('rachel') && name.includes('fox');
  });
  
  if (!rachelFoxLead) {
    console.log('❌ Rachel Fox not found in loaded leads');
    process.exit(1);
  }
  
  console.log(`✅ Found Rachel Fox: ${normalizeName(rachelFoxLead.fullName || rachelFoxLead.name || 'Unknown')}`);
  console.log(`   Location: ${rachelFoxLead.geoRegion || rachelFoxLead.location || 'N/A'}\n`);
  
  // Convert to ParsedData format - ONLY Rachel Fox
  const parsedData = convertLeadsToParsedData([rachelFoxLead]);
  console.log(`📊 Prepared Rachel Fox for enrichment\n`);
  
  console.log('🔄 Starting enrichment with OPTIMIZED PIPELINE...');
  console.log('   Pipeline: LinkedIn → ZIP (free) → Phone → Telnyx → Gatekeep → Age\n');
  
  // Enrich only Rachel Fox
  const enriched = await enrichData(parsedData, (current, total) => {
    console.log(`  Progress: ${current}/${total} (${Math.round((current/total)*100)}%)`);
  });
  
  console.log(`\n✅ Enrichment completed\n`);
  
  // Extract lead summary
  const summary = extractLeadSummary(enriched.rows[0], enriched.rows[0]._enriched);
  
  // Display results
  console.log('✅ RACHEL FOX ENRICHMENT RESULTS:');
  console.log('=====================================');
  console.log(`Name: ${summary.name}`);
  console.log(`Phone: ${summary.phone || '❌ MISSING'}`);
  console.log(`Age/DOB: ${summary.dobOrAge || '❌ MISSING'}`);
  console.log(`State: ${summary.state || '❌ MISSING'}`);
  console.log(`Zipcode: ${summary.zipcode || '❌ MISSING'}`);
  console.log(`City: ${summary.city || '❌ MISSING'}`);
  console.log(`Email: ${summary.email || 'N/A'}`);
  console.log(`Line Type: ${summary.lineType || 'N/A'}`);
  console.log(`Carrier: ${summary.carrier || 'N/A'}`);
  console.log(`DNC Status: ${summary.dncStatus || 'N/A'}`);
  console.log('=====================================\n');
  
  // Check if all required fields are present
  const hasPhone = summary.phone && summary.phone.trim().length >= 10;
  const hasAge = summary.dobOrAge && summary.dobOrAge.trim().length > 0;
  const hasState = summary.state && summary.state.trim().length > 0;
  const hasZip = summary.zipcode && summary.zipcode.trim().length > 0;
  
  console.log('Required Fields Status:');
  console.log(`  ✅ Phone: ${hasPhone ? 'PRESENT' : '❌ MISSING'}`);
  console.log(`  ✅ Age: ${hasAge ? 'PRESENT' : '❌ MISSING'}`);
  console.log(`  ✅ State: ${hasState ? 'PRESENT' : '❌ MISSING'}`);
  console.log(`  ✅ Zipcode: ${hasZip ? 'PRESENT' : '❌ MISSING'}`);
  
  if (hasPhone && hasAge && hasState && hasZip) {
    console.log('\n🎉 SUCCESS: Rachel Fox has all required fields!\n');
  } else {
    console.log('\n⚠️  WARNING: Rachel Fox is missing some required fields\n');
  }
  
  // Save result
  const outputPath = path.join(process.cwd(), 'data', 'rachel-fox-enriched.json');
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
  console.log(`💾 Saved Rachel Fox enrichment result to: ${outputPath}`);
  
  console.log('\n✅ Test complete!');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
