/**
 * Test Script: ScraperAPI Skip-Tracing Integration
 * 
 * Tests the complete flow:
 * 1. Get one lead from LinkedIn Sales Navigator API
 * 2. Test ScraperAPI skip-tracing on that lead
 * 3. Compare results
 * 
 * This script does NOT affect the current pipeline - it's read-only testing
 */

import { config } from 'dotenv';
import { skipTraceWithScraperAPI } from '../utils/scraperAPISkipTracing';
import { fetchWithRapidAPIFallback } from '../utils/rapidapiKeyManager';

// Load environment variables
config({ path: '.env.local' });

interface LinkedInLead {
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  name?: string;
  location?: string;
}

/**
 * Get 25 leads from LinkedIn Sales Navigator API (one page)
 */
async function getLinkedInLeads(): Promise<LinkedInLead[] | null> {
  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
  
  if (!RAPIDAPI_KEY) {
    console.error('❌ RAPIDAPI_KEY not found in environment');
    return null;
  }

  try {
    console.log('🔍 Fetching 25 leads from LinkedIn Sales Navigator (one page)...');
    
    // Simple search to get 25 results (one page)
    const searchBody = {
      keywords: 'software engineer',
      location: 'United States',
      limit: 25, // Get one page of 25 leads
      page: 1,
    };

    const result = await fetchWithRapidAPIFallback(
      'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/premium_search_person',
      'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchBody),
      },
      [429, 401, 403, 500, 502, 503, 504]
    );

    if (result.error || !result.data) {
      console.error('❌ LinkedIn API error:', result.error);
      return null;
    }

    const data = result.data;
    
    // Extract all leads from response - match real implementation structure
    const leads: LinkedInLead[] = [];
    
    // Try different response formats (matching real API route parsing - EXACT structure)
    let peopleArray: any[] = [];
    
    // Real API returns nested structure - match EXACTLY what the real route does
    const leadsData = 
      data?.response?.data ||           // Top-level response.data
      data?.response?.results ||         // Top-level response.results
      data?.response?.leads ||           // Top-level response.leads
      data?.data?.response?.data ||      // Nested data.response.data (MOST COMMON)
      data?.data?.data ||                // Nested data.data
      (Array.isArray(data?.data) ? data.data : null) || // data.data as array
      (Array.isArray(data?.response) ? data.response : null); // response as array
    
    if (leadsData && Array.isArray(leadsData)) {
      peopleArray = leadsData;
    }
    
    // Extract lead information from each person
    for (const person of peopleArray) {
      const firstName = person.firstName || person.first_name || '';
      const lastName = person.lastName || person.last_name || '';
      
      if (firstName || lastName) {
        // Parse geoRegion to extract city/state (real LinkedIn format)
        // Format: "City, State, Country" or "State, Country" or "City, State"
        let city: string | undefined;
        let state: string | undefined;
        const geoRegion = person.geoRegion || person.location || person.geo_region;
        
        if (geoRegion && typeof geoRegion === 'string') {
          const locationParts = geoRegion.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
          const countries = ['united states', 'usa', 'canada', 'uk', 'united kingdom'];
          
          if (locationParts.length >= 3) {
            // "City, State, Country"
            city = locationParts[0];
            state = locationParts[1];
          } else if (locationParts.length === 2) {
            const secondPart = locationParts[1].toLowerCase();
            const isCountry = countries.some(c => secondPart.includes(c));
            if (isCountry) {
              // "State, Country"
              city = '';
              state = locationParts[0];
            } else {
              // "City, State"
              city = locationParts[0];
              state = locationParts[1];
            }
          } else if (locationParts.length === 1) {
            const singlePart = locationParts[0].toLowerCase();
            const isCountry = countries.some(c => singlePart.includes(c));
            if (!isCountry) {
              state = locationParts[0];
            }
          }
          
          // Never set city to country name
          const cityLower = (city || '').toLowerCase();
          if (countries.some(c => cityLower.includes(c))) {
            city = '';
          }
        }
        
        leads.push({
          firstName,
          lastName,
          name: `${firstName} ${lastName}`.trim(),
          city: city || person.city,
          state: state || person.state,
          location: geoRegion || person.location,
        });
      }
    }

    if (leads.length > 0) {
      console.log(`✅ Found ${leads.length} leads from LinkedIn`);
      return leads;
    }

    console.error('❌ Could not extract leads from LinkedIn response');
    console.log('Response structure:', JSON.stringify(data, null, 2).substring(0, 500));
    return null;
  } catch (error) {
    console.error('❌ Error fetching LinkedIn lead:', error);
    return null;
  }
}

/**
 * Test RapidAPI skip-tracing
 */
async function testRapidAPISkipTracing(
  firstName: string,
  lastName: string,
  city?: string,
  state?: string
): Promise<{ phone?: string; email?: string; error?: string }> {
  try {
    console.log('\n📞 Testing RapidAPI skip-tracing...');
    
    const fullName = `${firstName} ${lastName}`.trim();
    let url = '';
    
    if (city && state) {
      const citystatezip = `${city}, ${state}`;
      url = `https://skip-tracing-working-api.p.rapidapi.com/search/bynameaddress?name=${encodeURIComponent(fullName)}&citystatezip=${encodeURIComponent(citystatezip)}&page=1`;
    } else {
      url = `https://skip-tracing-working-api.p.rapidapi.com/search/byname?name=${encodeURIComponent(fullName)}&page=1`;
    }

    const result = await fetchWithRapidAPIFallback(
      url,
      'skip-tracing-working-api.p.rapidapi.com',
      { method: 'GET' },
      [429, 401, 403, 500, 502, 503, 504]
    );

    if (result.error) {
      return { error: result.error };
    }

    const apiResult = result.data;
    
    if (apiResult.error || apiResult.success === false) {
      return { error: apiResult.error || 'Skip-tracing API returned error' };
    }

    const data = apiResult.data || apiResult;
    
    let responseData: any = null;
    if (data.PeopleDetails && Array.isArray(data.PeopleDetails) && data.PeopleDetails.length > 0) {
      responseData = data.PeopleDetails[0];
    } else if (Array.isArray(data) && data.length > 0) {
      responseData = data[0];
    } else if (data && typeof data === 'object' && !data.error) {
      responseData = data;
    }

    if (!responseData) {
      return { error: 'No results from skip-tracing API' };
    }

    // Extract phone
    let phone: string | undefined;
    const phoneValue = responseData.Telephone || responseData.phone || responseData.phone_number || 
                      responseData['Phone Number'] || responseData['Phone'];
    if (phoneValue) {
      phone = String(phoneValue).replace(/[^\d+]/g, '');
      if (phone.startsWith('+1')) {
        phone = phone.substring(2);
      } else if (phone.startsWith('+')) {
        phone = phone.substring(1);
      }
      if (phone.length < 10) {
        phone = undefined;
      }
    }

    // Extract email
    const email = responseData.email || responseData.emailAddress || responseData.email_address;

    return { phone, email };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Main test function
 */
async function runTest() {
  console.log('🧪 ScraperAPI Skip-Tracing Integration Test\n');
  console.log('=' .repeat(60));
  
  // Step 1: Get 25 leads from LinkedIn (one page)
  const leads = await getLinkedInLeads();
  
  if (!leads || leads.length === 0) {
    console.error('\n❌ Could not get leads from LinkedIn');
    console.log('💡 Using test data instead...');
    
    // Use test data
    const testLeads: LinkedInLead[] = [{
      firstName: 'Link',
      lastName: 'Pellow',
      city: 'Dowagiac',
      state: 'Michigan',
      name: 'Link Pellow',
    }];
    
    await testWithLeads(testLeads);
    return;
  }
  
  await testWithLeads(leads);
}

/**
 * Test skip-tracing with multiple leads
 */
async function testWithLeads(leads: LinkedInLead[]) {
  console.log(`\n📋 Testing skip-tracing on ${leads.length} leads`);
  console.log('=' .repeat(60));

  const stats = {
    total: leads.length,
    rapidAPISuccess: 0,
    rapidAPIPhone: 0,
    rapidAPIEmail: 0,
    scraperAPISuccess: 0,
    scraperAPIPhone: 0,
    scraperAPIEmail: 0,
    bothFound: 0,
    scraperAPIFallback: 0, // ScraperAPI found when RapidAPI didn't
    neitherFound: 0,
    errors: 0,
  };

  // Test first 5 leads in detail, then batch test the rest
  const detailedTestCount = Math.min(5, leads.length);
  const batchTestLeads = leads.slice(detailedTestCount);

  console.log(`\n🔍 Detailed testing on first ${detailedTestCount} leads:\n`);

  // Detailed testing on first few leads
  for (let i = 0; i < detailedTestCount; i++) {
    const lead = leads[i];
    if (!lead.firstName || !lead.lastName) continue;

    console.log(`\n[${i + 1}/${detailedTestCount}] ${lead.firstName} ${lead.lastName}`);
    if (lead.city || lead.state) {
      console.log(`   Location: ${lead.city || ''}${lead.city && lead.state ? ', ' : ''}${lead.state || ''}`);
    }

    // Test RapidAPI
    const rapidResult = await testRapidAPISkipTracing(
      lead.firstName,
      lead.lastName,
      lead.city,
      lead.state
    );

    const rapidHasPhone = !!rapidResult.phone;
    const rapidHasEmail = !!rapidResult.email;
    const rapidHasData = rapidHasPhone || rapidHasEmail;

    if (rapidHasData) {
      stats.rapidAPISuccess++;
      if (rapidHasPhone) stats.rapidAPIPhone++;
      if (rapidHasEmail) stats.rapidAPIEmail++;
      console.log(`   RapidAPI: ✅ Phone=${rapidHasPhone ? '✅' : '❌'} Email=${rapidHasEmail ? '✅' : '❌'}`);
    } else {
      console.log(`   RapidAPI: ❌ ${rapidResult.error || 'No data found'}`);
    }

    // Test ScraperAPI
    console.log(`   Testing ScraperAPI...`);
    const scraperResult = await skipTraceWithScraperAPI(
      lead.firstName,
      lead.lastName,
      lead.city,
      lead.state
    );

    const scraperHasPhone = !!scraperResult.phone;
    const scraperHasEmail = !!scraperResult.email;
    const scraperHasData = scraperHasPhone || scraperHasEmail;

    if (scraperHasData) {
      stats.scraperAPISuccess++;
      if (scraperHasPhone) stats.scraperAPIPhone++;
      if (scraperHasEmail) stats.scraperAPIEmail++;
      console.log(`   ScraperAPI: ✅ Phone=${scraperHasPhone ? '✅' : '❌'} Email=${scraperHasEmail ? '✅' : '❌'} (${scraperResult.source || 'unknown'})`);
      
      if (!rapidHasData) {
        stats.scraperAPIFallback++;
        console.log(`   🎉 ScraperAPI fallback worked!`);
      }
    } else {
      console.log(`   ScraperAPI: ❌ ${scraperResult.error || 'No data found'}`);
    }

    if (rapidHasData && scraperHasData) {
      stats.bothFound++;
    } else if (!rapidHasData && !scraperHasData) {
      stats.neitherFound++;
    }

    // Small delay between requests
    if (i < detailedTestCount - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Batch test remaining leads (faster, less verbose)
  if (batchTestLeads.length > 0) {
    console.log(`\n\n⚡ Batch testing remaining ${batchTestLeads.length} leads (summary only)...\n`);
    
    for (let i = 0; i < batchTestLeads.length; i++) {
      const lead = batchTestLeads[i];
      if (!lead.firstName || !lead.lastName) continue;

      try {
        // Test RapidAPI
        const rapidResult = await testRapidAPISkipTracing(
          lead.firstName,
          lead.lastName,
          lead.city,
          lead.state
        );

        const rapidHasData = !!(rapidResult.phone || rapidResult.email);
        if (rapidHasData) {
          stats.rapidAPISuccess++;
          if (rapidResult.phone) stats.rapidAPIPhone++;
          if (rapidResult.email) stats.rapidAPIEmail++;
        }

        // Only test ScraperAPI if RapidAPI failed
        if (!rapidHasData) {
          const scraperResult = await skipTraceWithScraperAPI(
            lead.firstName,
            lead.lastName,
            lead.city,
            lead.state
          );

          const scraperHasData = !!(scraperResult.phone || scraperResult.email);
          if (scraperHasData) {
            stats.scraperAPISuccess++;
            if (scraperResult.phone) stats.scraperAPIPhone++;
            if (scraperResult.email) stats.scraperAPIEmail++;
            stats.scraperAPIFallback++;
          } else {
            stats.neitherFound++;
          }
        } else {
          stats.bothFound++;
        }
      } catch (error) {
        stats.errors++;
        console.error(`   Error with lead ${i + detailedTestCount + 1}: ${error instanceof Error ? error.message : 'Unknown'}`);
      }

      // Progress indicator
      if ((i + 1) % 5 === 0) {
        console.log(`   Processed ${i + 1}/${batchTestLeads.length} leads...`);
      }

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Final summary
  console.log('\n\n' + '=' .repeat(60));
  console.log('📊 FINAL STATISTICS');
  console.log('=' .repeat(60));
  console.log(`Total Leads Tested: ${stats.total}`);
  console.log(`\nRapidAPI Results:`);
  console.log(`  ✅ Found data: ${stats.rapidAPISuccess} (${((stats.rapidAPISuccess / stats.total) * 100).toFixed(1)}%)`);
  console.log(`  📞 Found phone: ${stats.rapidAPIPhone}`);
  console.log(`  📧 Found email: ${stats.rapidAPIEmail}`);
  console.log(`\nScraperAPI Results:`);
  console.log(`  ✅ Found data: ${stats.scraperAPISuccess} (${((stats.scraperAPISuccess / stats.total) * 100).toFixed(1)}%)`);
  console.log(`  📞 Found phone: ${stats.scraperAPIPhone}`);
  console.log(`  📧 Found email: ${stats.scraperAPIEmail}`);
  console.log(`\nFallback Performance:`);
  console.log(`  🎉 ScraperAPI found data when RapidAPI didn't: ${stats.scraperAPIFallback}`);
  console.log(`  ✅ Both methods found data: ${stats.bothFound}`);
  console.log(`  ❌ Neither found data: ${stats.neitherFound}`);
  if (stats.errors > 0) {
    console.log(`  ⚠️  Errors: ${stats.errors}`);
  }
  
  const totalFound = stats.rapidAPISuccess + stats.scraperAPISuccess - stats.bothFound;
  const successRate = ((totalFound / stats.total) * 100).toFixed(1);
  console.log(`\n🎯 Overall Success Rate: ${successRate}% (${totalFound}/${stats.total} leads)`);
  
  if (stats.scraperAPIFallback > 0) {
    console.log(`\n🎉 ScraperAPI fallback is working! Found data for ${stats.scraperAPIFallback} leads that RapidAPI missed.`);
  }

  console.log('\n' + '=' .repeat(60));
  console.log('✅ Test complete! No data was modified.');
}

// Run the test
runTest().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
