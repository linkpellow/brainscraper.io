/**
 * Test Production Pipeline with Minimal API Calls
 * Uses real data from database to verify pipeline works correctly
 */

import { enrichRow } from '../utils/enrichData';
import { getDataFilePath, safeReadFile } from '../utils/dataDirectory';

function getDataDirectory(): string {
  // Use production DATA_DIR if set, otherwise local data directory
  if (process.env.DATA_DIR) {
    return process.env.DATA_DIR;
  }
  return getDataFilePath('');
}

function loadRealLeads(): any[] {
  const filePath = getDataFilePath('enriched-all-leads.json');
  const content = safeReadFile(filePath);
  
  if (!content) {
    console.error('❌ No enriched-all-leads.json file found');
    return [];
  }
  
  try {
    const data = JSON.parse(content);
    let leads: any[] = [];
    if (Array.isArray(data)) {
      leads = data;
    } else if (data && typeof data === 'object' && Array.isArray(data.leads)) {
      leads = data.leads;
    } else {
      console.error('❌ Invalid data structure in enriched-all-leads.json');
      return [];
    }
    
    console.log(`📁 Loaded ${leads.length} total leads from database`);
    const validLeads = leads.filter((lead: any) => {
      const name = (lead.name || '').trim();
      return name.length > 0;
    });
    console.log(`✅ Found ${validLeads.length} valid leads with names`);
    return validLeads.slice(0, 1); // Only test 1 lead to minimize API calls
  } catch (error) {
    console.error('❌ Error parsing enriched-all-leads.json:', error);
    return [];
  }
}

function createTestRowFromLead(lead: any): { row: string[]; headers: string[] } {
  // Create a test row from an existing enriched lead
  // This simulates what would come from LinkedIn scraping
  const headers = ['Name', 'Title', 'Company', 'Location', 'LinkedIn URL', 'Email', 'Phone'];
  const row = [
    lead.name || '',
    lead.title || lead.jobTitle || '',
    lead.company || '',
    lead.city && lead.state ? `${lead.city}, ${lead.state}` : lead.location || '',
    lead.linkedinUrl || '',
    lead.email || '',
    lead.phone || ''
  ];
  
  return { row, headers };
}

async function testPipeline() {
  console.log('🧪 Testing Production Pipeline with Minimal API Calls...\n');
  
  // Load 1 real lead from database
  const leads = loadRealLeads();
  if (leads.length === 0) {
    console.error('❌ No leads found in database to test');
    process.exit(1);
  }
  
  const testLead = leads[0];
  console.log(`📋 Testing with lead: ${testLead.name}`);
  console.log(`   Location: ${testLead.city || ''}, ${testLead.state || ''}`);
  console.log(`   Phone: ${testLead.phone || 'N/A'}`);
  console.log(`   Email: ${testLead.email || 'N/A'}\n`);
  
  // Create test row
  const { row, headers } = createTestRowFromLead(testLead);
  
  console.log('🔄 Starting enrichment pipeline...\n');
  
  try {
    // enrichRow signature: enrichRow(row, headers, onProgress?, enabledStations?)
    const onProgress = (step: string, stepDetails?: any, errors?: string[]) => {
      console.log(`   Step: ${step}`);
      if (errors && errors.length > 0) {
        console.log(`   Errors: ${errors.join(', ')}`);
      }
    };
    
    const result = await enrichRow(
      row.reduce((acc, val, idx) => ({ ...acc, [headers[idx]]: val }), {}),
      headers,
      onProgress,
      new Set(['skip-tracing', 'dnc-check', 'telnyx', 'gatekeep'])
    );
    
    console.log('\n✅ Enrichment completed!');
    console.log('\n📊 Results:');
    console.log(`   Name: ${result.name || 'N/A'}`);
    console.log(`   Phone: ${result.phone || 'N/A'}`);
    console.log(`   Email: ${result.email || 'N/A'}`);
    console.log(`   City: ${result.city || 'N/A'}`);
    console.log(`   State: ${result.state || 'N/A'}`);
    console.log(`   ZIP: ${result.zipcode || 'N/A'}`);
    console.log(`   Age: ${result.age || 'N/A'}`);
    console.log(`   Income: ${result.income || 'N/A'}`);
    console.log(`   DNC Status: ${result.dncStatus || 'N/A'}`);
    console.log(`   Line Type: ${result.lineType || 'N/A'}`);
    
    if (result.phone) {
      console.log('\n✅ Phone number extracted successfully');
    } else {
      console.log('\n⚠️  No phone number found');
    }
    
    if (result.dncStatus === 'YES') {
      console.log('⚠️  Lead marked as DNC');
    } else {
      console.log('✅ Lead can be contacted');
    }
    
    console.log('\n✅ Pipeline test PASSED');
    return true;
  } catch (error) {
    console.error('\n❌ Pipeline test FAILED:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('Stack:', error.stack);
    }
    return false;
  }
}

// Run the test
(async () => {
  const passed = await testPipeline();
  process.exit(passed ? 0 : 1);
})();
