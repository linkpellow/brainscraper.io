/**
 * Test if API key is valid by checking account status
 */

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962';

async function testApiKey() {
  console.log('🔑 Testing API Key Validity\n');
  console.log(`API Key: ${RAPIDAPI_KEY.substring(0, 20)}...`);
  console.log(`API Key Length: ${RAPIDAPI_KEY.length}\n`);

  // Try a very simple request - just get filter suggestions (usually works)
  console.log('Test: Getting company suggestions (should work if API key is valid)...');
  try {
    const response = await fetch('https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/filter_company_suggestions', {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: 'Apple' }),
    });

    const result = await response.text();
    const data = JSON.parse(result);
    
    console.log(`Status: ${response.status}`);
    if (response.ok && !data.error) {
      console.log('✅ API Key is valid - filter suggestions work');
      const suggestions = data.data || [];
      console.log(`   Found ${suggestions.length} suggestions`);
    } else {
      console.log('❌ API Key issue or subscription problem');
      console.log('Response:', JSON.stringify(data, null, 2).substring(0, 500));
    }
  } catch (error) {
    console.error('❌ Request failed:', error);
  }

  console.log('\nTest: Premium search with minimal request...');
  try {
    const response = await fetch('https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/premium_search_person', {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        page: 1,
        limit: 1,
        account_number: 1,
      }),
    });

    const result = await response.text();
    const data = JSON.parse(result);
    
    console.log(`Status: ${response.status}`);
    if (data.success === false) {
      console.log(`❌ Error: ${data.error}`);
      console.log('Full response:', JSON.stringify(data, null, 2));
    } else {
      console.log('✅ Request succeeded');
      const leads = data.response?.data || data.data?.response?.data || [];
      console.log(`   Found ${leads.length} leads`);
    }
  } catch (error) {
    console.error('❌ Request failed:', error);
  }
}

testApiKey().catch(console.error);
