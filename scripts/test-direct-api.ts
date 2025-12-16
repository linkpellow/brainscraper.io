/**
 * Test direct API call to RapidAPI to verify rate limits
 */

const fetch = require('node-fetch');

async function testDirectAPI() {
  console.log('🧪 Testing Direct RapidAPI Call\n');
  
  const url = 'https://skip-tracing-working-api.p.rapidapi.com/search/detailsbyID?peo_id=p4r4020l80998ll84l64';
  
  const options = {
    method: 'GET',
    headers: {
      'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
      'x-rapidapi-host': 'skip-tracing-working-api.p.rapidapi.com'
    }
  };

  try {
    console.log('Making direct API call...');
    const startTime = Date.now();
    const response = await fetch(url, options);
    const responseTime = Date.now() - startTime;
    
    console.log(`Response status: ${response.status}`);
    console.log(`Response time: ${responseTime}ms`);
    
    if (response.status === 429) {
      const errorText = await response.text();
      console.log(`❌ Rate limited! Error: ${errorText.substring(0, 200)}`);
    } else if (response.ok) {
      const result = await response.text();
      console.log(`✅ Success! Response length: ${result.length} chars`);
      console.log(`Response preview: ${result.substring(0, 500)}`);
    } else {
      const errorText = await response.text();
      console.log(`⚠️  HTTP ${response.status}: ${errorText.substring(0, 200)}`);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testDirectAPI();
