/**
 * Test Colorado + Changed Jobs 90 Days Search
 * Tests the actual API endpoint to verify it works
 */

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

async function testColorado90Days() {
  console.log('🧪 Testing Colorado + Changed Jobs 90 Days Search\n');
  console.log('📍 Location: Colorado');
  console.log('🔄 Filter: changed_jobs_90_days = true');
  console.log('📄 Page: 1');
  console.log('📊 Limit: 100\n');

  const requestBody = {
    endpoint: 'premium_search_person',
    location: 'Colorado',
    changed_jobs_90_days: 'true',
    page: 1,
    limit: 100
  };

  console.log('📤 Request Body:', JSON.stringify(requestBody, null, 2));
  console.log('\n🌐 Making request to:', `${BASE_URL}/api/linkedin-sales-navigator`);
  console.log('');

  try {
    const response = await fetch(`${BASE_URL}/api/linkedin-sales-navigator`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('📥 Response Status:', response.status, response.statusText);
    console.log('📥 Response OK:', response.ok);
    console.log('');

    const result = await response.json();
    
    console.log('📦 Response Keys:', Object.keys(result));
    console.log('');

    if (!response.ok) {
      console.log('❌ ERROR RESPONSE:');
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Check for error in response body (RapidAPI sometimes returns 200 with error)
    if (result.success === false || (result.data && result.data.success === false)) {
      console.log('❌ ERROR IN RESPONSE BODY:');
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Extract results
    let leads: any[] = [];
    let pagination: any = null;

    if (result.data?.response?.data && Array.isArray(result.data.response.data)) {
      leads = result.data.response.data;
      pagination = result.data.response.pagination || result.pagination;
      console.log('✅ Found results in result.data.response.data');
    } else if (result.data?.data && Array.isArray(result.data.data)) {
      leads = result.data.data;
      pagination = result.data.pagination || result.pagination;
      console.log('✅ Found results in result.data.data');
    } else if (Array.isArray(result.data)) {
      leads = result.data;
      pagination = result.pagination;
      console.log('✅ Found results in result.data (direct array)');
    } else {
      console.log('⚠️  No results found in expected locations');
      console.log('📋 Full response structure:');
      console.log(JSON.stringify(result, null, 2).substring(0, 2000));
      return;
    }

    console.log('');
    console.log('📊 RESULTS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Total Leads Found: ${leads.length}`);
    console.log('');

    if (pagination) {
      console.log('📄 PAGINATION:');
      console.log(`   Total: ${pagination.total || 'N/A'}`);
      console.log(`   Count: ${pagination.count || leads.length}`);
      console.log(`   Start: ${pagination.start || 0}`);
      console.log(`   Has More: ${pagination.hasMore || false}`);
      console.log('');
    }

    if (leads.length > 0) {
      console.log('👤 SAMPLE LEADS (first 3):');
      leads.slice(0, 3).forEach((lead, i) => {
        console.log(`\n   ${i + 1}. ${lead.name || lead.fullName || 'Unknown'}`);
        console.log(`      Title: ${lead.title || lead.jobTitle || 'N/A'}`);
        console.log(`      Company: ${lead.company || lead.currentCompany || 'N/A'}`);
        console.log(`      Location: ${lead.location || lead.geoRegion || 'N/A'}`);
        console.log(`      LinkedIn: ${lead.linkedinUrl || lead.profileUrl || 'N/A'}`);
      });
    } else {
      console.log('⚠️  No leads returned');
    }

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Test Complete');

  } catch (error) {
    console.error('❌ TEST FAILED:');
    console.error(error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
  }
}

// Run the test
testColorado90Days();
