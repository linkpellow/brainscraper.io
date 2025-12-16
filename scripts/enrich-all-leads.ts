/**
 * Enrich all leads from saved sources
 * Loads leads from localStorage (via API) or saved files and enriches them all
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
      } else if (data.processedResults && Array.isArray(data.processedResults)) {
        leads = data.processedResults;
      }
      
      console.log(`  📄 ${file}: ${leads.length} leads`);
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
  // Remove common credentials (MBA, MD, PhD, etc.)
  return name.replace(/,\s*(MBA|MD|PhD|CPA|JD|DDS|DMD|RN|LPN|BSN|MSN|DNP|PA|NP|DO|DC|OD|DVM|PharmD|RPh|CFA|CFP|CPA|PMP|SHRM-CP|PHR|SPHR|CCNA|PMP|CSM|PMP|ITIL|Six Sigma|Lean|Agile|SAFe|Scrum Master|Product Owner|Project Manager).*$/i, '').trim();
}

async function main() {
  console.log('🚀 Starting enrichment of all leads...\n');
  
  // Load leads from files
  const leads = loadLeadsFromFiles();
  
  if (leads.length === 0) {
    console.log('❌ No leads found to enrich');
    console.log('💡 Make sure you have saved leads in data/api-results/');
    process.exit(1);
  }
  
  console.log(`\n✅ Found ${leads.length} leads to enrich\n`);
  
  // Convert to ParsedData format
  const headers = [
    'Name', 'Title', 'Company', 'Location', 'LinkedIn URL', 
    'Email', 'Phone', 'First Name', 'Last Name', 'City', 'State', 'Zip', 'Search Filter'
  ];
  
  const rows = leads.map((lead: any) => {
    const rawFullName = lead.fullName || lead.name || lead.firstName + ' ' + lead.lastName || '';
    const fullName = normalizeName(rawFullName);
    const nameParts = fullName ? fullName.split(' ') : ['', ''];
    
    const locationFull = lead.geoRegion || lead.location || lead.currentLocation || '';
    const locationParts = locationFull ? locationFull.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0) : [];
    const city = locationParts.length >= 3 ? locationParts[0] : locationParts.length === 2 ? '' : locationParts[0] || '';
    const state = locationParts.length >= 2 ? locationParts[locationParts.length - 2] : '';
    
    return {
      'Name': fullName || '',
      'Title': lead.currentPosition?.title || lead.title || lead.job_title || lead.headline || '',
      'Company': lead.currentPosition?.companyName || lead.company || lead.company_name || lead.currentCompany || '',
      'Location': locationFull,
      'LinkedIn URL': lead.navigationUrl || lead.linkedin_url || lead.profile_url || lead.url || '',
      'Email': lead.email || '',
      'Phone': lead.phone || lead.phone_number || '',
      'First Name': nameParts[0] || '',
      'Last Name': nameParts.slice(1).join(' ') || '',
      'City': city,
      'State': state,
      'Zip': '',
      'Search Filter': lead._searchParams?.keywords || 'Bulk Enrichment',
    };
  });
  
  const parsedData = {
    headers,
    rows,
    rowCount: rows.length,
    columnCount: headers.length,
  };
  
  console.log(`📊 Prepared ${rows.length} rows for enrichment\n`);
  console.log('⏳ Starting enrichment process...\n');
  
  const startTime = Date.now();
  let currentProgress = 0;
  
  try {
    const enriched = await enrichData(parsedData, (current, total) => {
      currentProgress = current;
      const percent = Math.round((current / total) * 100);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r📈 Progress: ${current}/${total} (${percent}%) - ${elapsed}s`);
    }, (detailedProgress) => {
      // Real-time detailed progress
      console.log(`\n✨ ${detailedProgress.leadName} - ${detailedProgress.step}:`, {
        firstName: detailedProgress.stepDetails?.firstName,
        lastName: detailedProgress.stepDetails?.lastName,
        city: detailedProgress.stepDetails?.city,
        state: detailedProgress.stepDetails?.state,
        zipCode: detailedProgress.stepDetails?.zipCode,
        phone: detailedProgress.stepDetails?.phone,
        email: detailedProgress.stepDetails?.email,
        lineType: detailedProgress.stepDetails?.lineType,
        carrier: detailedProgress.stepDetails?.carrier,
        age: detailedProgress.stepDetails?.age,
      });
      if (detailedProgress.errors && detailedProgress.errors.length > 0) {
        console.warn(`  ⚠️  Errors:`, detailedProgress.errors);
      }
    });
    
    console.log(`\n\n✅ Enrichment complete!`);
    console.log(`⏱️  Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    
    // Extract summaries
    const summaries: LeadSummary[] = enriched.rows.map((row: EnrichedRow) => 
      extractLeadSummary(row, row._enriched)
    );
    
    // Save results
    const outputPath = path.join(process.cwd(), 'data', 'enriched-all-leads.json');
    fs.writeFileSync(outputPath, JSON.stringify({
      metadata: {
        enrichedAt: new Date().toISOString(),
        totalLeads: summaries.length,
        enrichmentTime: Date.now() - startTime,
      },
      leads: summaries,
      enrichedRows: enriched.rows,
    }, null, 2));
    
    console.log(`\n💾 Saved results to: ${outputPath}`);
    console.log(`\n📊 Summary:`);
    console.log(`  Total leads: ${summaries.length}`);
    console.log(`  With phone: ${summaries.filter(s => s.phone).length}`);
    console.log(`  With email: ${summaries.filter(s => s.email).length}`);
    console.log(`  With zipcode: ${summaries.filter(s => s.zipcode).length}`);
    console.log(`  With age: ${summaries.filter(s => s.dobOrAge).length}`);
    console.log(`  With lineType: ${summaries.filter(s => s.lineType).length}`);
    console.log(`  With carrier: ${summaries.filter(s => s.carrier).length}`);
    
  } catch (error) {
    console.error('\n❌ Enrichment failed:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

main();

