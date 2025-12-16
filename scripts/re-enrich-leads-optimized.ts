/**
 * Re-enrich existing leads with the optimized pipeline
 * Loads leads from localStorage (via API) or saved files and re-enriches them
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
  
  const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.json'));
  console.log(`📁 Found ${files.length} result files`);
  
  for (const file of files) {
    try {
      const filePath = path.join(resultsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      // Handle various response structures
      let leads: any[] = [];
      
      if (Array.isArray(data)) {
        leads = data;
      } else if (data.data && Array.isArray(data.data)) {
        leads = data.data;
      } else if (data.response && data.response.data && Array.isArray(data.response.data)) {
        leads = data.response.data;
      } else if (data.results && Array.isArray(data.results)) {
        leads = data.results;
      } else if (data.leads && Array.isArray(data.leads)) {
        leads = data.leads;
      }
      
      // Add search params if available
      leads.forEach(lead => {
        if (data._searchParams) {
          lead._searchParams = data._searchParams;
        }
      });
      
      allLeads.push(...leads);
    } catch (error) {
      console.error(`Error reading ${file}:`, error);
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
      'First Name': nameParts[0] || lead.first_name || '',
      'Last Name': nameParts.slice(1).join(' ') || lead.last_name || '',
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

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting optimized re-enrichment process...\n');
  
  // Load leads from saved files
  console.log('📂 Loading leads from saved API results...');
  const rawLeads = loadLeadsFromFiles();
  
  if (rawLeads.length === 0) {
    console.log('❌ No leads found in saved files');
    return;
  }
  
  console.log(`✅ Loaded ${rawLeads.length} raw leads\n`);
  
  // Deduplicate leads
  const seen = new Set<string>();
  const uniqueLeads = rawLeads.filter(lead => {
    const key = `${lead.fullName || lead.name || ''}-${lead.email || ''}-${lead.phone || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  console.log(`🔍 Deduplicated: ${uniqueLeads.length} unique leads\n`);
  
  // Convert to ParsedData format
  console.log('🔄 Converting to ParsedData format...');
  const parsedData = convertLeadsToParsedData(uniqueLeads);
  console.log(`✅ Converted ${parsedData.rowCount} leads\n`);
  
  // Enrich with optimized pipeline
  console.log('✨ Starting enrichment with OPTIMIZED PIPELINE...');
  console.log('   Pipeline: LinkedIn → ZIP (free) → Phone → Telnyx → Gatekeep → Age\n');
  
  const enriched = await enrichData(parsedData, (current, total) => {
    if (current % 10 === 0 || current === total) {
      console.log(`   Progress: ${current}/${total} (${Math.round((current/total)*100)}%)`);
    }
  });
  
  console.log(`\n✅ Enrichment complete!\n`);
  
  // Extract lead summaries
  console.log('📊 Extracting lead summaries...');
  const summaries: LeadSummary[] = enriched.rows.map((row: EnrichedRow) => 
    extractLeadSummary(row, row._enriched)
  );
  
  console.log(`✅ Extracted ${summaries.length} summaries\n`);
  
  // Save to file
  const outputPath = path.join(process.cwd(), 'data', 're-enriched-leads.json');
  fs.writeFileSync(outputPath, JSON.stringify(summaries, null, 2));
  console.log(`💾 Saved to: ${outputPath}\n`);
  
  // Print summary
  console.log('📋 Enrichment Summary:');
  console.log(`   Total leads processed: ${summaries.length}`);
  console.log(`   Leads with phone: ${summaries.filter(s => s.phone).length}`);
  console.log(`   Leads with age: ${summaries.filter(s => s.dobOrAge).length}`);
  console.log(`   Leads with zipcode: ${summaries.filter(s => s.zipcode).length}`);
  console.log(`   Leads with line type: ${summaries.filter(s => s.lineType).length}`);
  console.log(`   Leads with carrier: ${summaries.filter(s => s.carrier).length}`);
  console.log(`   Leads with address: ${summaries.filter(s => s.address).length}\n`);
  
  console.log('✅ Re-enrichment complete!');
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { main as reEnrichLeadsOptimized };
