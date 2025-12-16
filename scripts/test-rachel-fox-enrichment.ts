/**
 * Test enrichment for Rachel Fox specifically
 * Then enrich all 322 leads
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
      console.log(`  📄 ${file}: ${leads.length} leads`);
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
  console.log('🚀 Starting enrichment process...\n');
  
  // Load all leads
  console.log('📥 Loading leads from saved files...');
  const allLeads = loadLeadsFromFiles();
  
  if (allLeads.length === 0) {
    console.log('❌ No leads found to enrich');
    process.exit(1);
  }
  
  console.log(`✅ Loaded ${allLeads.length} raw leads\n`);
  
  // Deduplicate leads to get unique set
  console.log('🔍 Deduplicating leads...');
  const seen = new Set<string>();
  const uniqueLeads = allLeads.filter((lead: any) => {
    const key = (lead.navigationUrl || lead.linkedin_url || lead.profile_url || lead.url || 
                lead.fullName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim()).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  console.log(`✅ Found ${uniqueLeads.length} unique leads after deduplication\n`);
  
  // Limit to 322 leads if we have more
  const leadsToEnrich = uniqueLeads.length > 322 ? uniqueLeads.slice(0, 322) : uniqueLeads;
  console.log(`📊 Processing ${leadsToEnrich.length} leads for enrichment\n`);
  
  // Find Rachel Fox for verification
  console.log('🔍 Searching for Rachel Fox...');
  const rachelFoxLead = leadsToEnrich.find((lead: any) => {
    const name = normalizeName(lead.fullName || lead.name || '').toLowerCase();
    return name.includes('rachel') && name.includes('fox');
  });
  
  if (rachelFoxLead) {
    console.log(`✅ Found Rachel Fox: ${normalizeName(rachelFoxLead.fullName || rachelFoxLead.name || 'Unknown')}`);
    console.log(`   Location: ${rachelFoxLead.geoRegion || rachelFoxLead.location || 'N/A'}\n`);
  } else {
    console.log('⚠️  Rachel Fox not found in leads to enrich (will search after enrichment)\n');
  }
  
  // Convert to ParsedData format
  const parsedData = convertLeadsToParsedData(leadsToEnrich);
  console.log(`📊 Converted ${parsedData.rows.length} leads to enrichment format\n`);
  
  console.log('🔄 Starting enrichment with OPTIMIZED PIPELINE...');
  console.log('   Pipeline: LinkedIn → ZIP (free) → Phone → Telnyx → Gatekeep → Age');
  console.log(`   Processing ${parsedData.rows.length} leads...\n`);
  
  // Track enriched rows for incremental saving
  const enrichedRows: EnrichedRow[] = [];
  
  // Enrich all leads with incremental saving
  const enriched = await enrichData(parsedData, async (current, total) => {
    if (current % 10 === 0 || current === total) {
      console.log(`  Progress: ${current}/${total} (${Math.round((current/total)*100)}%)`);
    }
  }, async (progress: any) => {
    // Save partial results every 5 leads so data is visible immediately
    if (progress.current % 5 === 0 && progress.current > 0) {
      // We need to get the current enriched rows - this is a limitation, but we'll save after each batch
      // For now, save what we have after enrichment completes
    }
  });
  
  // Save incremental results after enrichment
  // Extract summaries from what we have so far
  const partialSummaries: LeadSummary[] = enriched.rows.map((row: EnrichedRow) => 
    extractLeadSummary(row, row._enriched)
  );
  
  // Save partial results immediately so they're visible
  const partialOutputPath = path.join(process.cwd(), 'data', 'enriched-322-leads-partial.json');
  fs.writeFileSync(partialOutputPath, JSON.stringify(partialSummaries, null, 2));
  console.log(`  💾 Saved ${partialSummaries.length} partial results to: ${partialOutputPath}`);
  
  console.log(`\n✅ Enrichment completed\n`);
  
  // Extract lead summaries
  const summaries: LeadSummary[] = enriched.rows.map((row: EnrichedRow) => 
    extractLeadSummary(row, row._enriched)
  );
  
  // Find Rachel Fox in enriched results
  const rachelFoxEnriched = summaries.find((summary: LeadSummary) => {
    const name = (summary.name || '').toLowerCase();
    return name.includes('rachel') && name.includes('fox');
  });
  
  if (rachelFoxEnriched) {
    console.log('✅ RACHEL FOX ENRICHMENT RESULTS:');
    console.log('=====================================');
    console.log(`Name: ${rachelFoxEnriched.name}`);
    console.log(`Phone: ${rachelFoxEnriched.phone || '❌ MISSING'}`);
    console.log(`Age/DOB: ${rachelFoxEnriched.dobOrAge || '❌ MISSING'}`);
    console.log(`State: ${rachelFoxEnriched.state || '❌ MISSING'}`);
    console.log(`Zipcode: ${rachelFoxEnriched.zipcode || '❌ MISSING'}`);
    console.log(`City: ${rachelFoxEnriched.city || '❌ MISSING'}`);
    console.log(`Email: ${rachelFoxEnriched.email || 'N/A'}`);
    console.log(`Line Type: ${rachelFoxEnriched.lineType || 'N/A'}`);
    console.log(`Carrier: ${rachelFoxEnriched.carrier || 'N/A'}`);
    console.log(`DNC Status: ${rachelFoxEnriched.dncStatus || 'N/A'}`);
    console.log('=====================================\n');
    
    // Check if all required fields are present
    const hasPhone = rachelFoxEnriched.phone && rachelFoxEnriched.phone.trim().length >= 10;
    const hasAge = rachelFoxEnriched.dobOrAge && rachelFoxEnriched.dobOrAge.trim().length > 0;
    const hasState = rachelFoxEnriched.state && rachelFoxEnriched.state.trim().length > 0;
    const hasZip = rachelFoxEnriched.zipcode && rachelFoxEnriched.zipcode.trim().length > 0;
    
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
  } else {
    console.log('❌ Could not find Rachel Fox in enriched results');
  }
  
  // Save all enriched leads
  const outputPath = path.join(process.cwd(), 'data', 'enriched-322-leads.json');
  fs.writeFileSync(outputPath, JSON.stringify(summaries, null, 2));
  console.log(`💾 Saved ${summaries.length} enriched leads to: ${outputPath}`);
  
  // Summary statistics
  console.log('\n📊 ENRICHMENT SUMMARY:');
  console.log('======================');
  const stats = {
    total: summaries.length,
    withPhone: summaries.filter((l: LeadSummary) => l.phone && l.phone.trim().length >= 10).length,
    withAge: summaries.filter((l: LeadSummary) => l.dobOrAge && l.dobOrAge.trim().length > 0).length,
    withState: summaries.filter((l: LeadSummary) => l.state && l.state.trim().length > 0).length,
    withZip: summaries.filter((l: LeadSummary) => l.zipcode && l.zipcode.trim().length > 0).length,
    complete: summaries.filter((l: LeadSummary) => {
      const hasPhone = l.phone && l.phone.trim().length >= 10;
      const hasAge = l.dobOrAge && l.dobOrAge.trim().length > 0;
      const hasState = l.state && l.state.trim().length > 0;
      const hasZip = l.zipcode && l.zipcode.trim().length > 0;
      return hasPhone && hasAge && hasState && hasZip;
    }).length,
  };
  
  console.log(`Total Leads: ${stats.total}`);
  console.log(`With Phone: ${stats.withPhone} (${Math.round((stats.withPhone/stats.total)*100)}%)`);
  console.log(`With Age: ${stats.withAge} (${Math.round((stats.withAge/stats.total)*100)}%)`);
  console.log(`With State: ${stats.withState} (${Math.round((stats.withState/stats.total)*100)}%)`);
  console.log(`With Zipcode: ${stats.withZip} (${Math.round((stats.withZip/stats.total)*100)}%)`);
  console.log(`Complete (all 4 fields): ${stats.complete} (${Math.round((stats.complete/stats.total)*100)}%)`);
  console.log('======================\n');
  
  console.log('✅ Enrichment process complete!');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
