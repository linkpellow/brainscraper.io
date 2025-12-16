/**
 * Test script for LinkedIn lead scraping → Enrichment → DNC Scrubbing workflow
 * Tests: Maryland leads who recently changed jobs
 */

const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const USHA_JWT_TOKEN = process.env.USHA_JWT_TOKEN;

if (!RAPIDAPI_KEY) {
  console.error('❌ RAPIDAPI_KEY not found in .env.local');
  process.exit(1);
}

console.log('🧪 Testing LinkedIn Lead Scraping → Enrichment → DNC Scrubbing Workflow\n');

// Step 1: Scrape LinkedIn leads (Maryland, recently changed jobs)
async function scrapeLinkedInLeads() {
  console.log('📊 Step 1: Scraping LinkedIn leads (Maryland, recently changed jobs)...');
  
  try {
    const response = await fetch('https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/premium_search_person', {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        location: 'Maryland, MD, United States',
        changed_jobs_90_days: true,
        limit: 10, // Start with 10 for testing
        page: 1, // Required parameter
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const result = await response.text();
    let data;
    try {
      data = JSON.parse(result);
    } catch {
      data = { raw: result };
    }

    console.log(`✅ Found ${Array.isArray(data) ? data.length : data.leads?.length || 0} leads`);
    console.log('Sample result:', JSON.stringify(data, null, 2).substring(0, 500));
    
    return data;
  } catch (error) {
    console.error('❌ Error scraping LinkedIn leads:', error.message);
    throw error;
  }
}

// Step 2: Convert leads to CSV format
function leadsToCSV(leads) {
  const headers = ['First Name', 'Last Name', 'City', 'State', 'Zip', 'Date Of Birth', 'House hold Income', 'Primary Phone'];
  
  const rows = leads.map((lead) => {
    const name = lead.name || lead.full_name || '';
    const nameParts = name.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    
    const location = lead.location || '';
    const locationParts = location.split(',');
    const city = locationParts[0]?.trim() || '';
    const state = locationParts[1]?.trim() || 'MD';
    
    return [
      firstName,
      lastName,
      city,
      state,
      '', // Zip - will be enriched
      '', // DOB - will be enriched
      '', // Income - will be enriched
      lead.phone || lead.phone_number || '',
    ];
  });

  const csv = [headers.join(','), ...rows.map(row => row.map(val => `"${val}"`).join(','))].join('\n');
  return csv;
}

// Step 3: Test enrichment (one lead)
async function testEnrichment(lead) {
  console.log('\n🔍 Step 2: Testing enrichment for one lead...');
  
  const phone = lead.phone || lead.phone_number || '';
  const zip = lead.zip || '';
  
  const results = {};
  
  // Test Telnyx lookup
  if (phone && TELNYX_API_KEY) {
    try {
      console.log(`  Testing Telnyx lookup for: ${phone}`);
      const response = await fetch(`http://localhost:3000/api/telnyx/lookup?phone=${encodeURIComponent(phone)}`);
      if (response.ok) {
        results.telnyx = await response.json();
        console.log('  ✅ Telnyx lookup successful');
      }
    } catch (error) {
      console.log('  ⚠️  Telnyx lookup failed:', error.message);
    }
  }
  
  // Test income lookup
  if (zip) {
    try {
      console.log(`  Testing income lookup for zip: ${zip}`);
      const response = await fetch(`http://localhost:3000/api/income-by-zip?zip=${zip}`);
      if (response.ok) {
        results.income = await response.json();
        console.log('  ✅ Income lookup successful');
      }
    } catch (error) {
      console.log('  ⚠️  Income lookup failed:', error.message);
    }
  }
  
  return results;
}

// Main test function
async function runTest() {
  try {
    // Step 1: Scrape leads
    const leads = await scrapeLinkedInLeads();
    
    // Convert to array format
    const leadsArray = Array.isArray(leads) ? leads : (leads.leads || leads.results || []);
    
    if (leadsArray.length === 0) {
      console.log('⚠️  No leads found. This might be expected if the API requires different parameters.');
      console.log('   Try using the JSON to URL mode for advanced filtering.');
      return;
    }
    
    console.log(`\n✅ Scraped ${leadsArray.length} leads`);
    
    // Step 2: Test enrichment on first lead
    if (leadsArray.length > 0) {
      await testEnrichment(leadsArray[0]);
    }
    
    // Step 3: Generate CSV
    const csv = leadsToCSV(leadsArray);
    const csvPath = path.join(__dirname, 'test_leads.csv');
    fs.writeFileSync(csvPath, csv);
    console.log(`\n✅ Generated CSV file: ${csvPath}`);
    console.log(`   Contains ${leadsArray.length} leads ready for enrichment`);
    
    console.log('\n📋 Next Steps:');
    console.log('1. Go to http://localhost:3000');
    console.log('2. Upload the test_leads.csv file');
    console.log('3. Click "Enrich Data" to enrich all leads');
    console.log('4. Click "DNC Scrub" to check DNC status');
    console.log('5. View results in Summary View and export CSV');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Check if server is running
fetch('http://localhost:3000')
  .then(() => {
    console.log('✅ Server is running\n');
    runTest();
  })
  .catch(() => {
    console.log('⚠️  Server not running. Starting server...');
    console.log('   Please run: npm run dev');
    console.log('   Then run this script again: node test-workflow.js');
  });

