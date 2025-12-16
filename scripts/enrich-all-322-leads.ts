/**
 * Enrich all 322 leads via the API endpoint
 * Tests with Rachel Fox first, then enriches all leads
 */

import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('🚀 Starting enrichment of all 322 leads...\n');
  
  // Step 1: Load all leads from the migrate-saved-leads endpoint
  console.log('📥 Step 1: Loading and enriching all leads from saved files...');
  const migrateResponse = await fetch('http://localhost:3000/api/migrate-saved-leads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!migrateResponse.ok) {
    console.error('❌ Failed to migrate leads:', migrateResponse.statusText);
    const errorText = await migrateResponse.text();
    console.error('Error details:', errorText);
    process.exit(1);
  }
  
  const migrateData = await migrateResponse.json();
  const allLeads = migrateData.enrichedLeads || [];
  
  console.log(`✅ Loaded ${allLeads.length} leads\n`);
  
  if (allLeads.length === 0) {
    console.log('❌ No leads found to enrich');
    process.exit(1);
  }
  
  // Step 2: Find Rachel Fox for testing
  console.log('🔍 Step 2: Finding Rachel Fox for verification...');
  const rachelFox = allLeads.find((lead: any) => 
    lead.name && lead.name.toLowerCase().includes('rachel') && lead.name.toLowerCase().includes('fox')
  );
  
  if (rachelFox) {
    console.log(`✅ Found Rachel Fox:`, {
      name: rachelFox.name,
      phone: rachelFox.phone || 'MISSING',
      age: rachelFox.dobOrAge || 'MISSING',
      state: rachelFox.state || 'MISSING',
      zipcode: rachelFox.zipcode || 'MISSING',
      city: rachelFox.city || 'MISSING',
    });
    console.log('');
  } else {
    console.log('⚠️  Rachel Fox not found in initial leads. Will search after enrichment.\n');
  }
  
  // Step 3: Re-enrich all leads to ensure they have phone, age, state, zip
  console.log('🔄 Step 3: Re-enriching all leads to ensure complete data...');
  console.log(`   Processing ${allLeads.length} leads...\n`);
  
  const reEnrichResponse = await fetch('http://localhost:3000/api/re-enrich-leads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      leads: allLeads,
    }),
  });
  
  if (!reEnrichResponse.ok) {
    console.error('❌ Failed to re-enrich leads:', reEnrichResponse.statusText);
    const errorText = await reEnrichResponse.text();
    console.error('Error details:', errorText);
    process.exit(1);
  }
  
  const reEnrichData = await reEnrichResponse.json();
  const enrichedLeads = reEnrichData.enrichedLeads || [];
  
  console.log(`✅ Re-enrichment complete: ${enrichedLeads.length} leads processed\n`);
  
  // Step 4: Find and display Rachel Fox results
  console.log('🔍 Step 4: Verifying Rachel Fox enrichment results...');
  const rachelFoxEnriched = enrichedLeads.find((lead: any) => 
    lead.name && lead.name.toLowerCase().includes('rachel') && lead.name.toLowerCase().includes('fox')
  );
  
  if (rachelFoxEnriched) {
    console.log('\n✅ RACHEL FOX ENRICHMENT RESULTS:');
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
    console.log('❌ Rachel Fox not found after enrichment. Searching for similar names...');
    const similarLeads = enrichedLeads.filter((lead: any) => 
      lead.name && (lead.name.toLowerCase().includes('rachel') || lead.name.toLowerCase().includes('fox'))
    );
    if (similarLeads.length > 0) {
      console.log(`Found ${similarLeads.length} similar leads:`);
      similarLeads.slice(0, 5).forEach((lead: any) => {
        console.log(`  - ${lead.name}`);
      });
    }
  }
  
  // Step 5: Save enriched leads to file
  const outputPath = path.join(process.cwd(), 'data', 'enriched-322-leads.json');
  fs.writeFileSync(outputPath, JSON.stringify(enrichedLeads, null, 2));
  console.log(`\n💾 Saved ${enrichedLeads.length} enriched leads to: ${outputPath}`);
  
  // Step 6: Summary statistics
  console.log('\n📊 ENRICHMENT SUMMARY:');
  console.log('======================');
  const stats = {
    total: enrichedLeads.length,
    withPhone: enrichedLeads.filter((l: any) => l.phone && l.phone.trim().length >= 10).length,
    withAge: enrichedLeads.filter((l: any) => l.dobOrAge && l.dobOrAge.trim().length > 0).length,
    withState: enrichedLeads.filter((l: any) => l.state && l.state.trim().length > 0).length,
    withZip: enrichedLeads.filter((l: any) => l.zipcode && l.zipcode.trim().length > 0).length,
    complete: enrichedLeads.filter((l: any) => {
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
