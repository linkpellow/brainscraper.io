/**
 * Enrich 322 leads with incremental saving
 * Saves results every 5 leads so data is visible immediately
 * Skips failed leads and continues
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
  console.log('🚀 Starting incremental enrichment of 322 leads...\n');
  
  // Load all leads
  console.log('📥 Loading leads from saved files...');
  const allLeads = loadLeadsFromFiles();
  
  if (allLeads.length === 0) {
    console.log('❌ No leads found to enrich');
    process.exit(1);
  }
  
  console.log(`✅ Loaded ${allLeads.length} raw leads\n`);
  
  // Deduplicate leads
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
  
  // Limit to 322 leads
  const leadsToEnrich = uniqueLeads.length > 322 ? uniqueLeads.slice(0, 322) : uniqueLeads;
  console.log(`📊 Processing ${leadsToEnrich.length} leads for enrichment\n`);
  
  // Convert to ParsedData format
  const parsedData = convertLeadsToParsedData(leadsToEnrich);
  console.log(`📊 Converted ${parsedData.rows.length} leads to enrichment format\n`);
  
  // Load existing partial results if any
  const partialPath = path.join(process.cwd(), 'data', 'enriched-322-leads-partial.json');
  let existingSummaries: LeadSummary[] = [];
  if (fs.existsSync(partialPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(partialPath, 'utf-8'));
      if (Array.isArray(existing)) {
        existingSummaries = existing;
        console.log(`📂 Loaded ${existingSummaries.length} existing partial results\n`);
      }
    } catch (error) {
      console.log('⚠️  Could not load existing partial results, starting fresh\n');
    }
  }
  
  console.log('🔄 Starting enrichment with OPTIMIZED PIPELINE...');
  console.log('   Pipeline: LinkedIn → ZIP (free) → Phone → Telnyx → Gatekeep → Age');
  console.log(`   Processing ${parsedData.rows.length} leads...`);
  console.log('   ⚠️  Rate limit: 0.5 req/sec (2 seconds between requests) to avoid 429 errors\n');
  
  // Track enriched rows for incremental saving
  const allEnrichedRows: EnrichedRow[] = [];
  let processedCount = 0;
  let successCount = 0;
  let errorCount = 0;
  
  // Process leads in batches to save incrementally
  const BATCH_SIZE = 5;
  
  for (let i = 0; i < parsedData.rows.length; i += BATCH_SIZE) {
    const batch = parsedData.rows.slice(i, Math.min(i + BATCH_SIZE, parsedData.rows.length));
    const batchData = {
      ...parsedData,
      rows: batch,
      rowCount: batch.length,
    };
    
    try {
      console.log(`\n📦 Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(parsedData.rows.length/BATCH_SIZE)} (leads ${i + 1}-${Math.min(i + BATCH_SIZE, parsedData.rows.length)})...`);
      
      const enriched = await enrichData(batchData, (current, total) => {
        processedCount++;
        if (current === total) {
          console.log(`  ✅ Batch complete: ${current}/${total} leads`);
        }
      });
      
      // Extract summaries from this batch
      const batchSummaries: LeadSummary[] = enriched.rows.map((row: EnrichedRow) => 
        extractLeadSummary(row, row._enriched)
      );
      
      allEnrichedRows.push(...enriched.rows);
      successCount += batchSummaries.length;
      
      // Merge with existing summaries (update if exists, add if new)
      const existingKeys = new Set(existingSummaries.map(s => s.name?.toLowerCase()));
      batchSummaries.forEach(summary => {
        const key = summary.name?.toLowerCase();
        if (key) {
          const existingIndex = existingSummaries.findIndex(s => s.name?.toLowerCase() === key);
          if (existingIndex >= 0) {
            // Update existing
            existingSummaries[existingIndex] = summary;
          } else {
            // Add new
            existingSummaries.push(summary);
          }
        }
      });
      
      // Save incremental results immediately
      const outputPath = path.join(process.cwd(), 'data', 'enriched-322-leads.json');
      fs.writeFileSync(outputPath, JSON.stringify(existingSummaries, null, 2));
      fs.writeFileSync(partialPath, JSON.stringify(existingSummaries, null, 2));
      
      console.log(`  💾 Saved ${existingSummaries.length} total results (${batchSummaries.length} from this batch)`);
      console.log(`  📊 Progress: ${Math.min(i + BATCH_SIZE, parsedData.rows.length)}/${parsedData.rows.length} (${Math.round((Math.min(i + BATCH_SIZE, parsedData.rows.length)/parsedData.rows.length)*100)}%)`);
      
      // Show stats for this batch
      const batchWithPhone = batchSummaries.filter(s => s.phone && s.phone.trim().length >= 10).length;
      const batchWithAge = batchSummaries.filter(s => s.dobOrAge && s.dobOrAge.trim().length > 0).length;
      const batchWithState = batchSummaries.filter(s => s.state && s.state.trim().length > 0).length;
      const batchWithZip = batchSummaries.filter(s => s.zipcode && s.zipcode.trim().length > 0).length;
      
      console.log(`  📈 Batch stats: Phone: ${batchWithPhone}/${batch.length}, Age: ${batchWithAge}/${batch.length}, State: ${batchWithState}/${batch.length}, Zip: ${batchWithZip}/${batch.length}`);
      
    } catch (error) {
      errorCount += batch.length;
      console.error(`  ❌ Batch failed:`, error instanceof Error ? error.message : String(error));
      console.log(`  ⏭️  Continuing with next batch...`);
      // Continue processing even if batch fails
    }
    
    // Small delay between batches
    if (i + BATCH_SIZE < parsedData.rows.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`\n✅ Enrichment process completed\n`);
  
  // Final summary
  const finalSummaries = existingSummaries.length > 0 ? existingSummaries : 
    allEnrichedRows.map((row: EnrichedRow) => extractLeadSummary(row, row._enriched));
  
  // Find Rachel Fox
  const rachelFoxEnriched = finalSummaries.find((summary: LeadSummary) => {
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
    console.log('=====================================\n');
  }
  
  // Save final results
  const outputPath = path.join(process.cwd(), 'data', 'enriched-322-leads.json');
  fs.writeFileSync(outputPath, JSON.stringify(finalSummaries, null, 2));
  console.log(`💾 Saved ${finalSummaries.length} enriched leads to: ${outputPath}`);
  
  // Summary statistics
  console.log('\n📊 FINAL ENRICHMENT SUMMARY:');
  console.log('======================');
  const stats = {
    total: finalSummaries.length,
    withPhone: finalSummaries.filter((l: LeadSummary) => l.phone && l.phone.trim().length >= 10).length,
    withAge: finalSummaries.filter((l: LeadSummary) => l.dobOrAge && l.dobOrAge.trim().length > 0).length,
    withState: finalSummaries.filter((l: LeadSummary) => l.state && l.state.trim().length > 0).length,
    withZip: finalSummaries.filter((l: LeadSummary) => l.zipcode && l.zipcode.trim().length > 0).length,
    complete: finalSummaries.filter((l: LeadSummary) => {
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
  console.log(`Success: ${successCount}, Errors: ${errorCount}`);
  console.log('======================\n');
  
  console.log('✅ Enrichment process complete!');
  console.log(`📁 Results saved to: ${outputPath}`);
  console.log(`💡 Partial results also saved to: ${partialPath}`);
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
