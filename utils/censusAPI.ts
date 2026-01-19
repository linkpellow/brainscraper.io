/**
 * US Census API Utility
 * 
 * Direct integration with US Census Bureau API for income data.
 * Uses ACS (American Community Survey) 5-year estimates.
 * 
 * API Documentation: https://www.census.gov/data/developers/data-sets/acs-5year.html
 */

export interface CensusIncomeData {
  medianIncome?: number;
  zipCode: string;
  year?: string;
  source: 'census' | 'rapidapi';
}

/**
 * Fetch median household income for a ZIP code from US Census API
 * 
 * @param zipCode - 5-digit ZIP code
 * @param apiKey - US Census API key
 * @returns Median household income or null if not found
 */
export async function fetchCensusIncomeByZip(
  zipCode: string,
  apiKey: string
): Promise<CensusIncomeData | null> {
  try {
    // Extract 5-digit ZIP
    const zip5 = zipCode.match(/\d{5}/)?.[0];
    if (!zip5) {
      console.warn(`[CENSUS_API] Invalid ZIP code format: ${zipCode}`);
      return null;
    }

    // US Census API endpoint for ACS 5-year estimates
    // B19013_001E = Median Household Income (inflation-adjusted dollars)
    // Using 2022 ACS 5-year estimates (most recent comprehensive data)
    const year = '2022';
    const baseUrl = 'https://api.census.gov/data';
    const dataset = 'acs/acs5';
    const variables = 'NAME,B19013_001E'; // Name and median household income
    const geography = `zip%20code%20tabulation%20area:${zip5}`;
    
    const url = `${baseUrl}/${year}/${dataset}?get=${variables}&for=${geography}&key=${apiKey}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[CENSUS_API] Census API error for ZIP ${zip5}: ${response.status} ${response.statusText}`, errorText);
      return null;
    }

    const data = await response.json();
    
    // Census API returns array format:
    // [["NAME","B19013_001E","zip code tabulation area"],
    //  ["ZCTA5 90210","123456","90210"]]
    if (!Array.isArray(data) || data.length < 2) {
      console.warn(`[CENSUS_API] Unexpected response format for ZIP ${zip5}:`, data);
      return null;
    }

    const headers = data[0] as string[];
    const row = data[1] as string[];
    
    if (!headers || !row) {
      console.warn(`[CENSUS_API] Invalid response structure for ZIP ${zip5}`);
      return null;
    }

    // Find income column index
    const incomeIndex = headers.indexOf('B19013_001E');
    if (incomeIndex === -1 || !row[incomeIndex]) {
      console.warn(`[CENSUS_API] Income data not found in response for ZIP ${zip5}`);
      return null;
    }

    const incomeValue = row[incomeIndex].trim();
    
    // Handle null/empty values (Census API returns "-" or empty string for no data)
    if (!incomeValue || incomeValue === '-' || incomeValue === 'null') {
      console.warn(`[CENSUS_API] No income data available for ZIP ${zip5}`);
      return null;
    }

    const medianIncome = parseInt(incomeValue, 10);
    
    if (isNaN(medianIncome) || medianIncome <= 0) {
      console.warn(`[CENSUS_API] Invalid income value for ZIP ${zip5}: ${incomeValue}`);
      return null;
    }

    return {
      medianIncome,
      zipCode: zip5,
      year,
      source: 'census',
    };
  } catch (error) {
    console.error(`[CENSUS_API] Error fetching Census data for ZIP ${zipCode}:`, error);
    return null;
  }
}

/**
 * Fetch median household income with fallback to RapidAPI
 * 
 * @param zipCode - 5-digit ZIP code
 * @param censusApiKey - US Census API key
 * @param rapidApiKey - RapidAPI key (optional, for fallback)
 * @returns Median household income data
 */
export async function fetchIncomeByZipWithFallback(
  zipCode: string,
  censusApiKey: string,
  rapidApiKey?: string
): Promise<CensusIncomeData | null> {
  // Try Census API first (free/direct)
  const censusResult = await fetchCensusIncomeByZip(zipCode, censusApiKey);
  
  if (censusResult && censusResult.medianIncome) {
    return censusResult;
  }

  // Fallback to RapidAPI if Census fails and RapidAPI key provided
  if (rapidApiKey) {
    try {
      const zip5 = zipCode.match(/\d{5}/)?.[0];
      if (!zip5) {
        return null;
      }

      const url = `https://household-income-by-zip-code.p.rapidapi.com/v1/Census/HouseholdIncomeByZip/${zip5}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': 'household-income-by-zip-code.p.rapidapi.com',
        },
      });

      if (response.ok) {
        const result = await response.text();
        let data: any;
        
        try {
          data = JSON.parse(result);
        } catch {
          data = { raw: result };
        }

        // Extract median income from RapidAPI response
        const medianIncome = data.medianIncome || data.median_income || data.householdIncome || 
                            data.data?.medianIncome || data.data?.median_income || data.data?.householdIncome;
        
        if (medianIncome && typeof medianIncome === 'number' && medianIncome > 0) {
          return {
            medianIncome,
            zipCode: zip5,
            source: 'rapidapi',
          };
        }
      }
    } catch (error) {
      console.warn(`[CENSUS_API] RapidAPI fallback failed for ZIP ${zipCode}:`, error);
    }
  }

  return null;
}
