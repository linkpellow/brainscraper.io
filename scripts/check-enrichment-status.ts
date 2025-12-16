/**
 * Check if leads have already been enriched and what data they contain
 */

import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('🔍 Checking enrichment status...\n');
  
  // Check localStorage data (would need to be run in browser, but let's check saved files)
  const dataDir = path.join(process.cwd(), 'data');
  
  // Check for re-enriched leads
  const reEnrichedPath = path.join(dataDir, 're-enriched-leads.json');
  if (fs.existsSync(reEnrichedPath)) {
    console.log('📂 Found re-enriched-leads.json\n');
    const data = JSON.parse(fs.readFileSync(reEnrichedPath, 'utf-8'));
    
    if (Array.isArray(data) && data.length > 0) {
      console.log(`📊 Total leads: ${data.length}\n`);
      
      // Analyze enrichment status
      const withPhone = data.filter((l: any) => l.phone && l.phone !== '').length;
      const withEmail = data.filter((l: any) => l.email && l.email !== '').length;
      const withZip = data.filter((l: any) => l.zipcode && l.zipcode !== '').length;
      const withAge = data.filter((l: any) => l.dobOrAge && l.dobOrAge !== '').length;
      const withLineType = data.filter((l: any) => l.lineType && l.lineType !== '').length;
      const withCarrier = data.filter((l: any) => l.carrier && l.carrier !== '').length;
      
      console.log('📈 Enrichment Statistics:');
      console.log(`   Phone: ${withPhone}/${data.length} (${Math.round((withPhone/data.length)*100)}%)`);
      console.log(`   Email: ${withEmail}/${data.length} (${Math.round((withEmail/data.length)*100)}%)`);
      console.log(`   Zipcode: ${withZip}/${data.length} (${Math.round((withZip/data.length)*100)}%)`);
      console.log(`   Age/DOB: ${withAge}/${data.length} (${Math.round((withAge/data.length)*100)}%)`);
      console.log(`   Line Type: ${withLineType}/${data.length} (${Math.round((withLineType/data.length)*100)}%)`);
      console.log(`   Carrier: ${withCarrier}/${data.length} (${Math.round((withCarrier/data.length)*100)}%)\n`);
      
      // Check if enrichment was actually run
      const hasAnyEnrichment = withPhone > 0 || withEmail > 0 || withAge > 0 || withLineType > 0 || withCarrier > 0;
      
      if (hasAnyEnrichment) {
        console.log('✅ Leads HAVE been enriched (at least some have data)');
        console.log('⚠️  However, enrichment may be incomplete.\n');
        
        // Show sample of enriched vs unenriched
        const enrichedSample = data.find((l: any) => l.phone || l.email || l.lineType);
        const unenrichedSample = data.find((l: any) => !l.phone && !l.email && !l.lineType);
        
        if (enrichedSample) {
          console.log('📋 Sample ENRICHED lead:');
          console.log(`   Name: ${enrichedSample.name}`);
          console.log(`   Phone: ${enrichedSample.phone || 'N/A'}`);
          console.log(`   Email: ${enrichedSample.email || 'N/A'}`);
          console.log(`   Line Type: ${enrichedSample.lineType || 'N/A'}`);
          console.log(`   Carrier: ${enrichedSample.carrier || 'N/A'}\n`);
        }
        
        if (unenrichedSample) {
          console.log('📋 Sample UNENRICHED lead:');
          console.log(`   Name: ${unenrichedSample.name}`);
          console.log(`   Phone: ${unenrichedSample.phone || 'N/A'}`);
          console.log(`   Email: ${unenrichedSample.email || 'N/A'}`);
          console.log(`   Line Type: ${unenrichedSample.lineType || 'N/A'}\n`);
        }
      } else {
        console.log('❌ Leads have NOT been enriched (all fields are empty/N/A)');
        console.log('   You need to run enrichment.\n');
      }
    }
  } else {
    console.log('❌ No re-enriched-leads.json found');
    console.log('   Leads have not been enriched via script.\n');
  }
  
  // Check if there are saved API results that could be enriched
  const resultsDir = path.join(dataDir, 'api-results');
  if (fs.existsSync(resultsDir)) {
    const files = fs.readdirSync(resultsDir)
      .filter(f => f.endsWith('.json') && f.startsWith('20'));
    console.log(`📂 Found ${files.length} saved API result files`);
    console.log('   These can be enriched using "Migrate All Saved Leads" button\n');
  }
  
  console.log('💡 To check browser localStorage:');
  console.log('   1. Open browser console');
  console.log('   2. Run: JSON.parse(localStorage.getItem("enrichedLeads") || "[]").length');
  console.log('   3. This will show how many leads are in localStorage\n');
}

main().catch(console.error);
