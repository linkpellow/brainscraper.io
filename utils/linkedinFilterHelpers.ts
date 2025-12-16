/**
 * LinkedIn Filter Helper Endpoints
 * 
 * Utility functions for all RapidAPI filter helper endpoints
 * These provide autocomplete, suggestions, and available filter options
 */

const RAPIDAPI_BASE = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com';
const RAPIDAPI_HOST = 'realtime-linkedin-sales-navigator-data.p.rapidapi.com';

/**
 * Generic helper function to call filter suggestion endpoints
 */
async function callFilterEndpoint(
  endpoint: string,
  rapidApiKey: string,
  body: Record<string, unknown> = {}
): Promise<any> {
  try {
    const response = await fetch(`${RAPIDAPI_BASE}/${endpoint}`, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': RAPIDAPI_HOST,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.warn(`Filter endpoint ${endpoint} returned ${response.status}`);
      return null;
    }

    const result = await response.text();
    try {
      return JSON.parse(result);
    } catch {
      return { raw: result };
    }
  } catch (error) {
    console.error(`Error calling ${endpoint}:`, error);
    return null;
  }
}

/**
 * Get company suggestions (autocomplete)
 * CRITICAL: Returns companyId which must be converted to URN format
 */
export async function getCompanySuggestions(
  query: string,
  rapidApiKey: string
): Promise<Array<{ id: string; text: string; fullId?: string }>> {
  const result = await callFilterEndpoint('filter_company_suggestions', rapidApiKey, { query });
  
  if (!result) return [];
  
  // Handle different response structures
  const suggestions = result.suggestions || result.data || result.results || (Array.isArray(result) ? result : []);
  
  return suggestions.map((s: any) => {
    // Extract companyId from response (verified format: companyId: "162479")
    const companyId = s.companyId || s.id || '';
    
    // Convert to URN format: urn:li:organization:162479
    const fullId = companyId ? `urn:li:organization:${companyId}` : undefined;
    
    return {
      id: companyId,
      text: s.displayValue || s.text || s.name || s.headline || String(companyId || ''),
      fullId: fullId || (s.urn && s.urn.startsWith('urn:') ? s.urn : undefined),
    };
  });
}

/**
 * Get industry suggestions (autocomplete)
 * CRITICAL: Returns industry IDs (e.g., "6" for Technology) - use these in filters
 */
export async function getIndustrySuggestions(
  query: string,
  rapidApiKey: string
): Promise<Array<{ id: string; text: string }>> {
  const result = await callFilterEndpoint('filter_industry_suggestions', rapidApiKey, { query });
  
  if (!result) return [];
  
  const suggestions = result.suggestions || result.data || result.results || (Array.isArray(result) ? result : []);
  
  return suggestions.map((s: any) => ({
    id: String(s.id || ''), // Use ID from API (e.g., "6", "1594")
    text: s.displayValue || s.text || s.name || s.headline || String(s.id || ''),
  }));
}

/**
 * Get school/university suggestions (autocomplete)
 * FIX: Requires query parameter (verified - returns 400 without it)
 */
export async function getSchoolSuggestions(
  query: string,
  rapidApiKey: string
): Promise<Array<{ id: string; text: string }>> {
  const result = await callFilterEndpoint('filter_school_suggestions', rapidApiKey, { query });
  
  if (!result) return [];
  
  const suggestions = result.suggestions || result.data || result.results || (Array.isArray(result) ? result : []);
  
  return suggestions.map((s: any) => ({
    id: s.id || String(s.id || ''),
    text: s.displayValue || s.text || s.name || s.headline || String(s.id || ''),
  }));
}

/**
 * Get job title suggestions (autocomplete)
 */
export async function getJobTitleSuggestions(
  query: string,
  rapidApiKey: string
): Promise<Array<{ id: string; text: string }>> {
  const result = await callFilterEndpoint('filter_job_title_suggestions', rapidApiKey, { query });
  
  if (!result) return [];
  
  const suggestions = result.suggestions || result.data || result.results || (Array.isArray(result) ? result : []);
  
  return suggestions.map((s: any) => ({
    id: s.id || String(s.id || ''),
    text: s.text || s.name || String(s.id || ''),
  }));
}

/**
 * Get years of experience filter options
 */
export async function getYearsOfExperienceOptions(
  rapidApiKey: string
): Promise<Array<{ id: string; text: string }>> {
  const result = await callFilterEndpoint('filter_years_in', rapidApiKey);
  
  if (!result) return [];
  
  const options = result.options || result.data || result.results || (Array.isArray(result) ? result : []);
  
  return options.map((o: any) => ({
    id: o.id || String(o.id || ''),
    text: o.text || o.name || String(o.id || ''),
  }));
}

/**
 * Get technology filter options
 */
export async function getTechnologyOptions(
  query: string,
  rapidApiKey: string
): Promise<Array<{ id: string; text: string }>> {
  const result = await callFilterEndpoint('filter_technology', rapidApiKey, { query });
  
  if (!result) return [];
  
  const options = result.options || result.data || result.results || (Array.isArray(result) ? result : []);
  
  return options.map((o: any) => ({
    id: o.id || String(o.id || ''),
    text: o.text || o.name || String(o.id || ''),
  }));
}

/**
 * Get annual revenue filter options
 */
export async function getAnnualRevenueOptions(
  rapidApiKey: string
): Promise<Array<{ id: string; text: string }>> {
  const result = await callFilterEndpoint('filter_annual_revunue', rapidApiKey); // Note: typo in endpoint name
  
  if (!result) return [];
  
  const options = result.options || result.data || result.results || (Array.isArray(result) ? result : []);
  
  return options.map((o: any) => ({
    id: o.id || String(o.id || ''),
    text: o.text || o.name || String(o.id || ''),
  }));
}

/**
 * Get followers count filter options
 */
export async function getFollowersCountOptions(
  rapidApiKey: string
): Promise<Array<{ id: string; text: string }>> {
  const result = await callFilterEndpoint('filter_followers_count', rapidApiKey);
  
  if (!result) return [];
  
  const options = result.options || result.data || result.results || (Array.isArray(result) ? result : []);
  
  return options.map((o: any) => ({
    id: o.id || String(o.id || ''),
    text: o.text || o.name || String(o.id || ''),
  }));
}

/**
 * Get department headcount filter options
 */
export async function getDepartmentHeadcountOptions(
  rapidApiKey: string
): Promise<Array<{ id: string; text: string }>> {
  const result = await callFilterEndpoint('filter_department_headcount', rapidApiKey);
  
  if (!result) return [];
  
  const options = result.options || result.data || result.results || (Array.isArray(result) ? result : []);
  
  return options.map((o: any) => ({
    id: o.id || String(o.id || ''),
    text: o.text || o.name || String(o.id || ''),
  }));
}

/**
 * Get recent activities filter options
 */
export async function getRecentActivitiesOptions(
  rapidApiKey: string
): Promise<Array<{ id: string; text: string }>> {
  const result = await callFilterEndpoint('filter_recent_activities', rapidApiKey);
  
  if (!result) return [];
  
  const options = result.options || result.data || result.results || (Array.isArray(result) ? result : []);
  
  return options.map((o: any) => ({
    id: o.id || String(o.id || ''),
    text: o.text || o.name || String(o.id || ''),
  }));
}

/**
 * Get job opportunities filter options
 */
export async function getJobOpportunitiesOptions(
  rapidApiKey: string
): Promise<Array<{ id: string; text: string }>> {
  const result = await callFilterEndpoint('filter_job_oppertunities', rapidApiKey); // Note: typo in endpoint name
  
  if (!result) return [];
  
  const options = result.options || result.data || result.results || (Array.isArray(result) ? result : []);
  
  return options.map((o: any) => ({
    id: o.id || String(o.id || ''),
    text: o.text || o.name || String(o.id || ''),
  }));
}

/**
 * Get Fortune filter options
 */
export async function getFortuneOptions(
  rapidApiKey: string
): Promise<Array<{ id: string; text: string }>> {
  const result = await callFilterEndpoint('filter_fortune', rapidApiKey);
  
  if (!result) return [];
  
  const options = result.options || result.data || result.results || (Array.isArray(result) ? result : []);
  
  return options.map((o: any) => ({
    id: o.id || String(o.id || ''),
    text: o.text || o.name || String(o.id || ''),
  }));
}

/**
 * Get company headcount filter options
 */
export async function getCompanyHeadcountOptions(
  rapidApiKey: string
): Promise<Array<{ id: string; text: string }>> {
  const result = await callFilterEndpoint('filter_company_headcount', rapidApiKey);
  
  if (!result) return [];
  
  const options = result.options || result.data || result.results || (Array.isArray(result) ? result : []);
  
  return options.map((o: any) => ({
    id: o.id || String(o.id || ''),
    text: o.text || o.name || String(o.id || ''),
  }));
}

/**
 * Get languages filter options
 */
export async function getLanguagesOptions(
  rapidApiKey: string
): Promise<Array<{ id: string; text: string }>> {
  const result = await callFilterEndpoint('filter_languages', rapidApiKey);
  
  if (!result) return [];
  
  const options = result.options || result.data || result.results || (Array.isArray(result) ? result : []);
  
  return options.map((o: any) => ({
    id: o.id || String(o.id || ''),
    text: o.text || o.name || String(o.id || ''),
  }));
}

/**
 * Get search suggestions (general)
 */
export async function getSearchSuggestions(
  rapidApiKey: string
): Promise<Array<{ id: string; text: string }>> {
  const result = await callFilterEndpoint('search_suggestions', rapidApiKey);
  
  if (!result) return [];
  
  const suggestions = result.suggestions || result.data || result.results || (Array.isArray(result) ? result : []);
  
  return suggestions.map((s: any) => ({
    id: s.id || String(s.id || ''),
    text: s.text || s.name || String(s.id || ''),
  }));
}

/**
 * Get seniority level filter options
 */
export async function getSeniorityLevelOptions(
  rapidApiKey: string
): Promise<Array<{ id: string; text: string }>> {
  const result = await callFilterEndpoint('filter_seniority_level', rapidApiKey);
  
  if (!result) return [];
  
  const options = result.options || result.data || result.results || (Array.isArray(result) ? result : []);
  
  return options.map((o: any) => ({
    id: o.id || String(o.id || ''),
    text: o.text || o.name || String(o.id || ''),
  }));
}

/**
 * Get company type filter options
 */
export async function getCompanyTypeOptions(
  rapidApiKey: string
): Promise<Array<{ id: string; text: string }>> {
  const result = await callFilterEndpoint('filter_company_type', rapidApiKey);
  
  if (!result) return [];
  
  const options = result.options || result.data || result.results || (Array.isArray(result) ? result : []);
  
  return options.map((o: any) => ({
    id: o.id || String(o.id || ''),
    text: o.text || o.name || String(o.id || ''),
  }));
}
