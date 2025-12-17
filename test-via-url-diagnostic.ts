/**
 * Diagnostic test for via_url endpoint failures
 * Tests the exact scenario that failed: Florida + title keywords
 * Compares generated URL with real LinkedIn Sales Navigator URL format
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_BASE_URL = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com';

// Real LinkedIn Sales Navigator URL provided by user for comparison
const REAL_URL = 'https://www.linkedin.com/sales/search/people?query=(recentSearchParam%3A(id%3A4942621914%2CdoLogHistory%3Atrue)%2Cfilters%3AList((type%3AREGION%2Cvalues%3AList((id%3A100809221%2Ctext%3AMaryland%252C%2520United%2520States%2CselectionType%3AINCLUDED)%2C(id%3A105763813%2Ctext%3AColorado%252C%2520United%2520States%2CselectionType%3AINCLUDED)%2C(id%3A101949407%2Ctext%3AIllinois%252C%2520United%2520States%2CselectionType%3AINCLUDED)))%2C(type%3ARECENTLY_CHANGED_JOBS%2Cvalues%3AList((id%3ARPC%2Ctext%3AChanged%2520jobs%2CselectionType%3AINCLUDED)))%2C(type%3ACURRENT_TITLE%2Cvalues%3AList((id%3A1%2Ctext%3AOwner%2CselectionType%3AINCLUDED))))&sessionId=74bhSJ7wRtSjbDJmR8bwQA%3D%3D&viewAllFilters=true';

async function testJsonToUrl() {
  console.log('🔍 Testing json_to_url endpoint with Florida + title keywords\n');

  // Test case: Florida + Self Employed titles (the exact failing scenario)
  // Try multiple filter formats to see which one works
  
  console.log('🧪 Testing different filter formats...\n');
  
  // Test 1: REGION filter with keywords (current approach)
  const filters1 = [
    {
      type: 'REGION',
      values: [{
        id: '103644278', // Florida location ID
        text: 'Florida, United States',
        selectionType: 'INCLUDED',
      }],
    },
  ];
  const keywords1 = 'Self Employed, Self-Employed, Freelancer, Independent Contractor, Consultant, Owner, Founder';
  
  // Test 2: REGION filter with CURRENT_TITLE filter for "Owner" (matching real URL format)
  const filters2 = [
    {
      type: 'REGION',
      values: [{
        id: '103644278',
        text: 'Florida, United States',
        selectionType: 'INCLUDED',
      }],
    },
    {
      type: 'CURRENT_TITLE',
      values: [{
        id: '1', // Owner ID from real URL
        text: 'Owner',
        selectionType: 'INCLUDED',
      }],
    },
  ];
  const keywords2 = ''; // No keywords when using CURRENT_TITLE
  
  // Test 3: REGION filter only (no title/keywords)
  const filters3 = [
    {
      type: 'REGION',
      values: [{
        id: '103644278',
        text: 'Florida, United States',
        selectionType: 'INCLUDED',
      }],
    },
  ];
  const keywords3 = '';
  
  // Run tests
  await testFilterFormat('Test 1: REGION + Keywords', filters1, keywords1);
  await testFilterFormat('Test 2: REGION + CURRENT_TITLE filter', filters2, keywords2);
  await testFilterFormat('Test 3: REGION only', filters3, keywords3);
  
  // Test 4: Manual URL construction (matching route.ts implementation)
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Test 4: Manual URL Construction (Route Implementation)`);
  console.log('='.repeat(60));
  await testManualUrlConstruction(filters3, '');
}

async function testManualUrlConstruction(filters: any[], keywords: string) {
  console.log('🔧 Testing manual URL construction (bypassing json_to_url)...\n');
  
  try {
    // Build the query structure matching real LinkedIn format exactly
    const queryParts: string[] = [];
    
    // recentSearchParam (session-specific, generate random ID)
    const recentSearchId = Math.floor(Math.random() * 10000000000);
    queryParts.push(`recentSearchParam:(id:${recentSearchId},doLogHistory:true)`);
    
    // Build filters list
    if (filters.length > 0) {
      const filterStrings = filters.map(filter => {
        const valueStrings = filter.values.map((val: any) => {
          // URL encode the text value
          const encodedText = encodeURIComponent(val.text);
          return `(id:${val.id},text:${encodedText},selectionType:${val.selectionType})`;
        });
        return `(type:${filter.type},values:List(${valueStrings.join(',')}))`;
      });
      queryParts.push(`filters:List(${filterStrings.join(',')})`);
    }
    
    // Add keywords only if present
    if (keywords) {
      queryParts.push(`keywords:${keywords}`);
    }
    
    // Construct the full query parameter
    const queryValue = `(${queryParts.join(',')})`;
    const encodedQuery = encodeURIComponent(queryValue);
    
    // Generate session ID (random base64-like string, 22 chars)
    const sessionId = Buffer.from(`${Date.now()}-${Math.random()}`).toString('base64')
      .replace(/[+/=]/g, '')
      .substring(0, 22);
    
    // Construct the full URL (matching real LinkedIn format exactly)
    const generatedUrl = `https://www.linkedin.com/sales/search/people?query=${encodedQuery}&sessionId=${sessionId}&viewAllFilters=true`;
    
    console.log('✅ Manually constructed URL:');
    console.log(generatedUrl);
    console.log('\n');
    
    // Validate URL format
    console.log('🔍 URL Validation:');
    const isValidFormat = generatedUrl.startsWith('https://www.linkedin.com/sales/search/');
    console.log(`  - Starts with correct base: ${isValidFormat}`);
    
    const hasQueryParam = generatedUrl.includes('query=');
    console.log(`  - Has query parameter: ${hasQueryParam}`);
    
    const hasSpellCorrection = generatedUrl.includes('spellCorrectionEnabled');
    console.log(`  - Has spellCorrectionEnabled: ${hasSpellCorrection} (should be false)`);
    
    // Decode and check structure
    const decodedQuery = decodeURIComponent(new URL(generatedUrl).searchParams.get('query') || '');
    console.log('\n📊 Decoded query structure:');
    console.log(decodedQuery.substring(0, 300));
    console.log('\n📊 Real query structure (for comparison):');
    const realQuery = new URL(REAL_URL).searchParams.get('query') || '';
    console.log(decodeURIComponent(realQuery).substring(0, 300));
    
    // Test via_url endpoint with manually constructed URL
    console.log('\n🧪 Testing via_url endpoint with manually constructed URL...\n');
    
    const viaUrlResponse = await fetch(`${API_BASE_URL}/premium_search_person_via_url`, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY!,
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: generatedUrl,
        account_number: 1,
        page: 1,
        limit: 25,
      }),
    });

    console.log(`📥 via_url Response status: ${viaUrlResponse.status}`);
    const viaUrlText = await viaUrlResponse.text();
    console.log(`📥 via_url Response: ${viaUrlText}\n`);

    let errorData;
    try {
      errorData = JSON.parse(viaUrlText);
    } catch {
      errorData = { raw: viaUrlText };
    }

    // Check for error in response body (even if HTTP status is 200)
    const hasError = errorData.success === false || errorData.error;
    const has400Error = viaUrlResponse.status === 400 || 
                       (errorData.error && String(errorData.error).includes('400')) ||
                       (errorData.success === false && errorData.error && String(errorData.error).includes('400'));

    if (!viaUrlResponse.ok || hasError) {
      console.log('❌ via_url failed:');
      console.log(JSON.stringify(errorData, null, 2));
      
      console.log(`\n🔍 Error analysis:`);
      console.log(`  - HTTP Status: ${viaUrlResponse.status}`);
      console.log(`  - Response success: ${errorData.success}`);
      console.log(`  - Contains 400 error: ${has400Error}`);
      console.log(`  - Error message: ${errorData.error || 'N/A'}`);
    } else {
      console.log('✅ via_url succeeded with manually constructed URL!');
      try {
        const result = JSON.parse(viaUrlText);
        console.log(`  - Results count: ${result.results?.length || result.data?.length || 'unknown'}`);
      } catch {
        console.log('  - Response is not JSON');
      }
    }
  } catch (error) {
    console.error('❌ Error in manual URL construction:', error);
  }
}

async function testFilterFormat(testName: string, filters: any[], keywords: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${testName}`);
  console.log('='.repeat(60));

  console.log('📤 Request payload:');
  console.log(JSON.stringify({ filters, keywords }, null, 2));
  console.log('\n');

  try {
    const response = await fetch(`${API_BASE_URL}/json_to_url`, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY!,
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filters, keywords }),
    });

    console.log(`📥 Response status: ${response.status}`);
    const responseText = await response.text();
    console.log(`📥 Response text: ${responseText.substring(0, 500)}...\n`);

    let generatedUrl: string | null = null;
    try {
      const data = JSON.parse(responseText);
      generatedUrl = data.url || data.data || (typeof data === 'string' ? data : null);
    } catch {
      generatedUrl = responseText;
    }

    if (generatedUrl) {
      console.log('✅ Generated URL:');
      console.log(generatedUrl);
      console.log('\n');

      // Validate URL format
      console.log('🔍 URL Validation:');
      const isValidFormat = generatedUrl.startsWith('https://www.linkedin.com/sales/search/');
      console.log(`  - Starts with correct base: ${isValidFormat}`);
      
      const hasQueryParam = generatedUrl.includes('query=');
      console.log(`  - Has query parameter: ${hasQueryParam}`);
      
      const hasFilters = generatedUrl.includes('filters');
      console.log(`  - Has filters in query: ${hasFilters}`);
      
      console.log('\n📊 Comparison with Real URL:');
      console.log('Real URL structure:', REAL_URL.substring(0, 100) + '...');
      console.log('Generated URL structure:', generatedUrl.substring(0, 100) + '...');
      
      // Test via_url endpoint with generated URL
      console.log('\n🧪 Testing via_url endpoint with generated URL...\n');
      
      const viaUrlResponse = await fetch(`${API_BASE_URL}/premium_search_person_via_url`, {
        method: 'POST',
        headers: {
          'x-rapidapi-key': RAPIDAPI_KEY!,
          'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: generatedUrl,
          account_number: 1,
          page: 1,
          limit: 25,
        }),
      });

      console.log(`📥 via_url Response status: ${viaUrlResponse.status}`);
      const viaUrlText = await viaUrlResponse.text();
      console.log(`📥 via_url Response: ${viaUrlText}\n`);

      let errorData;
      try {
        errorData = JSON.parse(viaUrlText);
      } catch {
        errorData = { raw: viaUrlText };
      }

      // Check for error in response body (even if HTTP status is 200)
      const hasError = errorData.success === false || errorData.error;
      const has400Error = viaUrlResponse.status === 400 || 
                         (errorData.error && String(errorData.error).includes('400')) ||
                         (errorData.success === false && errorData.error && String(errorData.error).includes('400'));

      if (!viaUrlResponse.ok || hasError) {
        console.log('❌ via_url failed:');
        console.log(JSON.stringify(errorData, null, 2));
        
        console.log(`\n🔍 Error analysis:`);
        console.log(`  - HTTP Status: ${viaUrlResponse.status}`);
        console.log(`  - Response success: ${errorData.success}`);
        console.log(`  - Contains 400 error: ${has400Error}`);
        console.log(`  - Error message: ${errorData.error || 'N/A'}`);
        
        if (has400Error) {
          console.log('\n⚠️  ROOT CAUSE: Generated URL is invalid (400 Bad Request)');
          console.log('   The json_to_url endpoint generated a URL that LinkedIn rejects.');
          console.log('   This suggests the filter format or encoding is incorrect.\n');
          
          // Compare URL structures
          console.log('📊 URL Structure Comparison:');
          const generatedQuery = new URL(generatedUrl).searchParams.get('query') || '';
          const realQuery = new URL(REAL_URL).searchParams.get('query') || '';
          
          console.log('\nGenerated query structure:');
          console.log(decodeURIComponent(generatedQuery).substring(0, 300));
          console.log('\nReal query structure:');
          console.log(decodeURIComponent(realQuery).substring(0, 300));
        }
      } else {
        console.log('✅ via_url succeeded!');
        try {
          const result = JSON.parse(viaUrlText);
          console.log(`  - Results count: ${result.results?.length || result.data?.length || 'unknown'}`);
        } catch {
          console.log('  - Response is not JSON');
        }
      }
    } else {
      console.log('❌ Failed to extract URL from json_to_url response');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testJsonToUrl().catch(console.error);
