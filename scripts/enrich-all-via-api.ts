/**
 * Enrich all leads via the API endpoint
 * Uses the /api/re-enrich-leads endpoint to enrich all saved leads
 */

import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('🚀 Starting bulk enrichment of all saved leads...\n');
  
  // Load all leads from the API
  console.log('📥 Loading leads from API...');
  const loadResponse = await fetch('http://localhost:3000/api/load-saved-leads');
  
  if (!loadResponse.ok) {
    console.error('❌ Failed to load leads:', loadResponse.statusText);
    process.exit(1);
  }
  
  const loadData = await loadResponse.json();
  const leads = loadData.leads || [];
  
  if (leads.length === 0) {
    console.log('❌ No leads found to enrich');
    process.exit(1);
  }
  
  console.log(`✅ Found ${leads.length} leads to enrich\n`);
  
  // Convert leads to LeadSummary format expected by API
  const leadSummaries = leads.map((lead: any) => {
    const name = lead.fullName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unknown';
    
    // Extract location from geoRegion or location field
    let location = lead.geoRegion || lead.location || lead.currentPosition?.companyUrnResolutionResult?.location || '';
    
    // Parse location (format: "City, State, Country" or "State, Country")
    const locationParts = location ? location.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0) : [];
    let city = '';
    let state = '';
    
    if (locationParts.length >= 3) {
      // "City, State, Country"
      city = locationParts[0];
      state = locationParts[1];
    } else if (locationParts.length === 2) {
      // Could be "State, Country" or "City, State"
      // If second part is "United States", treat first as state
      if (locationParts[1].toLowerCase().includes('united states')) {
        state = locationParts[0];
      } else {
        city = locationParts[0];
        state = locationParts[1];
      }
    } else if (locationParts.length === 1) {
      state = locationParts[0];
    }
    
    // Normalize empty strings
    const email = lead.email && lead.email !== 'EMPTY' && lead.email !== 'N/A' ? lead.email : '';
    const phone = lead.phone && lead.phone !== 'EMPTY' && lead.phone !== 'N/A' ? lead.phone : '';
    
    return {
      name,
      email,
      phone,
      city,
      state,
      zipcode: '',
      searchFilter: lead._searchParams?.keywords || 'Bulk Enrichment',
    };
  });
  
  console.log(`✅ Converted ${leadSummaries.length} leads to LeadSummary format\n`);
  
  // Process in smaller batches to show progress faster
  const BATCH_SIZE = 5; // Smaller batches = faster feedback
  const batches = [];
  for (let i = 0; i < leadSummaries.length; i += BATCH_SIZE) {
    batches.push(leadSummaries.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`📦 Processing in ${batches.length} batches of ${BATCH_SIZE} leads`);
  console.log(`⏱️  Estimated time: ~${Math.ceil(batches.length * 15)} seconds (with rate limiting)\n`);
  
  const allEnrichedLeads: any[] = [];
  let successCount = 0;
  let errorCount = 0;
  
  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    console.log(`\n🔄 Batch ${batchIdx + 1}/${batches.length} (${batch.length} leads)...`);
    
    try {
      console.log(`  📤 Sending batch ${batchIdx + 1} to API...`);
      const startTime = Date.now();
      
      const enrichResponse = await fetch('http://localhost:3000/api/re-enrich-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: batch }),
        signal: AbortSignal.timeout(300000), // 5 minute timeout
      });
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const progressPercent = Math.round(((batchIdx + 1) / batches.length) * 100);
      console.log(`  ⏱️  API responded in ${elapsed}s (${progressPercent}% complete)`);
      
      if (!enrichResponse.ok) {
        const errorText = await enrichResponse.text();
        console.error(`❌ Batch ${batchIdx + 1} failed (${enrichResponse.status}):`, errorText.substring(0, 500));
        errorCount += batch.length;
        continue;
      }
      
      const result = await enrichResponse.json();
      
      if (result.success && result.enrichedLeads) {
        allEnrichedLeads.push(...result.enrichedLeads);
        successCount += result.enrichedLeads.length;
        const withPhone = result.enrichedLeads.filter((l: any) => l.phone && l.phone !== 'EMPTY').length;
        const withEmail = result.enrichedLeads.filter((l: any) => l.email && l.email !== 'EMPTY').length;
        console.log(`  ✅ Enriched ${result.enrichedLeads.length} leads (${withPhone} with phone, ${withEmail} with email)`);
      } else {
        console.error(`  ❌ Batch ${batchIdx + 1} returned no enriched leads:`, result.error || 'Unknown error');
        errorCount += batch.length;
      }
      
      // Small delay between batches to respect rate limits
      if (batchIdx < batches.length - 1) {
        console.log(`  ⏳ Waiting 2 seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
    } catch (error) {
      console.error(`❌ Error processing batch ${batchIdx + 1}:`, error);
      if (error instanceof Error) {
        console.error(`  Error message: ${error.message}`);
        console.error(`  Error stack: ${error.stack?.substring(0, 500)}`);
      }
      errorCount += batch.length;
    }
  }
  
  // Save results
  const outputPath = path.join(process.cwd(), 'data', 'enriched-all-leads.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    metadata: {
      enrichedAt: new Date().toISOString(),
      totalLeads: allEnrichedLeads.length,
      successCount,
      errorCount,
    },
    leads: allEnrichedLeads,
  }, null, 2));
  
  console.log(`\n\n✅ Enrichment complete!`);
  console.log(`📊 Summary:`);
  console.log(`  Total leads processed: ${leads.length}`);
  console.log(`  Successfully enriched: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`\n💾 Saved results to: ${outputPath}`);
}

main().catch(console.error);
