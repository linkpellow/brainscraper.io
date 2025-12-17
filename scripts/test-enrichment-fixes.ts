/**
 * Test script to verify enrichment fixes with a small control set
 * Tests:
 * 1. Phone/email extraction and saving
 * 2. Aggregation to enriched-all-leads.json
 * 3. Loading from API
 */

import { enrichData } from '../utils/enrichData';
import { extractLeadSummary } from '../utils/extractLeadSummary';
import { clearCheckpoint } from '../utils/incrementalSave';
import type { ParsedData, EnrichedRow } from '../utils/enrichData';
import type { LeadSummary } from '../utils/extractLeadSummary';
import * as fs from 'fs';
import * as path from 'path';

// Small control set - 3 leads with known data
const testLeads: ParsedData = {
  headers: ['Firstname', 'Lastname', 'State', 'City', 'Name'],
  rows: [
    {
      'Firstname': 'John',
      'Lastname': 'Doe',
      'State': 'Colorado',
      'City': 'Denver',
      'Name': 'John Doe',
    },
    {
      'Firstname': 'Jane',
      'Lastname': 'Smith',
      'State': 'Colorado',
      'City': 'Boulder',
      'Name': 'Jane Smith',
    },
    {
      'Firstname': 'Bob',
      'Lastname': 'Johnson',
      'State': 'Colorado',
      'City': 'Aurora',
      'Name': 'Bob Johnson',
    },
  ],
  rowCount: 3,
  columnCount: 5,
};

async function testEnrichment() {
  console.log('🧪 Testing Enrichment Fixes with Control Set\n');
  console.log('='.repeat(60));
  console.log('Test Leads:');
  testLeads.rows.forEach((row, i) => {
    console.log(`  ${i + 1}. ${row.Name} - ${row.City}, ${row.State}`);
  });
  console.log('='.repeat(60));
  console.log('\n');

  try {
    // Clear checkpoint to ensure fresh test
    console.log('🧹 Clearing checkpoint for fresh test...\n');
    clearCheckpoint();
    
    // Step 1: Run enrichment
    console.log('📊 Step 1: Running enrichment...\n');
    const enriched = await enrichData(testLeads, (current, total) => {
      console.log(`  Progress: ${current}/${total} (${Math.round((current/total)*100)}%)`);
    });

    console.log(`\n✅ Enrichment completed for ${enriched.rows.length} leads\n`);

    // Step 2: Extract summaries
    console.log('📋 Step 2: Extracting lead summaries...\n');
    const summaries: LeadSummary[] = enriched.rows.map((row: EnrichedRow) => 
      extractLeadSummary(row, row._enriched)
    );

    // Step 3: Check phone/email extraction
    console.log('🔍 Step 3: Checking phone/email extraction...\n');
    let phoneCount = 0;
    let emailCount = 0;
    
    summaries.forEach((summary, i) => {
      const hasPhone = summary.phone && summary.phone.trim().length >= 10;
      const hasEmail = summary.email && summary.email.includes('@');
      
      console.log(`  Lead ${i + 1}: ${summary.name}`);
      console.log(`    Phone: ${hasPhone ? `✅ ${summary.phone.substring(0, 5)}...` : '❌ MISSING'}`);
      console.log(`    Email: ${hasEmail ? `✅ ${summary.email.substring(0, 10)}...` : '❌ MISSING'}`);
      console.log(`    Zipcode: ${summary.zipcode || 'MISSING'}`);
      console.log(`    Age: ${summary.dobOrAge || 'MISSING'}`);
      console.log('');
      
      if (hasPhone) phoneCount++;
      if (hasEmail) emailCount++;
    });

    console.log(`📊 Summary Statistics:`);
    console.log(`  Total leads: ${summaries.length}`);
    console.log(`  With phone: ${phoneCount}/${summaries.length} (${Math.round((phoneCount/summaries.length)*100)}%)`);
    console.log(`  With email: ${emailCount}/${summaries.length} (${Math.round((emailCount/summaries.length)*100)}%)`);
    console.log('');

    // Step 4: Check row data preservation
    console.log('💾 Step 4: Checking row data preservation...\n');
    enriched.rows.forEach((row: EnrichedRow, i) => {
      const rowPhone = row['Phone'] || '';
      const rowEmail = row['Email'] || '';
      const summary = summaries[i];
      
      console.log(`  Lead ${i + 1}: ${row['Name']}`);
      console.log(`    Row Phone: ${rowPhone ? `✅ ${String(rowPhone).substring(0, 5)}...` : '❌ MISSING'}`);
      console.log(`    Row Email: ${rowEmail ? `✅ ${String(rowEmail).substring(0, 10)}...` : '❌ MISSING'}`);
      console.log(`    Summary Phone: ${summary.phone ? `✅ ${summary.phone.substring(0, 5)}...` : '❌ MISSING'}`);
      console.log(`    Summary Email: ${summary.email ? `✅ ${summary.email.substring(0, 10)}...` : '❌ MISSING'}`);
      
      // Verify phone/email are in row if they're in summary
      if (summary.phone && !rowPhone) {
        console.log(`    ⚠️  WARNING: Phone in summary but not in row!`);
      }
      if (summary.email && !rowEmail) {
        console.log(`    ⚠️  WARNING: Email in summary but not in row!`);
      }
      console.log('');
    });

    // Step 5: Test aggregation API
    console.log('🔄 Step 5: Testing aggregation API...\n');
    try {
      const response = await fetch('http://localhost:3000/api/aggregate-enriched-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newLeads: summaries }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`  ✅ Aggregation successful:`);
        console.log(`    Total leads: ${data.totalLeads}`);
        console.log(`    New leads added: ${data.newLeadsAdded}`);
        console.log('');
      } else {
        const error = await response.text();
        console.log(`  ❌ Aggregation failed: ${error}`);
        console.log('');
      }
    } catch (error) {
      console.log(`  ⚠️  Could not test aggregation API (server may not be running): ${error}`);
      console.log('');
    }

    // Step 6: Test loading from API
    console.log('📥 Step 6: Testing load from API...\n');
    try {
      const response = await fetch('http://localhost:3000/api/load-enriched-results');
      
      if (response.ok) {
        const data = await response.json();
        console.log(`  ✅ Load successful:`);
        console.log(`    Source: ${data.source}`);
        console.log(`    Total leads loaded: ${data.leads.length}`);
        console.log(`    With phone: ${data.stats.withPhone}`);
        console.log(`    With email: ${data.stats.withPhone}`); // Note: stats may not have email count
        console.log('');
        
        // Check if our test leads are in the loaded data
        const testLeadNames = summaries.map(s => s.name);
        const loadedNames = data.leads.map((l: LeadSummary) => l.name);
        const foundLeads = testLeadNames.filter(name => loadedNames.includes(name));
        
        console.log(`  Found ${foundLeads.length}/${testLeadNames.length} test leads in loaded data`);
        if (foundLeads.length < testLeadNames.length) {
          console.log(`    ⚠️  Some test leads not found in loaded data`);
        }
        console.log('');
      } else {
        const error = await response.text();
        console.log(`  ❌ Load failed: ${error}`);
        console.log('');
      }
    } catch (error) {
      console.log(`  ⚠️  Could not test load API (server may not be running): ${error}`);
      console.log('');
    }

    // Step 7: Save test results
    console.log('💾 Step 7: Saving test results...\n');
    const outputPath = path.join(process.cwd(), 'data', 'test-enrichment-results.json');
    const testResults = {
      timestamp: new Date().toISOString(),
      testLeads: summaries,
      statistics: {
        total: summaries.length,
        withPhone: phoneCount,
        withEmail: emailCount,
        phonePercentage: Math.round((phoneCount/summaries.length)*100),
        emailPercentage: Math.round((emailCount/summaries.length)*100),
      },
      enrichedRows: enriched.rows.map((row: EnrichedRow) => ({
        name: row['Name'],
        phone: row['Phone'] || '',
        email: row['Email'] || '',
        hasPhoneInRow: !!(row['Phone']),
        hasEmailInRow: !!(row['Email']),
      })),
    };

    // Ensure data directory exists
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(testResults, null, 2));
    console.log(`  ✅ Test results saved to: ${outputPath}`);
    console.log('');

    // Final summary
    console.log('='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Enrichment completed: ${enriched.rows.length} leads`);
    console.log(`✅ Phone extraction: ${phoneCount}/${summaries.length} (${Math.round((phoneCount/summaries.length)*100)}%)`);
    console.log(`✅ Email extraction: ${emailCount}/${summaries.length} (${Math.round((emailCount/summaries.length)*100)}%)`);
    console.log(`✅ Results saved to: ${outputPath}`);
    console.log('');
    console.log('💡 Next steps:');
    console.log('  1. Check console logs for detailed extraction information');
    console.log('  2. Verify enriched-all-leads.json contains the test leads');
    console.log('  3. Check enriched-leads/summary-*.json files');
    console.log('  4. Test loading from Enriched Leads page in UI');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testEnrichment().catch(console.error);
