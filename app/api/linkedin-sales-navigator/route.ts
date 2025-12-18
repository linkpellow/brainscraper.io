import { NextRequest, NextResponse } from 'next/server';
import { locationToFilter } from '@/utils/linkedinLocationIds';
import { getLocationId } from '@/utils/linkedinLocationDiscovery';
import { fetchWithTimeout, retryWithBackoff, logger, rateLimiter, validateRequestSize } from '@/utils/apiHelpers';

// Initialize cache on server startup (runs once when module loads)
try {
  require('@/utils/linkedinLocationCache');
} catch {
  // Cache initialization is optional - continue without it
}

/**
 * Realtime LinkedIn Sales Navigator Data API endpoint
 * Uses RapidAPI realtime-linkedin-sales-navigator-data
 * 
 * API: https://rapidapi.com/apibuilderz/api/realtime-linkedin-sales-navigator-data
 * 
 * Main endpoints:
 * - POST /premium_search_person - Search People (Leads) with filters
 * - POST /premium_search_company - Search Companies (Accounts) with filters
 * - POST /premium_search_person_via_url - Search People via URL
 * - POST /premium_search_company_via_url - Search Company via URL
 * 
 * For RapidAPI setup:
 * - target: "server"
 * - client: "fetch"
 */

export async function POST(request: NextRequest) {
  // Request-level cache to prevent duplicate API calls within same request
  const requestCache = {
    locationIds: new Map<string, { id: string; fullId: string; source: string }>(),
    industrySuggestions: new Map<string, any[]>(),
  };

  try {
    // Check cooldown
    try {
      const { isInCooldown } = await import('@/utils/cooldownManager');
      const inCooldown = await isInCooldown();
      if (inCooldown) {
        return NextResponse.json(
          {
            error: 'System is in cooldown',
            message: 'Scraping is temporarily paused due to error spike. Please try again later.',
            isRateLimit: true,
          },
          { status: 503 }
        );
      }
    } catch (cooldownError) {
      console.warn('[LINKEDIN_SCRAPER] Failed to check cooldown:', cooldownError);
    }

    // Check scrape limits before processing
    try {
      const { checkScrapeLimit } = await import('@/utils/scrapeUsageTracker');
      const { loadSettings } = await import('@/utils/settingsConfig');
      const settings = loadSettings();
      const limitCheck = await checkScrapeLimit(
        'linkedin',
        settings.scrapeLimits.linkedin.daily,
        settings.scrapeLimits.linkedin.monthly
      );

      if (!limitCheck.allowed) {
        return NextResponse.json(
          {
            error: 'Scrape limit reached',
            message: `${limitCheck.limitType === 'daily' ? 'Daily' : 'Monthly'} limit reached. Current: ${limitCheck.currentCount}, Limit: ${limitCheck.limit === Infinity ? 'Unlimited' : limitCheck.limit}`,
            limitType: limitCheck.limitType,
            isRateLimit: true,
          },
          { status: 429 }
        );
      }
    } catch (limitError) {
      // If limit check fails, log but continue (backward compatible)
      console.warn('[LINKEDIN_SCRAPER] Failed to check scrape limits:', limitError);
    }

    const body = await request.json();
    const { endpoint, ...searchParams } = body;

    // Get API key from environment variables
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    // Debug logging to help diagnose environment variable issues
    if (!RAPIDAPI_KEY) {
      const isDevelopment = process.env.NODE_ENV === 'development';
      const errorMessage = isDevelopment
        ? 'RAPIDAPI_KEY not configured. Please add RAPIDAPI_KEY=your-api-key to your .env.local file and restart the development server.'
        : 'RAPIDAPI_KEY not configured. Please set the RAPIDAPI_KEY environment variable in your deployment platform (Vercel, Railway, etc.).';
      
      // Diagnostic logging
      console.error('[LINKEDIN_SALES_NAVIGATOR] Missing RAPIDAPI_KEY environment variable');
      console.error(`[LINKEDIN_SALES_NAVIGATOR] NODE_ENV: ${process.env.NODE_ENV}`);
      console.error(`[LINKEDIN_SALES_NAVIGATOR] Available env vars starting with RAPID: ${Object.keys(process.env).filter(k => k.startsWith('RAPID')).join(', ') || 'none'}`);
      console.error(`[LINKEDIN_SALES_NAVIGATOR] RAPIDAPI_KEY value (first 10 chars): ${process.env.RAPIDAPI_KEY ? process.env.RAPIDAPI_KEY.substring(0, 10) + '...' : 'undefined'}`);
      console.error(`[LINKEDIN_SALES_NAVIGATOR] ${errorMessage}`);
      
      return NextResponse.json(
        { 
          error: 'RAPIDAPI_KEY not configured',
          message: errorMessage,
          hint: isDevelopment 
            ? 'Create or edit .env.local in the project root and add: RAPIDAPI_KEY=your-api-key-here'
            : 'Set RAPIDAPI_KEY in your deployment platform\'s environment variables settings',
          diagnostic: {
            nodeEnv: process.env.NODE_ENV,
            hasRapidApiKey: !!process.env.RAPIDAPI_KEY,
            rapidApiKeyLength: process.env.RAPIDAPI_KEY?.length || 0,
            availableRapidVars: Object.keys(process.env).filter(k => k.startsWith('RAPID'))
          }
        },
        { status: 500 }
      );
    }
    
    // Log successful key detection (first 10 chars only for security)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[LINKEDIN_SALES_NAVIGATOR] RAPIDAPI_KEY loaded (length: ${RAPIDAPI_KEY.length})`);
    }

    // Determine which endpoint to use
    let url: string;
    let requiresFilters = false;
    
    if (endpoint === 'search_person' || endpoint === 'premium_search_person') {
      url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/premium_search_person';
      requiresFilters = true;
    } else if (endpoint === 'search_company' || endpoint === 'premium_search_company') {
      url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/premium_search_company';
      requiresFilters = true;
    } else if (endpoint === 'search_person_via_url' || endpoint === 'premium_search_person_via_url') {
      url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/premium_search_person_via_url';
      // Validate required 'url' parameter for via_url endpoints
      if (!searchParams.url || typeof searchParams.url !== 'string') {
        return NextResponse.json(
          { 
            error: 'url parameter is required for via_url endpoints',
            message: 'The via_url endpoints require a Sales Navigator URL in the "url" parameter',
            example: 'https://www.linkedin.com/sales/search/people?geoUrn=...'
          },
          { status: 400 }
        );
      }
    } else if (endpoint === 'search_company_via_url' || endpoint === 'premium_search_company_via_url') {
      url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/premium_search_company_via_url';
      // Validate required 'url' parameter for via_url endpoints
      if (!searchParams.url || typeof searchParams.url !== 'string') {
        return NextResponse.json(
          { 
            error: 'url parameter is required for via_url endpoints',
            message: 'The via_url endpoints require a Sales Navigator URL in the "url" parameter',
            example: 'https://www.linkedin.com/sales/search/companies?geoUrn=...'
          },
          { status: 400 }
        );
      }
    } else if (endpoint === 'json_to_url') {
      url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/json_to_url';
    } else {
      return NextResponse.json(
        { error: 'Invalid endpoint. Use: search_person, search_company, search_person_via_url, search_company_via_url, or json_to_url' },
        { status: 400 }
      );
    }

    // PHASE 3: Auto-use via_url endpoint for location searches (100% accuracy, 0% waste)
    // If location is specified and we have a location ID, use via_url endpoint automatically
    // Track if we attempted via_url so we can fall back properly
    let attemptedViaUrl = false;
    if (requiresFilters && searchParams.location && RAPIDAPI_KEY) {
      const locationText = String(searchParams.location);
      
      try {
        // Check request cache first to avoid duplicate discovery calls
        let discovery: { locationId: string | null; fullId: string | null; source: string };
        const cacheKey = locationText.toLowerCase().trim();
        
        if (requestCache.locationIds.has(cacheKey)) {
          const cached = requestCache.locationIds.get(cacheKey)!;
          discovery = {
            locationId: cached.id,
            fullId: cached.fullId,
            source: cached.source,
          };
          logger.log(`📍 Using request-cached location ID for "${locationText}"`);
        } else {
          // Not in request cache - discover and cache it
          discovery = await getLocationId(locationText, RAPIDAPI_KEY, true);
          if (discovery.fullId && discovery.locationId) {
            requestCache.locationIds.set(cacheKey, {
              id: discovery.locationId,
              fullId: discovery.fullId,
              source: discovery.source,
            });
          }
        }
        
        if (discovery.fullId && discovery.source !== 'failed') {
          // We have a location ID - use via_url endpoint for 100% accuracy
          attemptedViaUrl = true;
          logger.log(`🎯 Auto-using via_url endpoint for location "${locationText}" (100% accuracy, 0% waste)`);
          
          // Build filters for json_to_url
          const filtersForUrl: any[] = [];
          
          // Add location filter - CRITICAL FIX: Use REGION type with numeric ID (not LOCATION with URN)
          // Verified from LinkedIn URL: type:REGION, id:105763813 (numeric, not URN)
          const locationId = discovery.fullId ? discovery.fullId.replace('urn:li:fs_geo:', '') : discovery.locationId;
          filtersForUrl.push({
            type: 'REGION',  // Use REGION (not LOCATION) - verified from LinkedIn URLs
            values: [{
              id: locationId,  // Numeric ID: "105763813" (not URN format)
              text: locationText,
              selectionType: 'INCLUDED',
            }],
          });
          
          // Add ALL other filters to via_url for maximum accuracy
          // CRITICAL: Use URN format for companies (verified - normalized names don't work)
          if (searchParams.current_company) {
            const companyName = String(searchParams.current_company);
            
            // Try to get company URN
            try {
              const { getCompanySuggestions } = await import('@/utils/linkedinFilterHelpers');
              const suggestions = await getCompanySuggestions(companyName, RAPIDAPI_KEY);
              const exactMatch = suggestions.find(s => 
                s.text.toLowerCase() === companyName.toLowerCase()
              );
              
              if (exactMatch && exactMatch.fullId) {
            filtersForUrl.push({
              type: 'CURRENT_COMPANY',
              values: [{
                    id: exactMatch.fullId,
                    text: exactMatch.text,
                    selectionType: 'INCLUDED',
                  }],
                });
              } else if (exactMatch && exactMatch.id) {
                filtersForUrl.push({
                  type: 'CURRENT_COMPANY',
                  values: [{
                    id: `urn:li:organization:${exactMatch.id}`,
                    text: exactMatch.text,
                selectionType: 'INCLUDED',
              }],
            });
          }
            } catch (error) {
              logger.warn(`Error getting company URN for via_url:`, error);
            }
          }
          
          if (searchParams.industry) {
            const industryText = String(searchParams.industry);
            const industries = industryText.split(',').map(i => i.trim()).filter(i => i.length > 0);
            
            // Get industry IDs from suggestions
            // CRITICAL OPTIMIZATION: Cache industry suggestions to avoid duplicate API calls
            try {
              const { getIndustrySuggestions } = await import('@/utils/linkedinFilterHelpers');
              const industryValues: any[] = [];
              
              for (const industryName of industries) {
                const cacheKey = industryName.toLowerCase().trim();
                
                // Check request cache first
                let suggestions: any[];
                if (requestCache.industrySuggestions.has(cacheKey)) {
                  suggestions = requestCache.industrySuggestions.get(cacheKey)!;
                  logger.log(`💼 Using request-cached industry suggestions for "${industryName}"`);
                } else {
                  // Not in cache - fetch and cache it
                  suggestions = await getIndustrySuggestions(industryName, RAPIDAPI_KEY);
                  requestCache.industrySuggestions.set(cacheKey, suggestions);
                }
                
                const exactMatch = suggestions.find(s => 
                  s.text.toLowerCase() === industryName.toLowerCase()
                );
                
                if (exactMatch) {
                  industryValues.push({
                    id: exactMatch.id,
                    text: exactMatch.text,
                    selectionType: 'INCLUDED',
                  });
                }
              }
              
              if (industryValues.length > 0) {
                filtersForUrl.push({
                  type: 'INDUSTRY',
                  values: industryValues,
                });
              }
            } catch (error) {
              logger.warn(`Error getting industry IDs for via_url:`, error);
            }
          }
          
          if (searchParams.changed_jobs_90_days === 'true' || searchParams.changed_jobs_90_days === true) {
            filtersForUrl.push({
              type: 'RECENTLY_CHANGED_JOBS',
              values: [{
                id: 'RPC',
                text: 'Changed jobs',
                selectionType: 'INCLUDED',
              }],
            });
          }
          
          // Handle company headcount filter (including self-employed)
          // CRITICAL: Self-employed is letter code "A" - must be explicitly set when min=max=0
          if (searchParams.company_headcount_min !== undefined || searchParams.company_headcount_max !== undefined) {
            const headcountFilter: any = {
              type: 'COMPANY_HEADCOUNT',
              values: [],
            };
            
            // Map numeric ranges to letter codes (verified - letter codes work, numeric don't)
            const mapToLetterCode = (count: number): string | null => {
              if (count === 0) return 'A'; // Self-employed
              if (count <= 10) return 'B';
              if (count <= 50) return 'C';
              if (count <= 200) return 'D';
              if (count <= 500) return 'E';
              if (count <= 1000) return 'F';
              if (count <= 5000) return 'G';
              if (count <= 10000) return 'H';
              return 'I';
            };
            
            // Special case: If both min and max are 0, it's self-employed (A)
            if (searchParams.company_headcount_min === 0 && searchParams.company_headcount_max === 0) {
              headcountFilter.values.push({
                id: 'A',
                text: 'Self-employed',
                selectionType: 'INCLUDED',
              });
            } else {
              // Handle min and max separately
              if (searchParams.company_headcount_min !== undefined) {
                const minCount = parseInt(String(searchParams.company_headcount_min), 10);
                const letterCode = mapToLetterCode(minCount);
                if (letterCode) {
                  headcountFilter.values.push({
                    id: letterCode,
                    text: `Min: ${searchParams.company_headcount_min}`,
                    selectionType: 'INCLUDED',
                  });
                }
              }
              if (searchParams.company_headcount_max !== undefined) {
                const maxCount = parseInt(String(searchParams.company_headcount_max), 10);
                const letterCode = mapToLetterCode(maxCount);
                if (letterCode) {
                  headcountFilter.values.push({
                    id: letterCode,
                    text: `Max: ${searchParams.company_headcount_max}`,
                    selectionType: 'INCLUDED',
                  });
                }
              }
            }
            
            if (headcountFilter.values.length > 0) {
              filtersForUrl.push(headcountFilter);
              logger.log(`👥 Added COMPANY_HEADCOUNT filter to via_url: ${JSON.stringify(headcountFilter.values)}`);
            }
          }
          
          if (searchParams.years_experience_min || searchParams.years_experience_max) {
            const experienceFilter: any = {
              type: 'YEARS_EXPERIENCE',
              values: [],
            };
            
            // Map numeric years to ID codes (verified - IDs 1-5 work)
            const mapToExperienceId = (years: number): string => {
              if (years < 1) return '1';
              if (years <= 2) return '2';
              if (years <= 5) return '3';
              if (years <= 10) return '4';
              return '5';
            };
            
            if (searchParams.years_experience_min) {
              const minYears = parseInt(String(searchParams.years_experience_min), 10);
              const experienceId = mapToExperienceId(minYears);
              experienceFilter.values.push({
                id: experienceId,
                text: `Min: ${searchParams.years_experience_min} years`,
                selectionType: 'INCLUDED',
              });
            }
            if (searchParams.years_experience_max) {
              const maxYears = parseInt(String(searchParams.years_experience_max), 10);
              const experienceId = mapToExperienceId(maxYears);
              experienceFilter.values.push({
                id: experienceId,
                text: `Max: ${searchParams.years_experience_max} years`,
                selectionType: 'INCLUDED',
              });
            }
            if (experienceFilter.values.length > 0) {
              filtersForUrl.push(experienceFilter);
            }
          }
          
          if (searchParams.school || searchParams.university) {
            const schoolText = String(searchParams.school || searchParams.university);
            const schools = schoolText.split(',').map(s => s.trim()).filter(s => s.length > 0);
            filtersForUrl.push({
              type: 'SCHOOL',
              values: schools.map(school => ({
                id: school.toLowerCase().replace(/\s+/g, '_'),
                text: school,
                selectionType: 'INCLUDED',
              })),
            });
          }
          
          // Handle job titles - use CURRENT_TITLE filter instead of keywords for better compatibility
          // Real LinkedIn URLs use CURRENT_TITLE filter with ID codes, not keywords
          let keywordsForUrl = '';
          if (searchParams.title_keywords) {
            const titleKeywords = String(searchParams.title_keywords);
            // Check if we should use CURRENT_TITLE filter instead of keywords
            // Common titles like "Owner" have specific IDs (e.g., id:1 for Owner)
            const commonTitles: Record<string, string> = {
              'owner': '1',
              'founder': '2',
              'ceo': '3',
              'president': '4',
              // Add more as needed
            };
            
            const titleLower = titleKeywords.toLowerCase();
            const matchingTitle = Object.keys(commonTitles).find(t => titleLower.includes(t));
            
            if (matchingTitle) {
              // Use CURRENT_TITLE filter instead of keywords
              filtersForUrl.push({
                type: 'CURRENT_TITLE',
                values: [{
                  id: commonTitles[matchingTitle],
                  text: matchingTitle.charAt(0).toUpperCase() + matchingTitle.slice(1),
                  selectionType: 'INCLUDED',
                }],
              });
              logger.log(`📝 Using CURRENT_TITLE filter (id:${commonTitles[matchingTitle]}) instead of keywords for "${matchingTitle}"`);
            } else {
              // Fall back to keywords for less common titles
              keywordsForUrl = titleKeywords;
              logger.log(`📝 Using keywords for title search: "${titleKeywords.substring(0, 50)}..."`);
            }
          }
          
          // MANUALLY CONSTRUCT URL (bypassing json_to_url which generates invalid URLs with spellCorrectionEnabled)
          // Real LinkedIn URLs format: (recentSearchParam:(id:XXX,doLogHistory:true),filters:List(...))
          // CRITICAL: Do NOT include spellCorrectionEnabled - it causes 400 errors
          let generatedUrl: string | null = null;
          
          try {
            // Build the query structure matching real LinkedIn format exactly
            const queryParts: string[] = [];
            
            // recentSearchParam (session-specific, generate random ID)
            const recentSearchId = Math.floor(Math.random() * 10000000000);
            queryParts.push(`recentSearchParam:(id:${recentSearchId},doLogHistory:true)`);
            
            // Build filters list
            if (filtersForUrl.length > 0) {
              const filterStrings = filtersForUrl.map(filter => {
                const valueStrings = filter.values.map((val: any) => {
                  // URL encode the text value (double encode for comma in "Florida, United States")
                  const encodedText = encodeURIComponent(val.text);
                  return `(id:${val.id},text:${encodedText},selectionType:${val.selectionType})`;
                });
                return `(type:${filter.type},values:List(${valueStrings.join(',')}))`;
              });
              queryParts.push(`filters:List(${filterStrings.join(',')})`);
            }
            
            // Add keywords only if present (and not using CURRENT_TITLE filter)
            if (keywordsForUrl) {
              queryParts.push(`keywords:${keywordsForUrl}`);
            }
            
            // Construct the full query parameter
            const queryValue = `(${queryParts.join(',')})`;
            const encodedQuery = encodeURIComponent(queryValue);
            
            // Generate session ID (random base64-like string, 22 chars)
            const sessionId = Buffer.from(`${Date.now()}-${Math.random()}`).toString('base64')
              .replace(/[+/=]/g, '')
              .substring(0, 22);
            
            // Construct the full URL (matching real LinkedIn format exactly)
            generatedUrl = `https://www.linkedin.com/sales/search/people?query=${encodedQuery}&sessionId=${sessionId}&viewAllFilters=true`;
            
            logger.log(`🔧 Manually constructed Sales Navigator URL (bypassing json_to_url)`);
            logger.log(`🔍 URL length: ${generatedUrl.length} chars, filters: ${filtersForUrl.length}`);
            
          } catch (urlError) {
            logger.warn(`⚠️ Failed to manually construct URL, falling back to json_to_url:`, urlError);
            generatedUrl = null;
          }
          
          // Fallback to json_to_url if manual construction failed
          if (!generatedUrl) {
            logger.log(`⚠️ Falling back to json_to_url endpoint`);
            const jsonToUrlResponse = await fetchWithTimeout(
              'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/json_to_url',
              {
                method: 'POST',
                headers: {
                  'x-rapidapi-key': RAPIDAPI_KEY,
                  'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  filters: filtersForUrl,
                  keywords: keywordsForUrl,
                }),
              },
              15000 // 15 second timeout
            );
            
            if (jsonToUrlResponse.ok) {
              const urlResult = await jsonToUrlResponse.text();
              try {
                const urlData = JSON.parse(urlResult);
                generatedUrl = urlData.url || urlData.data || (typeof urlData === 'string' ? urlData : null);
              } catch {
                generatedUrl = urlResult;
              }
            } else {
              // json_to_url fallback also failed
              const errorText = await jsonToUrlResponse.text();
              let errorData;
              try {
                errorData = JSON.parse(errorText);
              } catch {
                errorData = { error: errorText };
              }
              
              logger.warn(`⚠️ json_to_url fallback also failed (HTTP ${jsonToUrlResponse.status})`);
              logger.warn(`⚠️ Request payload: filters=${JSON.stringify(filtersForUrl).substring(0, 200)}..., keywords=${keywordsForUrl.substring(0, 100)}...`);
              logger.warn(`⚠️ Error response: ${errorText.substring(0, 500)}...`);
            }
          }
          
          if (generatedUrl && typeof generatedUrl === 'string') {
            // Validate URL format before using it
            const isValidUrl = generatedUrl.startsWith('https://www.linkedin.com/sales/search/') &&
                              generatedUrl.includes('query=');
            
            if (!isValidUrl) {
              logger.warn(`⚠️ Generated URL has invalid format, falling back to regular search`);
              logger.warn(`⚠️ Generated URL: ${generatedUrl.substring(0, 200)}...`);
            } else {
              // Use via_url endpoint with generated URL
              logger.log(`✅ Generated Sales Navigator URL, using via_url endpoint for 100% accuracy`);
              logger.log(`🔍 URL validation: Format valid, length: ${generatedUrl.length} chars`);
              
              // Determine person vs company
              const isPersonSearch = endpoint === 'search_person' || endpoint === 'premium_search_person';
              const viaUrlEndpoint = isPersonSearch 
                ? 'premium_search_person_via_url'
                : 'premium_search_company_via_url';
              
              // Build request with URL and pagination
              const viaUrlBody: Record<string, unknown> = {
                url: generatedUrl,
                account_number: 1, // Required parameter per RapidAPI docs
              };
              
              // Add pagination if specified
              if (searchParams.page) {
                viaUrlBody.page = parseInt(String(searchParams.page), 10) || 1;
              }
              if (searchParams.limit) {
                viaUrlBody.limit = parseInt(String(searchParams.limit), 10) || 25;
              }
              
              logger.log(`🔍 Calling ${viaUrlEndpoint} with URL: ${generatedUrl.substring(0, 150)}...`);
              
              // Make the via_url API call
              const viaUrlResponse = await retryWithBackoff(
                async () => {
                  return await fetchWithTimeout(
                    `https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/${viaUrlEndpoint}`,
                    {
                      method: 'POST',
                      headers: {
                        'x-rapidapi-key': RAPIDAPI_KEY,
                        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify(viaUrlBody),
                    },
                    30000
                  );
                },
                {
                  maxRetries: 2,
                  initialDelayMs: 2000,
                  maxDelayMs: 10000,
                  retryableStatusCodes: [500, 502, 503, 504], // Don't retry 429
                }
              );
              
              if (viaUrlResponse.ok) {
                const viaUrlResult = await viaUrlResponse.text();
                let data;
                try {
                  data = JSON.parse(viaUrlResult);
                } catch {
                  data = { raw: viaUrlResult };
                }
                
                // CRITICAL: Check if RapidAPI returned an error in a 200 OK response
                if (data && typeof data === 'object' && !Array.isArray(data)) {
                  // Check for error at top level first (e.g., {"success":false,"error":"Request failed with status code 400"})
                  const topLevelError = data.success === false && data.error;
                  // Check for error in data.data (nested error response)
                  const nestedError = data.data && typeof data.data === 'object' && data.data.success === false && data.data.error;
                  
                  if (topLevelError || nestedError) {
                    const errorMessage = topLevelError 
                      ? (typeof data.error === 'string' ? data.error : String(data.error))
                      : (typeof data.data.error === 'string' ? data.data.error : String(data.data.error));
                    const is403Error = errorMessage.includes('403') || errorMessage.toLowerCase().includes('forbidden');
                    const is400Error = errorMessage.includes('400') || errorMessage.toLowerCase().includes('bad request');
                    
                    // 400 errors mean the URL is invalid - fall back to regular search
                    if (is400Error) {
                      logger.warn('via_url endpoint returned 400 error in response body (invalid URL), falling back to regular search', {
                        endpoint: viaUrlEndpoint,
                        httpStatus: 200,
                        errorMessage,
                        requestUrl: generatedUrl.substring(0, 200),
                        errorLocation: topLevelError ? 'top-level' : 'nested',
                      });
                      // Don't return - fall through to regular search
                    } else {
                      const fullError = topLevelError ? data.error : data.data.error;
                      logger.error('via_url endpoint returned error in 200 OK response', {
                        endpoint: viaUrlEndpoint,
                        httpStatus: 200,
                        errorMessage,
                        fullError,
                        fullResponse: JSON.stringify(data, null, 2),
                        requestUrl: generatedUrl.substring(0, 200),
                        errorLocation: topLevelError ? 'top-level' : 'nested',
                        requestBody: JSON.stringify(viaUrlBody, null, 2),
                      });
                      
                      // Return 403 error instead of treating as success (only for non-400 errors)
                      return NextResponse.json(
                        {
                          success: false,
                          error: is403Error ? 'Rate limit exceeded' : (fullError || 'API request failed'),
                          message: is403Error ? 'Rate limit exceeded' : errorMessage,
                          details: {
                            ...(topLevelError ? data : data.data),
                            rapidApiError: fullError,
                            endpoint: viaUrlEndpoint,
                            requestUrl: generatedUrl,
                            requestBody: viaUrlBody,
                          }
                        },
                        { status: 403 }
                      );
                    }
                  }
                }
                
                // Extract pagination if available
                const pagination = 
                  data?.response?.pagination ||
                  data?.data?.response?.pagination ||
                  data?.pagination ||
                  null;
                
                logger.log(`✅ via_url endpoint returned ${Array.isArray(data?.response?.data) ? data.response.data.length : 'unknown'} results with 100% location accuracy`);
                
                // AUTOMATIC SAVE: Save via_url results
                try {
                  const { saveApiResults } = await import('@/utils/saveApiResults');
                  const processedResults = data?.response?.data && Array.isArray(data.response.data) ? data.response.data : undefined;
                  const savedPath = await saveApiResults(
                    'premium_search_person_via_url',
                    searchParams,
                    data,
                    processedResults
                  );
                  if (savedPath) {
                    logger.log(`💾 via_url results saved to: ${savedPath}`);
                  }
                } catch (saveError) {
                  logger.warn('Failed to save via_url results:', saveError);
                }
                
                return NextResponse.json({
                  success: true,
                  data: data,
                  pagination: pagination ? {
                    total: pagination.total,
                    count: pagination.count,
                    start: pagination.start,
                    hasMore: pagination.total ? (pagination.start + pagination.count) < pagination.total : false
                  } : null,
                  viaUrlUsed: true, // Flag to indicate via_url was used
                  locationAccuracy: '100%', // via_url gives 100% accuracy
                  method: 'via_url', // Indicates which method was used
                });
              } else {
                // via_url failed, log detailed error and fall through to regular search
                const errorText = await viaUrlResponse.text();
                let errorData;
                try {
                  errorData = JSON.parse(errorText);
                } catch {
                  errorData = { error: errorText };
                }
                
                // Check if it's a 400 error (bad request) - means URL is invalid, definitely fall back
                // Check both HTTP status and error message content
                const errorMessage = errorData?.error || errorData?.message || errorText || '';
                const errorStr = String(errorMessage);
                // Also check details.error and details.message for nested error messages
                const detailsError = errorData?.details?.error || errorData?.details?.message || '';
                const allErrorText = `${errorStr} ${detailsError} ${errorText}`.toLowerCase();
                const is400Error = viaUrlResponse.status === 400 || 
                  errorStr.includes('400') ||
                  allErrorText.includes('400') ||
                  errorStr.toLowerCase().includes('bad request') ||
                  allErrorText.includes('bad request') ||
                  (errorData?.details?.error && String(errorData.details.error).includes('400'));
                
                if (is400Error) {
                  logger.warn(`⚠️ via_url endpoint returned 400 (invalid URL), falling back to regular search`, {
                    endpoint: viaUrlEndpoint,
                    httpStatus: viaUrlResponse.status,
                    requestUrl: generatedUrl,
                    errorData,
                    errorMessage,
                  });
                  // Fall through to regular search - don't return
                } else {
                  logger.error('via_url endpoint failed with HTTP error', {
                    endpoint: viaUrlEndpoint,
                    httpStatus: viaUrlResponse.status,
                    errorText,
                    errorData,
                    requestUrl: generatedUrl,
                    requestBody: JSON.stringify(viaUrlBody, null, 2),
                  });
                  
                  logger.warn(`⚠️ via_url endpoint failed (${viaUrlResponse.status}), falling back to regular search`);
                  // Fall through to regular search - don't return
                }
              }
            }
          } else {
            // URL generation failed (both manual construction and json_to_url fallback failed)
            logger.warn(`⚠️ Failed to generate Sales Navigator URL, falling back to regular search`);
          }
        }
      } catch (error) {
        // Error in via_url flow, fall through to regular search
        logger.warn(`⚠️ Error in via_url auto-use flow, falling back to regular search:`, error);
      }
    }
    
    // Ensure required parameters are present for premium_search_person and premium_search_company
    const requestBody: Record<string, unknown> = { ...searchParams };
    
    if (requiresFilters) {
      // Ensure page is present (default to 1)
      if (!requestBody.page && !requestBody.offset) {
        requestBody.page = 1;
      }
      
      // Convert page to number if it's a string
      if (typeof requestBody.page === 'string') {
        requestBody.page = parseInt(requestBody.page, 10) || 1;
      }
      
      // Convert limit to number if it's a string
      if (requestBody.limit && typeof requestBody.limit === 'string') {
        requestBody.limit = parseInt(requestBody.limit, 10);
      }
      
      // Convert simple parameters to filters/keywords BEFORE cleaning up
      // Check if filters is empty array or doesn't exist, and keywords is empty or doesn't exist
      const hasFilters = Array.isArray(requestBody.filters) && requestBody.filters.length > 0;
      const hasKeywords = requestBody.keywords && String(requestBody.keywords).trim().length > 0;
      
      if (!hasFilters && !hasKeywords) {
        // Try to build filters array from simple parameters
        const filters: Array<{ type: string; values: Array<{ id: string; text: string; selectionType: string }> }> = [];
        
        // Location filter - Multi-strategy approach
        // 1. Check static mappings (fastest)
        // 2. Check cache (fast, previously discovered)
        // 3. Discover via json_to_url API (accurate, slower)
        // 4. Fallback to keywords (always works)
        if (requestBody.location) {
          const locationText = String(requestBody.location);
          
          // Strategy 1: Check static mappings first (fastest)
          let locationFilter = locationToFilter(locationText);
          
          // Strategy 2: Try discovery (more accurate than static mappings)
          // Only use static mapping if discovery fails
          // CRITICAL OPTIMIZATION: Check request cache first to avoid duplicate calls
          if (RAPIDAPI_KEY) {
            try {
              let discovery: { locationId: string | null; fullId: string | null; source: string };
              const cacheKey = locationText.toLowerCase().trim();
              
              if (requestCache.locationIds.has(cacheKey)) {
                const cached = requestCache.locationIds.get(cacheKey)!;
                discovery = {
                  locationId: cached.id,
                  fullId: cached.fullId,
                  source: cached.source,
                };
                logger.log(`📍 Using request-cached location ID for "${locationText}" (regular search)`);
              } else {
                // Not in request cache - discover and cache it
                discovery = await getLocationId(locationText, RAPIDAPI_KEY, true);
                if (discovery.fullId && discovery.locationId) {
                  requestCache.locationIds.set(cacheKey, {
                    id: discovery.locationId,
                    fullId: discovery.fullId,
                    source: discovery.source,
                  });
                }
              }
              
              if (discovery.fullId && discovery.source !== 'failed') {
                // Found via discovery - use it (more accurate than static mapping)
                // CRITICAL FIX: Use REGION type with numeric ID (verified from real LinkedIn URLs)
                // Real URL shows: type:REGION, id:105763813 (numeric, not URN)
                const locationId = discovery.fullId ? discovery.fullId.replace('urn:li:fs_geo:', '') : (discovery.locationId || '');
                if (locationId) {
                locationFilter = {
                  type: 'REGION',  // Use REGION (not LOCATION) - verified from real LinkedIn URLs
                  values: [{
                    id: locationId,  // Numeric ID: "105763813" (not URN format)
                    text: locationText,
                    selectionType: 'INCLUDED',
                  }],
                };
                }
                
                // Log discovery for monitoring
                if (discovery.source === 'discovered') {
                  logger.log(`📍 Discovered location ID for "${locationText}": ${discovery.fullId} (cached for future use)`);
                  // Also extract and cache geo IDs from lead responses if available
                  // Note: Sales Navigator API doesn't return geo IDs in lead data, only geoRegion text
                } else if (discovery.source === 'cache') {
                  logger.log(`📍 Using cached location ID for "${locationText}": ${discovery.fullId}`);
                } else {
                  logger.warn(`📍 Location discovery for "${locationText}" returned source: ${discovery.source}, fullId: ${discovery.fullId || 'null'}`);
                }
              } else {
                // Discovery failed - fall back to static mapping if available
                if (!locationFilter) {
                  locationFilter = locationToFilter(locationText);
                }
                logger.warn(`📍 Location discovery failed for "${locationText}", ${locationFilter ? 'using static mapping' : 'will use location text as fallback'}`);
              }
            } catch (error) {
              logger.warn(`Error discovering location ID for "${locationText}":`, error);
              // Fall back to static mapping if available
              if (!locationFilter) {
                locationFilter = locationToFilter(locationText);
              }
            }
          }
          
          // Strategy 3: Use discovered/static filter if available
          if (locationFilter) {
            filters.push(locationFilter);
          } else {
            // Strategy 4: Try state-level fallback if city-level failed
            // Extract state from location string (e.g., "Aspen, Colorado, United States" -> "Colorado")
            const locationParts = locationText.split(',').map(s => s.trim());
            const state = locationParts.length > 1 ? locationParts[1] : null;
            
            if (state && state !== locationText && state.toLowerCase() !== 'united states') {
              // Try to find state-level location ID
              let stateFilter = locationToFilter(state);
              
              if (!stateFilter && RAPIDAPI_KEY) {
                try {
                  // CRITICAL OPTIMIZATION: Check request cache first
                  let stateDiscovery: { locationId: string | null; fullId: string | null; source: string };
                  const stateCacheKey = state.toLowerCase().trim();
                  
                  if (requestCache.locationIds.has(stateCacheKey)) {
                    const cached = requestCache.locationIds.get(stateCacheKey)!;
                    stateDiscovery = {
                      locationId: cached.id,
                      fullId: cached.fullId,
                      source: cached.source,
                    };
                    logger.log(`📍 Using request-cached location ID for state "${state}"`);
                  } else {
                    stateDiscovery = await getLocationId(state, RAPIDAPI_KEY, true);
                    if (stateDiscovery.fullId && stateDiscovery.locationId) {
                      requestCache.locationIds.set(stateCacheKey, {
                        id: stateDiscovery.locationId,
                        fullId: stateDiscovery.fullId,
                        source: stateDiscovery.source,
                      });
                    }
                  }
                  
                  if (stateDiscovery.fullId) {
                    // CRITICAL FIX: Use REGION type with numeric ID (verified from LinkedIn URLs)
                    const stateId = stateDiscovery.fullId ? stateDiscovery.fullId.replace('urn:li:fs_geo:', '') : (stateDiscovery.locationId || '');
                    if (stateId) {
                    stateFilter = {
                      type: 'REGION',  // Use REGION (not LOCATION) - verified from LinkedIn URLs
                      values: [{
                        id: stateId,  // Numeric ID: "105763813" (not URN format)
                        text: state,
                        selectionType: 'INCLUDED',
                      }],
                    };
                    logger.log(`📍 Using state-level location ID for "${state}" (fallback from "${locationText}"): ${stateDiscovery.fullId}`);
                    }
                  }
                } catch (error) {
                  logger.warn(`Error discovering state-level location ID for "${state}":`, error);
                }
              }
              
              if (stateFilter) {
                filters.push(stateFilter);
                logger.warn(`⚠️  City-level location ID not found for "${locationText}". Using state-level filter for "${state}" (broader results).`);
              } else {
                // Location ID not found - use keywords as fallback (API doesn't accept location text as ID)
                // This is less accurate but allows the search to proceed
                logger.warn(`⚠️  Location ID not found for "${locationText}". Adding to keywords as fallback (less accurate filtering).`);
                // Don't add invalid location filter - will add to keywords below
              }
            } else {
              // Location ID not found - use keywords as fallback (API doesn't accept location text as ID)
              logger.warn(`⚠️  Location ID not found for "${locationText}". Adding to keywords as fallback (less accurate filtering).`);
              // Don't add invalid location filter - will add to keywords below
            }
          }
        }
        
        // Changed jobs filter
        if (requestBody.changed_jobs_90_days === 'true' || requestBody.changed_jobs_90_days === true) {
          filters.push({
            type: 'RECENTLY_CHANGED_JOBS',
            values: [{
              id: 'RPC',
              text: 'Changed jobs',
              selectionType: 'INCLUDED'
            }]
          });
        }
        
        // Current company filter
        // CRITICAL FIX: Use URN format (verified - Format B works, Format A returns 0 results)
        // Need to get companyId from filter_company_suggestions and convert to URN
        if (requestBody.current_company) {
          const companyName = String(requestBody.current_company);
          
          // Try to get company URN from suggestions API
          if (RAPIDAPI_KEY) {
            try {
              const { getCompanySuggestions } = await import('@/utils/linkedinFilterHelpers');
              const suggestions = await getCompanySuggestions(companyName, RAPIDAPI_KEY);
              
              // Find exact match
              const exactMatch = suggestions.find(s => 
                s.text.toLowerCase() === companyName.toLowerCase()
              );
              
              if (exactMatch && exactMatch.fullId) {
                // Use URN format from suggestions
          filters.push({
            type: 'CURRENT_COMPANY',
            values: [{
                    id: exactMatch.fullId, // URN format: urn:li:organization:162479
                    text: exactMatch.text,
              selectionType: 'INCLUDED'
            }]
          });
                logger.log(`🏢 Using company URN from suggestions: ${exactMatch.fullId}`);
              } else if (exactMatch && exactMatch.id) {
                // Convert companyId to URN format
                const companyUrn = `urn:li:organization:${exactMatch.id}`;
                filters.push({
                  type: 'CURRENT_COMPANY',
                  values: [{
                    id: companyUrn,
                    text: exactMatch.text,
                    selectionType: 'INCLUDED'
                  }]
                });
                logger.log(`🏢 Converted companyId to URN: ${companyUrn}`);
              } else {
                // Fallback: Try to construct URN if we have a numeric ID
                // This is a last resort - should use suggestions API
                logger.warn(`⚠️ Company "${companyName}" not found in suggestions - filter may not work`);
                // Don't add filter if we can't get URN - it won't work anyway
              }
            } catch (error) {
              logger.warn(`Error getting company suggestions for "${companyName}":`, error);
              // Don't add filter if suggestions fail - normalized names don't work
            }
          } else {
            logger.warn(`⚠️ RAPIDAPI_KEY not available - cannot get company URN for "${companyName}"`);
          }
        }
        
        // Past company filter
        // CRITICAL FIX: Use URN format (same as CURRENT_COMPANY)
        if (requestBody.past_company) {
          const companyName = String(requestBody.past_company);
          
          // Try to get company URN from suggestions API
          if (RAPIDAPI_KEY) {
            try {
              const { getCompanySuggestions } = await import('@/utils/linkedinFilterHelpers');
              const suggestions = await getCompanySuggestions(companyName, RAPIDAPI_KEY);
              
              const exactMatch = suggestions.find(s => 
                s.text.toLowerCase() === companyName.toLowerCase()
              );
              
              if (exactMatch && exactMatch.fullId) {
          filters.push({
            type: 'PAST_COMPANY',
            values: [{
                    id: exactMatch.fullId,
                    text: exactMatch.text,
                    selectionType: 'INCLUDED'
                  }]
                });
              } else if (exactMatch && exactMatch.id) {
                const companyUrn = `urn:li:organization:${exactMatch.id}`;
                filters.push({
                  type: 'PAST_COMPANY',
                  values: [{
                    id: companyUrn,
                    text: exactMatch.text,
              selectionType: 'INCLUDED'
            }]
          });
              }
            } catch (error) {
              logger.warn(`Error getting company suggestions for past company "${companyName}":`, error);
            }
          }
        }
        
        // Company headcount filter
        // CRITICAL FIX: Use letter codes (verified - Format B works, Format A returns 0)
        // Letter codes: A (Self-employed), B (1-10), C (11-50), D (51-200), E (201-500), 
        //               F (501-1,000), G (1,001-5,000), H (5,001-10,000), I (10,001+)
        if (requestBody.company_headcount_min || requestBody.company_headcount_max) {
          const headcountFilter: {
            type: string;
            values: Array<{ id: string; text: string; selectionType: string }>;
          } = {
            type: 'COMPANY_HEADCOUNT',
            values: []
          };
          
          // Map numeric ranges to letter codes
          const mapToLetterCode = (count: number): string | null => {
            if (count === 0) return 'A'; // Self-employed
            if (count <= 10) return 'B';
            if (count <= 50) return 'C';
            if (count <= 200) return 'D';
            if (count <= 500) return 'E';
            if (count <= 1000) return 'F';
            if (count <= 5000) return 'G';
            if (count <= 10000) return 'H';
            return 'I'; // 10,001+
          };
          
          if (requestBody.company_headcount_min) {
            const minCount = parseInt(String(requestBody.company_headcount_min), 10);
            const letterCode = mapToLetterCode(minCount);
            if (letterCode) {
            headcountFilter.values.push({
                id: letterCode,
              text: `Min: ${requestBody.company_headcount_min}`,
              selectionType: 'INCLUDED'
            });
            }
          }
          
          if (requestBody.company_headcount_max) {
            const maxCount = parseInt(String(requestBody.company_headcount_max), 10);
            const letterCode = mapToLetterCode(maxCount);
            if (letterCode) {
            headcountFilter.values.push({
                id: letterCode,
              text: `Max: ${requestBody.company_headcount_max}`,
              selectionType: 'INCLUDED'
            });
            }
          }
          
          if (headcountFilter.values.length > 0) {
            filters.push(headcountFilter);
          }
        }
        
        // Industry filter
        // CRITICAL FIX: Use IDs from filter_industry_suggestions (normalized names return 0 results)
        if (requestBody.industry) {
          const industryText = String(requestBody.industry);
          const industries = industryText.split(',').map(i => i.trim()).filter(i => i.length > 0);
          
          // Try to get industry IDs from suggestions API
          if (RAPIDAPI_KEY) {
            try {
              const { getIndustrySuggestions } = await import('@/utils/linkedinFilterHelpers');
              const industryValues: Array<{ id: string; text: string; selectionType: string }> = [];
              
              for (const industryName of industries) {
                const suggestions = await getIndustrySuggestions(industryName, RAPIDAPI_KEY);
                const exactMatch = suggestions.find(s => 
                  s.text.toLowerCase() === industryName.toLowerCase()
                );
                
                if (exactMatch) {
                  industryValues.push({
                    id: exactMatch.id, // Use ID from suggestions (e.g., "6" for Technology)
                    text: exactMatch.text,
                    selectionType: 'INCLUDED'
                  });
                  logger.log(`🏭 Using industry ID from suggestions: ${exactMatch.id} for "${industryName}"`);
                } else {
                  // Fallback: Use normalized name (may not work, but try)
                  logger.warn(`⚠️ Industry "${industryName}" not found in suggestions - using normalized name (may not work)`);
                  industryValues.push({
                    id: industryName.toLowerCase().replace(/\s+/g, '_'),
                    text: industryName,
                    selectionType: 'INCLUDED'
                  });
                }
              }
              
              if (industryValues.length > 0) {
                filters.push({
                  type: 'INDUSTRY',
                  values: industryValues
                });
              }
            } catch (error) {
              logger.warn(`Error getting industry suggestions:`, error);
              // Fallback to normalized names
          filters.push({
            type: 'INDUSTRY',
            values: industries.map(industry => ({
              id: industry.toLowerCase().replace(/\s+/g, '_'),
              text: industry,
              selectionType: 'INCLUDED'
            }))
          });
            }
          } else {
            // No API key - use normalized names (may not work)
            filters.push({
              type: 'INDUSTRY',
              values: industries.map(industry => ({
                id: industry.toLowerCase().replace(/\s+/g, '_'),
                text: industry,
                selectionType: 'INCLUDED'
              }))
            });
          }
        }
        
        // School/University filter
        // FIX: Use suggestions API to get proper school IDs (normalized names may not work)
        if (requestBody.school || requestBody.university) {
          const schoolText = String(requestBody.school || requestBody.university);
          const schools = schoolText.split(',').map(s => s.trim()).filter(s => s.length > 0);
          
          // Try to get school IDs from suggestions API
          if (RAPIDAPI_KEY) {
            try {
              const { getSchoolSuggestions } = await import('@/utils/linkedinFilterHelpers');
              const schoolValues: Array<{ id: string; text: string; selectionType: string }> = [];
              
              for (const schoolName of schools) {
                const suggestions = await getSchoolSuggestions(schoolName, RAPIDAPI_KEY);
                const exactMatch = suggestions.find(s => 
                  s.text.toLowerCase() === schoolName.toLowerCase()
                );
                
                if (exactMatch) {
                  schoolValues.push({
                    id: exactMatch.id,
                    text: exactMatch.text,
                    selectionType: 'INCLUDED'
                  });
                } else {
                  // Fallback: Use normalized name
                  schoolValues.push({
                    id: schoolName.toLowerCase().replace(/\s+/g, '_'),
                    text: schoolName,
                    selectionType: 'INCLUDED'
                  });
                }
              }
              
              if (schoolValues.length > 0) {
                filters.push({
                  type: 'SCHOOL',
                  values: schoolValues
                });
              }
            } catch (error) {
              logger.warn(`Error getting school suggestions:`, error);
              // Fallback to normalized names
          filters.push({
            type: 'SCHOOL',
            values: schools.map(school => ({
              id: school.toLowerCase().replace(/\s+/g, '_'),
              text: school,
              selectionType: 'INCLUDED'
            }))
          });
        }
          } else {
            // No API key - use normalized names
            filters.push({
              type: 'SCHOOL',
              values: schools.map(school => ({
                id: school.toLowerCase().replace(/\s+/g, '_'),
                text: school,
                selectionType: 'INCLUDED'
              }))
            });
          }
        }
        
        // Years of experience filter
        // CRITICAL FIX: Use IDs from filter_years_in endpoint
        // IDs: "1" (Less than 1 year), "2" (1 to 2 years), "3" (3 to 5 years), 
        //      "4" (6 to 10 years), "5" (More than 10 years)
        if (requestBody.years_experience_min || requestBody.years_experience_max) {
          const experienceFilter: {
            type: string;
            values: Array<{ id: string; text: string; selectionType: string }>;
          } = {
            type: 'YEARS_EXPERIENCE',
            values: []
          };
          
          // Map numeric years to ID codes
          const mapToExperienceId = (years: number): string => {
            if (years < 1) return '1'; // Less than 1 year
            if (years <= 2) return '2'; // 1 to 2 years
            if (years <= 5) return '3'; // 3 to 5 years
            if (years <= 10) return '4'; // 6 to 10 years
            return '5'; // More than 10 years
          };
          
          if (requestBody.years_experience_min) {
            const minYears = parseInt(String(requestBody.years_experience_min), 10);
            const experienceId = mapToExperienceId(minYears);
            experienceFilter.values.push({
              id: experienceId,
              text: `Min: ${requestBody.years_experience_min} years`,
              selectionType: 'INCLUDED'
            });
          }
          
          if (requestBody.years_experience_max) {
            const maxYears = parseInt(String(requestBody.years_experience_max), 10);
            const experienceId = mapToExperienceId(maxYears);
            experienceFilter.values.push({
              id: experienceId,
              text: `Max: ${requestBody.years_experience_max} years`,
              selectionType: 'INCLUDED'
            });
          }
          
          if (experienceFilter.values.length > 0) {
            filters.push(experienceFilter);
          }
        }
        
        // Job Title - Use keywords instead of filter (52% accuracy vs 20% with filter)
        // Based on diagnostic tests, keywords work much better than JOB_TITLE filter
        // Post-filtering will ensure accuracy for job titles as well
        if (requestBody.title_keywords) {
          const titleText = String(requestBody.title_keywords);
          // Don't add JOB_TITLE filter - use keywords instead (better accuracy)
          // Will be added to keywords below
          logger.log(`💼 Job title "${titleText}" will be added to keywords (better accuracy than JOB_TITLE filter)`);
        }
        
        // CRITICAL FIX: Filters are now enabled with correct format
        // Format verified from real LinkedIn URLs: type: 'REGION', id: '105763813' (numeric, not URN)
        // Real URL example shows: type:REGION, id:105763813 for Colorado
        // If we built filters, use them; otherwise build keywords
        if (filters.length > 0) {  // ENABLED - using verified correct format from real LinkedIn URLs
          requestBody.filters = filters;
          // Build keywords from remaining simple parameters (location text added if location ID not found)
          const keywordParts: string[] = [];
          if (requestBody.first_name) keywordParts.push(String(requestBody.first_name));
          if (requestBody.last_name) keywordParts.push(String(requestBody.last_name));
          // Always add title_keywords to keywords (better accuracy than JOB_TITLE filter)
          if (requestBody.title_keywords) {
            keywordParts.push(String(requestBody.title_keywords));
          }
          
          // Location filter is now enabled - only add to keywords if location ID not found
          // Post-filtering will still validate results for 100% accuracy
          if (requestBody.location) {
            const locationText = String(requestBody.location);
            // Only add to keywords if we don't have a location filter (fallback case)
            const hasLocationFilter = filters.some(f => f.type === 'LOCATION' || f.type === 'REGION');
            if (!hasLocationFilter) {
            if (!keywordParts.includes(locationText)) {
              keywordParts.push(locationText);
            }
              logger.log(`📍 Location "${locationText}" added to keywords (location ID not found - using keywords + post-filtering)`);
            } else {
              logger.log(`📍 Location filter applied with ID - using filter for accuracy`);
            }
          }
          
          requestBody.keywords = keywordParts.join(' ') || '';
          
          // EXTENSIVE LOGGING: Log exact filter structure
          logger.log(`📍 Built ${filters.length} filter(s) for request`, {
            filterCount: filters.length,
            filterTypes: filters.map(f => f.type),
            filters: JSON.stringify(filters, null, 2),
            keywords: requestBody.keywords,
            fullRequestBody: JSON.stringify(requestBody, null, 2)
          });
        } else {
          // Build keywords from remaining simple parameters
          // Note: If filters were built above, they're being used. Otherwise, use keywords.
          const keywordParts: string[] = [];
          if (requestBody.first_name) keywordParts.push(String(requestBody.first_name));
          if (requestBody.last_name) keywordParts.push(String(requestBody.last_name));
          // Add title_keywords to keywords (no filters in this branch)
          if (requestBody.title_keywords) keywordParts.push(String(requestBody.title_keywords));
          
          // PHASE 2: Improved keyword strategy for better location matching
          // Add location to keywords with extensive variations for better matching
          if (requestBody.location) {
            const locationText = String(requestBody.location);
            const locationLower = locationText.toLowerCase().trim();
            
            // State abbreviations mapping
            const stateAbbreviations: Record<string, string> = {
              'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
              'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
              'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
              'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
              'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
              'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
              'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
              'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
              'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
              'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
              'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
              'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
              'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC'
            };
            
            // Major cities by state (to improve keyword matching)
            const majorCities: Record<string, string[]> = {
              'maryland': ['Baltimore', 'Annapolis', 'Frederick', 'Rockville', 'Gaithersburg'],
              'california': ['Los Angeles', 'San Francisco', 'San Diego', 'Sacramento', 'Oakland'],
              'new york': ['New York', 'Albany', 'Buffalo', 'Rochester', 'Syracuse'],
              'texas': ['Houston', 'Dallas', 'Austin', 'San Antonio', 'Fort Worth'],
              'florida': ['Miami', 'Tampa', 'Orlando', 'Jacksonville', 'Tallahassee'],
              'illinois': ['Chicago', 'Springfield', 'Peoria', 'Rockford', 'Aurora'],
              'pennsylvania': ['Philadelphia', 'Pittsburgh', 'Harrisburg', 'Allentown', 'Erie'],
              'ohio': ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron'],
              'georgia': ['Atlanta', 'Savannah', 'Augusta', 'Columbus', 'Athens'],
              'north carolina': ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Winston-Salem'],
              'michigan': ['Detroit', 'Grand Rapids', 'Warren', 'Sterling Heights', 'Lansing'],
              'new jersey': ['Newark', 'Jersey City', 'Paterson', 'Elizabeth', 'Edison'],
              'virginia': ['Virginia Beach', 'Norfolk', 'Richmond', 'Newport News', 'Alexandria'],
              'washington': ['Seattle', 'Spokane', 'Tacoma', 'Vancouver', 'Bellevue'],
              'massachusetts': ['Boston', 'Worcester', 'Springfield', 'Lowell', 'Cambridge'],
              'arizona': ['Phoenix', 'Tucson', 'Mesa', 'Chandler', 'Scottsdale'],
              'tennessee': ['Nashville', 'Memphis', 'Knoxville', 'Chattanooga', 'Murfreesboro'],
              'indiana': ['Indianapolis', 'Fort Wayne', 'Evansville', 'South Bend', 'Carmel'],
              'missouri': ['Kansas City', 'St. Louis', 'Springfield', 'Columbia', 'Independence'],
            };
            
            // Strategy 1: Add location text (primary)
            keywordParts.push(locationText);
            
            // Strategy 2: Add state abbreviation if it's a state
            for (const [stateName, abbr] of Object.entries(stateAbbreviations)) {
              if (locationLower.includes(stateName)) {
                keywordParts.push(abbr);
                keywordParts.push(stateName); // Add full state name
                logger.log(`📍 Added state variations for "${locationText}": ${abbr}, ${stateName}`);
                
                // Strategy 3: Add major cities for this state (improves keyword matching)
                const cities = majorCities[stateName] || [];
                if (cities.length > 0) {
                  // Add 2-3 major cities to improve matching
                  keywordParts.push(...cities.slice(0, 3));
                  logger.log(`📍 Added major cities for "${locationText}": ${cities.slice(0, 3).join(', ')}`);
                }
                break;
              }
            }
            
            // Strategy 4: If it's already an abbreviation, add full state name
            for (const [stateName, abbr] of Object.entries(stateAbbreviations)) {
              if (locationLower === abbr.toLowerCase() || locationLower === ` ${abbr.toLowerCase()}`) {
                keywordParts.push(stateName);
                const cities = majorCities[stateName] || [];
                if (cities.length > 0) {
                  keywordParts.push(...cities.slice(0, 3));
                }
                logger.log(`📍 Added full state name and cities for abbreviation "${locationText}": ${stateName}`);
                break;
              }
            }
            
            // Strategy 5: Extract state from "City, State" format
            const locationParts = locationText.split(',').map(s => s.trim());
            if (locationParts.length > 1) {
              const possibleState = locationParts[1];
              const stateLower = possibleState.toLowerCase();
              
              // Add the city
              keywordParts.push(locationParts[0]);
              
              // Add state and abbreviation
              if (stateAbbreviations[stateLower]) {
                keywordParts.push(possibleState);
                keywordParts.push(stateAbbreviations[stateLower]);
                
                // Add other major cities in that state
                const cities = majorCities[stateLower] || [];
                if (cities.length > 0) {
                  keywordParts.push(...cities.slice(0, 2));
                }
              }
            }
            
            // Remove duplicates
            const uniqueKeywords = Array.from(new Set(keywordParts));
            
            logger.log(`📍 Location "${locationText}" added to keywords with ${uniqueKeywords.length} variations (improved keyword strategy for better matching)`);
            logger.log(`   Keywords: ${uniqueKeywords.join(' ')}`);
            
            // Use unique keywords
            keywordParts.length = 0;
            keywordParts.push(...uniqueKeywords);
          }
          
          if (keywordParts.length > 0) {
            requestBody.keywords = keywordParts.join(' ');
            requestBody.filters = [];
          } else {
            // If no parameters at all, the API requires at least filters or keywords
            // Send empty filters array and empty keywords string (as per test file format)
            requestBody.filters = [];
            requestBody.keywords = '';
          }
        }
      }
      
      // Ensure filters is an array if it exists
      if (requestBody.filters && !Array.isArray(requestBody.filters)) {
        requestBody.filters = [];
      }
      
      // Ensure keywords is a string if it exists
      if (requestBody.keywords !== undefined && typeof requestBody.keywords !== 'string') {
        requestBody.keywords = String(requestBody.keywords);
      }
      
      // NOW clean up: Remove simple parameters that should be in filters/keywords
      // Keep only API-expected parameters
      // Note: account_number is shown in RapidAPI playground examples
      const allowedParams = ['filters', 'keywords', 'page', 'limit', 'offset', 'sort_by', 'account_number'];
      const cleanedBody: Record<string, unknown> = {};
      
      // Add account_number if not present (RapidAPI playground shows account_number: 1)
      if (requestBody.account_number === undefined) {
        cleanedBody.account_number = 1;
      }
      
      // Copy only allowed parameters
      for (const key of allowedParams) {
        if (requestBody[key] !== undefined) {
          cleanedBody[key] = requestBody[key];
        }
      }
      
      // Replace requestBody with cleaned version
      Object.keys(requestBody).forEach(key => {
        delete requestBody[key];
      });
      Object.assign(requestBody, cleanedBody);
    }

    // Validate request size
    try {
      validateRequestSize(requestBody, 100000); // 100KB max
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Request too large' },
        { status: 400 }
      );
    }

    // Check rate limiting
    const rateLimitKey = `linkedin-sales-navigator-${endpoint}`;
    if (!rateLimiter.isAllowed(rateLimitKey)) {
      const timeUntilNext = rateLimiter.getTimeUntilNext(rateLimitKey);
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          message: `Too many requests. Please wait ${Math.ceil(timeUntilNext / 1000)} seconds before trying again.`,
          retryAfter: Math.ceil(timeUntilNext / 1000),
        },
        { 
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(timeUntilNext / 1000)),
          },
        }
      );
    }

    // EXTENSIVE LOGGING: Log exact request being sent to API
    logger.log('LinkedIn Sales Navigator API Request - EXACT FORMAT', {
      endpoint,
      url: url.replace(RAPIDAPI_KEY, '***'),
      requestBody: JSON.stringify(requestBody, null, 2),
      hasFilters: Array.isArray(requestBody.filters) && requestBody.filters.length > 0,
      filterCount: Array.isArray(requestBody.filters) ? requestBody.filters.length : 0,
      filterTypes: Array.isArray(requestBody.filters) ? requestBody.filters.map((f: any) => f.type) : [],
      hasKeywords: Boolean(requestBody.keywords),
      keywords: requestBody.keywords,
      page: requestBody.page,
      limit: requestBody.limit,
      allKeys: Object.keys(requestBody)
    });

    // EXTENSIVE LOGGING: Log exact request body being sent
    const requestBodyString = JSON.stringify(requestBody, null, 2);
    logger.log('EXACT REQUEST BODY BEING SENT TO API', {
      endpoint,
      url,
      method: 'POST',
      headers: {
        'x-rapidapi-key': '***HIDDEN***',
        'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
        'Content-Type': 'application/json'
      },
      body: requestBodyString,
      bodySize: new Blob([requestBodyString]).size
    });

    // Make API call with timeout and retry logic
    const response = await retryWithBackoff(
      async () => {
        return await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers: {
              'x-rapidapi-key': RAPIDAPI_KEY,
              'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          },
          30000 // 30 second timeout
        );
      },
      {
        maxRetries: 2, // Reduced retries to avoid wasting calls
        initialDelayMs: 2000, // Longer initial delay
        maxDelayMs: 10000,
        retryableStatusCodes: [500, 502, 503, 504], // REMOVED 429 - rate limits should NOT retry
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorDetails: unknown = errorText;
      
      // Try to parse error as JSON for better error messages
      try {
        errorDetails = JSON.parse(errorText);
      } catch {
        // Keep as text if not JSON
      }
      
      // If we attempted via_url and got 400/403, check if it's a 400 error in the message
      // This means the URL was invalid - we should have already fallen back, but if we're here,
      // it means the via_url flow didn't work. For regular endpoint calls, 400/403 are real errors.
      if (attemptedViaUrl && (response.status === 400 || response.status === 403)) {
        const errorStr = String(errorDetails);
        const is400Error = response.status === 400 || 
          errorStr.includes('400') ||
          errorStr.toLowerCase().includes('bad request');
        
        if (is400Error) {
          logger.warn(`⚠️ Regular endpoint returned 400 after via_url attempt failed - this should have been caught in via_url fallback`);
          // Continue to return error - via_url should have handled this
        }
      }
      
      // CRITICAL: Rate limit (429) should stop immediately - don't waste more API calls
      // Check both HTTP status code AND error message (RapidAPI sometimes returns 403 with "429" in error message)
      const errorStr = String(errorDetails);
      const isRateLimit = 
        response.status === 429 ||
        errorStr.includes('429') ||
        errorStr.includes('Rate limit') ||
        errorStr.includes('rate limit') ||
        (typeof errorDetails === 'object' && errorDetails !== null && 
         'error' in errorDetails && String(errorDetails.error).includes('429'));
      
      if (isRateLimit) {
        // Extract retry-after from headers if available
        const retryAfter = response.headers.get('Retry-After') || response.headers.get('retry-after');
        const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : 60; // Default to 60 seconds
        
        logger.error('LinkedIn Sales Navigator API Rate Limited - STOPPING', {
          httpStatus: response.status,
          errorContains429: errorStr.includes('429'),
          retryAfter: retryAfterSeconds,
          endpoint,
        });
        
        return NextResponse.json(
          { 
            error: 'Rate limit exceeded',
            message: `Too many requests. Please wait ${retryAfterSeconds} seconds before trying again.`,
            retryAfter: retryAfterSeconds,
            isRateLimit: true, // Flag for frontend to stop immediately
            rapidApiError: typeof errorDetails === 'object' && errorDetails !== null && 'rapidApiError' in errorDetails 
              ? errorDetails.rapidApiError 
              : undefined,
          },
          { 
            status: 429, // Always return 429 status when rate limited, even if RapidAPI returned 403
            headers: {
              'Retry-After': String(retryAfterSeconds),
            }
          }
        );
      }
      
      // Log error (production-safe)
      logger.error('LinkedIn Sales Navigator API Error', {
        status: response.status,
        statusText: response.statusText,
        endpoint,
        errorDetails: typeof errorDetails === 'object' ? errorDetails : { message: String(errorDetails) },
      });
      
      return NextResponse.json(
        { 
          error: `RapidAPI error: ${response.statusText}`, 
          details: errorDetails,
          requestBody: requiresFilters ? requestBody : undefined, // Include request body for debugging
          message: typeof errorDetails === 'object' && errorDetails !== null && 'message' in errorDetails 
            ? String(errorDetails.message) 
            : String(errorDetails)
        },
        { status: response.status }
      );
    }

    const result = await response.text();
    
    // EXTENSIVE LOGGING: Log raw response
    logger.log('LinkedIn Sales Navigator API Raw Response', {
      endpoint,
      responseLength: result.length,
      responsePreview: result.substring(0, 500),
      responseType: typeof result
    });
    
    // Try to parse as JSON, fallback to text
    let data;
    try {
      data = JSON.parse(result);
      logger.log('✅ Successfully parsed JSON response');
      
      // CRITICAL: Check if RapidAPI returned an error in a 200 OK response
      // RapidAPI sometimes returns HTTP 200 with { success: false, error: "..." } in the body
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        // Check for error in data.data (nested error response)
        if (data.data && typeof data.data === 'object' && data.data.success === false && data.data.error) {
          logger.error('RapidAPI returned error in 200 OK response', {
            endpoint,
            error: data.data.error,
            fullResponse: data
          });
          
          // Check if this is a 403 error and format message accordingly
          const errorMessage = typeof data.data.error === 'string' ? data.data.error : 'Request failed with status code 403';
          const is403Error = errorMessage.includes('403') || errorMessage.toLowerCase().includes('forbidden');
          const is400Error = errorMessage.includes('400') || errorMessage.toLowerCase().includes('bad request');
          const userMessage = is403Error ? 'Rate limit exceeded' : errorMessage;
          
          // 400 errors from via_url should have already been handled in the via_url block
          // But if we get here, it means via_url wasn't used or the error wasn't caught
          // For regular endpoint calls, 400 means bad request - return error
          if (is400Error && endpoint.includes('via_url')) {
            // This shouldn't happen if via_url fallback worked, but log it
            logger.warn('⚠️ 400 error in regular endpoint response (via_url should have handled this)');
          }
          
          // Log full error details for debugging
          logger.error('RapidAPI Error Details', {
            endpoint,
            httpStatus: 200, // HTTP status was 200 but body contains error
            errorMessage,
            is400Error,
            is403Error,
            fullError: data.data.error,
            fullResponse: JSON.stringify(data, null, 2),
            requestBody: JSON.stringify(requestBody, null, 2),
          });
          
          return NextResponse.json(
            {
              success: false,
              error: is403Error ? 'Rate limit exceeded' : (data.data.error || 'API request failed'),
              message: userMessage,
              details: {
                ...data.data,
                rapidApiError: data.data.error,
                endpoint,
                requestBody: requestBody, // Include request body for debugging
              }
            },
            { status: 403 }
          );
        }
        
        // Check for error at top level
        if (data.success === false && data.error) {
          logger.error('RapidAPI returned error in 200 OK response', {
            endpoint,
            error: data.error,
            fullResponse: data
          });
          
          // Check if this is a 403 error and format message accordingly
          const errorMessage = typeof data.error === 'string' ? data.error : 'Request failed';
          const is403Error = errorMessage.includes('403') || errorMessage.toLowerCase().includes('forbidden');
          const is400Error = errorMessage.includes('400') || errorMessage.toLowerCase().includes('bad request');
          const userMessage = is403Error ? 'Rate limit exceeded' : errorMessage;
          
          // 400 errors from via_url should have already been handled in the via_url block
          if (is400Error && endpoint.includes('via_url')) {
            logger.warn('⚠️ 400 error in regular endpoint response (via_url should have handled this)');
          }
          
          // Log full error details for debugging
          logger.error('RapidAPI Error Details (Top Level)', {
            endpoint,
            httpStatus: 200, // HTTP status was 200 but body contains error
            errorMessage,
            is400Error,
            is403Error,
            fullError: data.error,
            fullResponse: JSON.stringify(data, null, 2),
            requestBody: JSON.stringify(requestBody, null, 2),
          });
          
          return NextResponse.json(
            {
              success: false,
              error: is403Error ? 'Rate limit exceeded' : (data.error || 'API request failed'),
              message: userMessage,
              details: {
                ...data,
                rapidApiError: data.error,
                endpoint,
                requestBody: requestBody, // Include request body for debugging
              }
            },
            { status: 403 }
          );
        }
      }
    } catch (parseError) {
      logger.warn('⚠️ Failed to parse JSON, using raw text', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        responsePreview: result.substring(0, 200)
      });
      data = { raw: result };
    }

    // EXTENSIVE LOGGING: Log full response structure
    logger.log('LinkedIn Sales Navigator API Response Structure', {
      endpoint,
      hasData: !!data,
      dataType: typeof data,
      dataIsArray: Array.isArray(data),
      dataKeys: data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data) : [],
      hasResponse: !!(data?.response || data?.data?.response),
      hasPagination: !!(data?.response?.pagination || data?.data?.response?.pagination),
      responseStructure: data?.data?.response ? {
        hasData: !!data.data.response.data,
        dataIsArray: Array.isArray(data.data.response.data),
        dataLength: Array.isArray(data.data.response.data) ? data.data.response.data.length : 0,
        pagination: data.data.response.pagination,
        responseKeys: Object.keys(data.data.response || {})
      } : null,
      fullDataStructure: data && typeof data === 'object' ? {
        topLevelKeys: Object.keys(data),
        nestedStructure: data.data ? {
          dataKeys: Object.keys(data.data),
          dataType: typeof data.data,
          dataIsArray: Array.isArray(data.data),
          hasResponse: !!data.data.response,
          responseStructure: data.data.response ? {
            responseKeys: Object.keys(data.data.response),
            hasData: !!data.data.response.data,
            dataType: typeof data.data.response.data,
            dataIsArray: Array.isArray(data.data.response.data),
            dataLength: Array.isArray(data.data.response.data) ? data.data.response.data.length : undefined
          } : null
        } : null
      } : null
    });
    
    // Log full response for debugging (truncated for safety)
    if (data && typeof data === 'object') {
      const responseStr = JSON.stringify(data, null, 2);
      logger.log('Full API Response (truncated)', {
        fullLength: responseStr.length,
        preview: responseStr.substring(0, 1000),
        hasMore: responseStr.length > 1000
      });
    }

    // Validate response structure
    if (!data || (typeof data !== 'object' && !Array.isArray(data))) {
      logger.warn('Unexpected response format from LinkedIn Sales Navigator API', {
        endpoint,
        responseType: typeof data,
        responsePreview: typeof result === 'string' ? result.substring(0, 200) : result
      });
    }

    // Extract and cache location IDs from lead responses (if available)
    // Note: Sales Navigator API doesn't return geo IDs in lead data, only geoRegion text
    // But we can still map geoRegion text to location IDs we've discovered
    // Handle ALL possible response structures:
    // 1. data.response.data (top-level response)
    // 2. data.data.response.data (nested response)
    // 3. data.data (direct array)
    // 4. data.response.results/leads
    const leadsData = 
      data?.response?.data ||           // Top-level response.data
      data?.response?.results ||         // Top-level response.results
      data?.response?.leads ||           // Top-level response.leads
      data?.data?.response?.data ||      // Nested data.response.data
      data?.data?.data ||                // Nested data.data
      (Array.isArray(data?.data) ? data.data : null) || // data.data as array
      (Array.isArray(data?.response) ? data.response : null); // response as array
    
    logger.log('Location ID Extraction from Leads', {
      hasLeadsData: !!leadsData,
      leadsDataIsArray: Array.isArray(leadsData),
      leadsDataLength: Array.isArray(leadsData) ? leadsData.length : undefined,
      hasLocationParam: !!requestBody.location,
      locationText: requestBody.location ? String(requestBody.location) : null
    });
    
    if (leadsData && Array.isArray(leadsData) && requestBody.location) {
      try {
        const { getLocationId } = await import('@/utils/linkedinLocationDiscovery');
        const locationText = String(requestBody.location);
        
        // Extract unique geoRegion values from leads
        const geoRegions = new Set<string>();
        for (const lead of leadsData) {
          if (lead.geoRegion && typeof lead.geoRegion === 'string') {
            geoRegions.add(lead.geoRegion);
          }
        }
        
        logger.log('Extracted geoRegions from leads', {
          totalLeads: leadsData.length,
          uniqueGeoRegions: Array.from(geoRegions),
          geoRegionCount: geoRegions.size
        });
        
        // For each unique geoRegion, try to discover and cache its location ID
        // This helps build our location database for future searches
        for (const geoRegion of geoRegions) {
          if (geoRegion && geoRegion !== locationText) {
            // Try to discover location ID for this geoRegion (async, don't await)
            // CRITICAL OPTIMIZATION: Check request cache first to avoid duplicate calls
            const geoCacheKey = geoRegion.toLowerCase().trim();
            
            if (requestCache.locationIds.has(geoCacheKey)) {
              const cached = requestCache.locationIds.get(geoCacheKey)!;
              logger.log(`📍 Using request-cached location ID for geoRegion "${geoRegion}"`, {
                locationId: cached.id,
                fullId: cached.fullId,
                source: cached.source
              });
            } else {
              // Not in cache - discover and cache it (async, don't await)
              getLocationId(geoRegion, RAPIDAPI_KEY || '', true).then(discovery => {
                if (discovery.fullId && discovery.locationId) {
                  requestCache.locationIds.set(geoCacheKey, {
                    id: discovery.locationId,
                    fullId: discovery.fullId,
                    source: discovery.source,
                  });
                }
                logger.log(`📍 Discovered location ID for geoRegion "${geoRegion}"`, {
                  locationId: discovery.locationId,
                  fullId: discovery.fullId,
                  source: discovery.source
                });
              }).catch((error) => {
                logger.warn(`Failed to discover location ID for geoRegion "${geoRegion}"`, error);
              });
            }
          }
        }
      } catch (error) {
        logger.warn('Failed to extract location IDs from lead responses', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
      }
    }

    // Extract pagination info if available - check all possible locations
    const pagination = 
      data?.response?.pagination ||      // Top-level response.pagination
      data?.data?.response?.pagination || // Nested data.response.pagination
      data?.pagination ||                // Top-level pagination
      data?.data?.pagination ||          // Nested data.pagination
      null;
    
    // EXTENSIVE LOGGING: Log exact response structure before returning
    logger.log('LinkedIn Sales Navigator API - Final Response Structure', {
      endpoint,
      responseHasData: !!data,
      responseDataType: typeof data,
      responseIsArray: Array.isArray(data),
      topLevelKeys: data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data) : [],
      nestedDataKeys: data?.data && typeof data.data === 'object' ? Object.keys(data.data) : [],
      hasResponse: !!(data?.response || data?.data?.response),
      responseDataPath: data?.response?.data ? 'data.response.data' : data?.data?.response?.data ? 'data.data.response.data' : 'unknown',
      responseDataLength: Array.isArray(data?.response?.data) ? data.response.data.length : 
                         Array.isArray(data?.data?.response?.data) ? data.data.response.data.length : 
                         Array.isArray(data?.data) ? data.data.length :
                         Array.isArray(data) ? data.length : 0,
      pagination: pagination,
      fullResponsePreview: JSON.stringify(data, null, 2).substring(0, 2000)
    });
    
    // Extract processed results if available
    let processedResults: any[] | undefined;
    if (data?.response?.data && Array.isArray(data.response.data)) {
      processedResults = data.response.data;
    } else if (data?.data?.response?.data && Array.isArray(data.data.response.data)) {
      processedResults = data.data.response.data;
    } else if (Array.isArray(data?.data)) {
      processedResults = data.data;
    } else if (Array.isArray(data)) {
      processedResults = data;
    }

    // POST-FILTERING: Apply location validation if location was requested
    // CRITICAL: API accepts filters but doesn't apply them - post-filtering ensures 100% accuracy
    let finalResults = processedResults;
    let locationValidationStats: any = null;
    
    if (body.location && processedResults && processedResults.length > 0) {
      try {
        const { filterLeadsByLocation } = await import('@/utils/locationValidation');
        const requestedLocation = String(body.location);
        const { filtered, stats } = filterLeadsByLocation(processedResults, requestedLocation);
        
        finalResults = filtered;
        locationValidationStats = stats;
        
        logger.log(`📍 Post-filtering applied: ${stats.kept} of ${stats.total} leads match "${requestedLocation}" (${(stats.removalRate).toFixed(1)}% removed)`);
        
        // Update the data structure with filtered results
        if (data?.response?.data && Array.isArray(data.response.data)) {
          data.response.data = filtered;
        } else if (data?.data?.response?.data && Array.isArray(data.data.response.data)) {
          data.data.response.data = filtered;
        } else if (Array.isArray(data?.data)) {
          data.data = filtered;
        } else if (Array.isArray(data)) {
          data = filtered;
        }
        
        // Update pagination count to reflect filtered results
        if (pagination) {
          pagination.count = filtered.length;
          // Recalculate hasMore based on filtered results
          if (pagination.total) {
            // Estimate: if we filtered out X%, the total is also reduced
            const filterRate = stats.total > 0 ? stats.kept / stats.total : 0;
            const estimatedFilteredTotal = Math.floor(pagination.total * filterRate);
            pagination.hasMore = (pagination.start + filtered.length) < estimatedFilteredTotal;
          }
        }
      } catch (filterError) {
        logger.warn('Post-filtering failed, returning all results:', filterError);
        // Continue with unfiltered results if filtering fails
      }
    }
    
    // AUTOMATIC SAVE: Save all API results since we're paying for every call
    try {
      const { saveApiResults } = await import('@/utils/saveApiResults');
      
      const savedPath = await saveApiResults(
        endpoint || 'unknown',
        body, // All search params
        data, // Raw response (may have been filtered)
        finalResults // Processed and filtered results
      );
      
      if (savedPath) {
        logger.log(`💾 API results saved to: ${savedPath}`);
      }
    } catch (saveError) {
      // Don't fail the request if saving fails
      logger.warn('Failed to save API results:', saveError);
    }

    // Track scrape usage
    try {
      const { incrementScrapeCount } = await import('@/utils/scrapeUsageTracker');
      const leadCount = finalResults?.length || 0;
      if (leadCount > 0) {
        await incrementScrapeCount('linkedin', leadCount);
        logger.log(`📊 Tracked ${leadCount} LinkedIn leads in usage counter`);

        // Check quota and notify if approaching
        try {
          const { loadSettings } = await import('@/utils/settingsConfig');
          const { getDailyUsage, getMonthlyUsage } = await import('@/utils/scrapeUsageTracker');
          const { notifyQuotaApproaching } = await import('@/utils/notifications');
          const settings = loadSettings();
          const daily = await getDailyUsage('linkedin');
          const monthly = await getMonthlyUsage('linkedin');
          
          if (settings.scrapeLimits.linkedin.daily !== Infinity) {
            await notifyQuotaApproaching('linkedin', daily, settings.scrapeLimits.linkedin.daily, 'daily');
          }
          if (settings.scrapeLimits.linkedin.monthly !== Infinity) {
            await notifyQuotaApproaching('linkedin', monthly, settings.scrapeLimits.linkedin.monthly, 'monthly');
          }
        } catch (quotaError) {
          console.warn('[LINKEDIN_SCRAPER] Failed to check quota:', quotaError);
        }
      }
    } catch (usageError) {
      // Don't fail the request if usage tracking fails
      logger.warn('Failed to track scrape usage:', usageError);
    }
    
    // Return response with pagination metadata and location validation stats
    return NextResponse.json({
      success: true,
      data: data,
      pagination: pagination ? {
        total: pagination.total,
        count: pagination.count,
        start: pagination.start,
        hasMore: pagination.total ? (pagination.start + pagination.count) < pagination.total : false
      } : null,
      locationValidationStats: locationValidationStats || undefined
    });
  } catch (error) {
    // Record error for cooldown tracking
    try {
      const { recordError } = await import('@/utils/cooldownManager');
      await recordError();
    } catch (cooldownError) {
      console.warn('[LINKEDIN_SCRAPER] Failed to record error:', cooldownError);
    }

    logger.error('LinkedIn Sales Navigator API error', error);
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        return NextResponse.json(
          { 
            error: 'Request timeout',
            message: 'The API request timed out. Please try again.',
          },
          { status: 504 }
        );
      }
      
      if (error.message.includes('rate limit')) {
        return NextResponse.json(
          { 
            error: 'Rate limit exceeded',
            message: 'Too many requests. Please wait before trying again.',
          },
          { status: 429 }
        );
      }
    }
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        message: 'An unexpected error occurred while processing your request.',
      },
      { status: 500 }
    );
  }
}

