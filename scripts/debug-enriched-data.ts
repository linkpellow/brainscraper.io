/**
 * Debug script to check what's actually in localStorage/enriched data
 */

import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('🔍 Debugging enriched data...\n');
  
  // Check if there's a saved enriched leads file or localStorage data
  const dataDir = path.join(process.cwd(), 'data');
  
  // Check for re-enriched leads
  const reEnrichedPath = path.join(dataDir, 're-enriched-leads.json');
  if (fs.existsSync(reEnrichedPath)) {
    console.log('📂 Found re-enriched-leads.json\n');
    const data = JSON.parse(fs.readFileSync(reEnrichedPath, 'utf-8'));
    
    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      console.log('📋 First Lead Sample:');
      console.log(JSON.stringify(first, null, 2));
      console.log('\n');
      
      console.log('🔍 Field Analysis:');
      console.log(`   name: "${first.name || 'MISSING'}"`);
      console.log(`   phone: "${first.phone || 'MISSING'}"`);
      console.log(`   email: "${first.email || 'MISSING'}"`);
      console.log(`   zipcode: "${first.zipcode || 'MISSING'}"`);
      console.log(`   dobOrAge: "${first.dobOrAge || 'MISSING'}"`);
      console.log(`   lineType: "${first.lineType || 'MISSING'}"`);
      console.log(`   carrier: "${first.carrier || 'MISSING'}"`);
      console.log(`   city: "${first.city || 'MISSING'}"`);
      console.log(`   state: "${first.state || 'MISSING'}"`);
      
      // Count how many have data
      const withPhone = data.filter((l: any) => l.phone && l.phone !== '').length;
      const withEmail = data.filter((l: any) => l.email && l.email !== '').length;
      const withZip = data.filter((l: any) => l.zipcode && l.zipcode !== '').length;
      const withAge = data.filter((l: any) => l.dobOrAge && l.dobOrAge !== '').length;
      const withLineType = data.filter((l: any) => l.lineType && l.lineType !== '').length;
      const withCarrier = data.filter((l: any) => l.carrier && l.carrier !== '').length;
      
      console.log('\n📊 Statistics:');
      console.log(`   Total leads: ${data.length}`);
      console.log(`   With phone: ${withPhone} (${Math.round((withPhone/data.length)*100)}%)`);
      console.log(`   With email: ${withEmail} (${Math.round((withEmail/data.length)*100)}%)`);
      console.log(`   With zipcode: ${withZip} (${Math.round((withZip/data.length)*100)}%)`);
      console.log(`   With age: ${withAge} (${Math.round((withAge/data.length)*100)}%)`);
      console.log(`   With lineType: ${withLineType} (${Math.round((withLineType/data.length)*100)}%)`);
      console.log(`   With carrier: ${withCarrier} (${Math.round((withCarrier/data.length)*100)}%)`);
    }
  } else {
    console.log('❌ No re-enriched-leads.json found');
  }
  
  // Check what the actual enrichment result structure looks like
  console.log('\n🔍 Checking enrichment flow...');
  console.log('   Looking at enrichRow return structure...\n');
  
  // Check if zipCode is being set correctly
  console.log('⚠️  Potential Issues:');
  console.log('   1. zipCode might be null/undefined if ZIP lookup fails');
  console.log('   2. Phone might not be extracted from summary before enrichment');
  console.log('   3. Enrichment APIs might not be running (check API keys)');
  console.log('   4. extractLeadSummary might not be reading from enriched object correctly');
}

main().catch(console.error);
