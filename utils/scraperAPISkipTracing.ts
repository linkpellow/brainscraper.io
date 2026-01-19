/**
 * ScraperAPI Skip-Tracing Utility
 * 
 * Uses ScraperAPI + HTML parsing to extract phone/email data
 * as an alternative to RapidAPI skip-tracing
 */

import { scrapeWithScraperAPI } from './scraperAPI';
import { extractFromHTML } from './htmlExtractor';

export interface ScraperAPISkipTracingResult {
  phone?: string;
  email?: string;
  error?: string;
  source?: string;
  usedCapsolver?: boolean;
}

/**
 * Build search URLs for different people search sites
 */
function buildSearchUrls(
  firstName: string,
  lastName: string,
  city?: string,
  state?: string
): Array<{ url: string; site: string }> {
  const urls: Array<{ url: string; site: string }> = [];
  
  // Normalize name: remove accents and special characters for URL safety
  const normalizeForUrl = (str: string): string => {
    return str
      .toLowerCase()
      .normalize('NFD') // Decompose accented characters
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^a-z0-9\s-]/g, '') // Remove special chars except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  };
  
  const nameSlug = normalizeForUrl(`${firstName} ${lastName}`);
  
  // ZabaSearch
  if (state) {
    const stateSlug = normalizeForUrl(state);
    const citySlug = city ? normalizeForUrl(city) : '';
    if (city) {
      urls.push({
        url: `https://www.zabasearch.com/people/${nameSlug}/${stateSlug}/${citySlug}/`,
        site: 'zabasearch',
      });
    } else {
      urls.push({
        url: `https://www.zabasearch.com/people/${nameSlug}/${stateSlug}/`,
        site: 'zabasearch',
      });
    }
  }
  
  // FastPeopleSearch
  const locationSlug = city && state ? `${normalizeForUrl(city)}-${normalizeForUrl(state)}` : '';
  if (locationSlug) {
    urls.push({
      url: `https://www.fastpeoplesearch.com/name/${nameSlug}_${locationSlug}`,
      site: 'fastpeoplesearch',
    });
  } else {
    urls.push({
      url: `https://www.fastpeoplesearch.com/name/${nameSlug}`,
      site: 'fastpeoplesearch',
    });
  }
  
  // SearchPeopleFree
  if (state) {
    // Convert full state names to abbreviations
    const stateAbbrMap: Record<string, string> = {
      'alabama': 'al', 'alaska': 'ak', 'arizona': 'az', 'arkansas': 'ar', 'california': 'ca',
      'colorado': 'co', 'connecticut': 'ct', 'delaware': 'de', 'florida': 'fl', 'georgia': 'ga',
      'hawaii': 'hi', 'idaho': 'id', 'illinois': 'il', 'indiana': 'in', 'iowa': 'ia',
      'kansas': 'ks', 'kentucky': 'ky', 'louisiana': 'la', 'maine': 'me', 'maryland': 'md',
      'massachusetts': 'ma', 'michigan': 'mi', 'minnesota': 'mn', 'mississippi': 'ms', 'missouri': 'mo',
      'montana': 'mt', 'nebraska': 'ne', 'nevada': 'nv', 'new hampshire': 'nh', 'new jersey': 'nj',
      'new mexico': 'nm', 'new york': 'ny', 'north carolina': 'nc', 'north dakota': 'nd', 'ohio': 'oh',
      'oklahoma': 'ok', 'oregon': 'or', 'pennsylvania': 'pa', 'rhode island': 'ri', 'south carolina': 'sc',
      'south dakota': 'sd', 'tennessee': 'tn', 'texas': 'tx', 'utah': 'ut', 'vermont': 'vt',
      'virginia': 'va', 'washington': 'wa', 'west virginia': 'wv', 'wisconsin': 'wi', 'wyoming': 'wy',
      'district of columbia': 'dc'
    };
    const stateLower = state.toLowerCase();
    const stateAbbr = state.length === 2 
      ? state.toLowerCase() 
      : (stateAbbrMap[stateLower] || state.substring(0, 2).toLowerCase());
    const citySlug = city ? city.toLowerCase().replace(/\s+/g, '-') : '';
    const citySlugNormalized = city ? normalizeForUrl(city) : '';
    if (citySlugNormalized) {
      urls.push({
        url: `https://www.searchpeoplefree.com/find/${nameSlug}/${stateAbbr}/${citySlugNormalized}`,
        site: 'searchpeoplefree',
      });
    } else {
      urls.push({
        url: `https://www.searchpeoplefree.com/find/${nameSlug}/${stateAbbr}`,
        site: 'searchpeoplefree',
      });
    }
  }
  
  return urls;
}

/**
 * Skip-trace using ScraperAPI + HTML parsing
 */
export async function skipTraceWithScraperAPI(
  firstName: string,
  lastName: string,
  city?: string,
  state?: string
): Promise<ScraperAPISkipTracingResult> {
  try {
    const urls = buildSearchUrls(firstName, lastName, city, state);
    
    if (urls.length === 0) {
      return { error: 'Insufficient location data to build search URLs' };
    }
    
    // Check if verbose logging is enabled (once at function start)
    const verboseLogging = process.env.VERBOSE_SCRAPERAPI_LOGS === 'true';
    
    // Log only essential info (not verbose)
    console.log(`[ScraperAPI] Searching ${urls.length} site(s) for ${firstName} ${lastName}${city && state ? ` (${city}, ${state})` : ''}`);
    
    // Try each URL until we get results
    for (let i = 0; i < urls.length; i++) {
      const { url, site } = urls[i];
      try {
        // Add delay between requests to avoid rate limiting (except for first request)
        if (i > 0) {
          const delayMs = 2000; // 2 second delay between sites
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
        if (verboseLogging) {
          console.log(`[ScraperAPI] Trying ${site} (${i + 1}/${urls.length})...`);
        }
        
        // Use ultra_premium for protected domains (best success rate)
        // FastPeopleSearch and SearchPeopleFree require premium/ultra_premium
        // Note: If your ScraperAPI plan doesn't include premium, these sites will fail
        // The code will automatically retry without premium as a fallback
        const needsUltraPremium = site === 'fastpeoplesearch' || site === 'searchpeoplefree';
        
        const scrapeResult = await scrapeWithScraperAPI(url, {
          render: true, // Use render for JavaScript-heavy sites
          countryCode: 'us',
          ultraPremium: needsUltraPremium, // Use ultra_premium for protected domains
          premium: !needsUltraPremium, // Use regular premium for other sites
        });
        
        // If we got a premium plan error, log it but continue (fallback already tried)
        if (scrapeResult.error && scrapeResult.error.includes('premium not available')) {
          console.log(`[ScraperAPI] ⚠️  Premium required for ${site} but not available on current plan`);
          console.log(`[ScraperAPI] 💡 Consider upgrading ScraperAPI plan for better success rates`);
        }
        
        // Only log scrape result details if verbose logging is enabled
        if (verboseLogging) {
          console.log(`[ScraperAPI] Scrape result for ${site}:`, {
            hasHtml: !!scrapeResult.html,
            htmlLength: scrapeResult.html?.length || 0,
            statusCode: scrapeResult.statusCode,
            error: scrapeResult.error,
            usedCapsolver: scrapeResult.usedCapsolver,
          });
        }
        
        // Handle errors gracefully
        if (scrapeResult.error && !scrapeResult.html) {
          // 404s are expected when person doesn't exist - don't log as error
          if (scrapeResult.statusCode === 404) {
            if (verboseLogging) {
              console.log(`[ScraperAPI] ${site} returned 404 (person may not exist)`);
            }
          } else {
            console.log(`[ScraperAPI] ${site} failed: ${scrapeResult.error}`);
          }
          continue; // Try next site
        }
        
        if (!scrapeResult.html) {
          if (verboseLogging) {
            console.log(`[ScraperAPI] ${site} returned no HTML`);
          }
          continue;
        }
        
        // Skip 404 error pages (they're not real results)
        if (scrapeResult.html.includes('<title>404 Error</title>') || 
            scrapeResult.html.includes('Request failed')) {
          if (verboseLogging) {
            console.log(`[ScraperAPI] ${site} returned error page`);
          }
          continue;
        }
        
        // Log HTML content for debugging (only if verbose logging is needed)
        if (verboseLogging) {
          console.log(`[ScraperAPI Skip-Tracing] HTML from ${site}:`);
          console.log(`  - Length: ${scrapeResult.html.length} bytes`);
          console.log(`  - First 1000 chars: ${scrapeResult.html.substring(0, 1000)}`);
          console.log(`  - Contains "phone": ${scrapeResult.html.toLowerCase().includes('phone')}`);
          console.log(`  - Contains "email": ${scrapeResult.html.toLowerCase().includes('email')}`);
          console.log(`  - Contains "@": ${scrapeResult.html.includes('@')}`);
          console.log(`  - Contains phone pattern: ${/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(scrapeResult.html)}`);
        }
        
        // Extract data from HTML
        const extracted = extractFromHTML(scrapeResult.html, site);
        
        if (verboseLogging) {
          console.log(`[ScraperAPI Skip-Tracing] Extraction results from ${site}:`, {
            phone: extracted.phone || 'NOT FOUND',
            email: extracted.email || 'NOT FOUND',
            address: extracted.address ? 'FOUND' : 'NOT FOUND',
            age: extracted.age || 'NOT FOUND',
          });
        }
        
        // Check if we got useful data
        if (extracted.phone || extracted.email) {
          console.log(`[ScraperAPI] ✅ Found data from ${site}: phone=${!!extracted.phone}, email=${!!extracted.email}`);
          
          return {
            phone: extracted.phone,
            email: extracted.email,
            source: site,
            usedCapsolver: scrapeResult.usedCapsolver,
          };
        }
        
        // No extractable data - continue silently (only log if verbose)
        if (verboseLogging) {
          console.log(`[ScraperAPI] ${site} returned no extractable data`);
        }
        
        if (verboseLogging) {
          console.log(`[ScraperAPI Skip-Tracing] Full HTML sample (first 2000 chars):`);
          console.log(scrapeResult.html.substring(0, 2000));
        }
      } catch (error) {
        console.error(`[ScraperAPI Skip-Tracing] Error with ${site}:`, error);
        continue; // Try next site
      }
    }
    
    // All sites failed or returned no data
    console.log(`[ScraperAPI] No results found from any search site`);
    return { error: 'No results found from any search site' };
  } catch (error) {
    console.error('[ScraperAPI Skip-Tracing] Error:', error);
    return { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
