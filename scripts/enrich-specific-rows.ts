/**
 * Script to enrich specific rows using skip tracing API
 */

import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

if (!RAPIDAPI_KEY) {
  console.error('Error: RAPIDAPI_KEY not found in environment variables');
  process.exit(1);
}

/**
 * Calculate age from DOB
 */
function calculateAge(dob: string): number | null {
  if (!dob) return null;
  try {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  } catch {
    return null;
  }
}

/**
 * Calculate DOB from age (approximate, uses current year - age)
 */
function calculateDOBFromAge(age: number): string | null {
  if (!age || age <= 0) return null;
  const today = new Date();
  const birthYear = today.getFullYear() - age;
  // Use January 1st as approximate date
  return `${birthYear}-01-01`;
}

/**
 * Calls RapidAPI skip tracing directly
 */
async function callSkipTracingAPI(phone: string): Promise<{ data?: any; error?: string }> {
  try {
    const params = new URLSearchParams();
    if (phone) params.append('phone', phone);

    const url = `https://skip-tracing-working-api.p.rapidapi.com/search/byemail?${params.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY!,
        'x-rapidapi-host': 'skip-tracing-working-api.p.rapidapi.com',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { error: `HTTP ${response.status}: ${errorText}` };
    }

    const result = await response.text();
    try {
      return { data: JSON.parse(result) };
    } catch {
      return { data: { raw: result } };
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Calls skip tracing v2 by name and address
 */
async function callSkipTracingV2(firstName: string, lastName: string, addressLine2: string): Promise<{ data?: any; error?: string }> {
  try {
    const url = 'https://skip-tracing-api.p.rapidapi.com/search/by-name-and-address';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY!,
        'x-rapidapi-host': 'skip-tracing-api.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        firstName,
        lastName,
        addressLine2,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { error: `HTTP ${response.status}: ${errorText}` };
    }

    const result = await response.text();
    try {
      return { data: JSON.parse(result) };
    } catch {
      return { data: { raw: result } };
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Enriches a single row using skip tracing
 */
async function enrichRow(row: Record<string, string | number>, headers: string[]): Promise<{
  dob?: string;
  age?: number;
  zipcode?: string;
  state?: string;
  city?: string;
  address?: string;
  error?: string;
}> {
  const result: any = {};

  const getValue = (variations: string[]): string | null => {
    for (const variation of variations) {
      const header = headers.find(h => h.toLowerCase() === variation.toLowerCase());
      if (header) {
        const value = String(row[header] || '').trim();
        if (value) return value;
      }
    }
    return null;
  };

  const firstName = getValue(['firstname', 'first_name', 'firstName']);
  const lastName = getValue(['lastname', 'last_name', 'lastName']);
  const phone = getValue(['phone', 'primaryphone']);
  const zipcode = getValue(['zipcode', 'zip', 'postalcode']);
  const state = getValue(['state']);
  const city = getValue(['city']);

  // Clean phone number
  const cleanPhone = phone ? phone.replace(/[^\d+]/g, '').replace(/^\+1/, '') : null;

  console.log(`  Looking up: ${firstName} ${lastName}, Phone: ${cleanPhone || 'N/A'}, Location: ${city || 'N/A'}, ${state || 'N/A'} ${zipcode || 'N/A'}`);

  // Try skip tracing v1 by phone
  if (cleanPhone && cleanPhone.length >= 10) {
    console.log(`  → Calling skip-tracing API with phone: ${cleanPhone}`);
    const skipResult = await callSkipTracingAPI(cleanPhone);

    if (skipResult.data) {
      console.log(`  ✓ Got data from skip-tracing API`);
      const data = skipResult.data;
      
      // Extract fields
      if (data.dateOfBirth) {
        result.dob = data.dateOfBirth;
        const calculatedAge = calculateAge(data.dateOfBirth);
        if (calculatedAge) result.age = calculatedAge;
        console.log(`    ✓ Found DOB: ${data.dateOfBirth}, Age: ${calculatedAge}`);
      } else if (data.age) {
        result.age = data.age;
        const calculatedDOB = calculateDOBFromAge(data.age);
        if (calculatedDOB) result.dob = calculatedDOB;
        console.log(`    ✓ Found Age: ${data.age}, Calculated DOB: ${calculatedDOB}`);
      }
      
      if (data.city && !city) {
        result.city = data.city;
        console.log(`    ✓ Found City: ${data.city}`);
      }
      if (data.state && !state) {
        result.state = data.state;
        console.log(`    ✓ Found State: ${data.state}`);
      }
      if (data.zipCode || data.zip) {
        const zip = data.zipCode || data.zip;
        if (!zipcode) {
          result.zipcode = zip;
          console.log(`    ✓ Found Zipcode: ${zip}`);
        }
      }
      if (data.addressLine1) {
        result.address = data.addressLine1;
        console.log(`    ✓ Found Address: ${data.addressLine1}`);
      }
    } else if (skipResult.error) {
      console.log(`    ⚠ Error: ${skipResult.error}`);
      result.error = skipResult.error;
    }
  }

  // Try skip tracing v2 by name and location if we have name and some location data
  if (firstName && lastName && (city || state || zipcode)) {
    const addressLine2 = [city || result.city, state || result.state, zipcode || result.zipcode].filter(Boolean).join(', ');
    
    if (addressLine2) {
      console.log(`  → Calling skip-tracing v2 with name and location: ${addressLine2}`);
      const skipV2Result = await callSkipTracingV2(firstName, lastName, addressLine2);

      if (skipV2Result.data) {
        console.log(`  ✓ Got data from skip-tracing v2`);
        const data = skipV2Result.data;
        
        // Debug: log the structure
        console.log(`    Response structure:`, JSON.stringify(data).substring(0, 500));
        
        // Try various response structures
        let searchResults: any[] = [];
        
        if (Array.isArray(data)) {
          searchResults = data;
        } else if (data.nameAddressSearch) {
          searchResults = Array.isArray(data.nameAddressSearch) ? data.nameAddressSearch : [data.nameAddressSearch];
        } else if (data.addressSearch) {
          searchResults = Array.isArray(data.addressSearch) ? data.addressSearch : [data.addressSearch];
        } else if (data.results) {
          searchResults = Array.isArray(data.results) ? data.results : [data.results];
        } else if (data.data) {
          searchResults = Array.isArray(data.data) ? data.data : [data.data];
        } else if (typeof data === 'object') {
          // Try to use the data object itself
          searchResults = [data];
        }
        
        if (searchResults.length > 0) {
          const firstResult = searchResults[0];
          console.log(`    Found ${searchResults.length} result(s), processing first one`);
          
          // Try various field name variations
          const dob = firstResult.dateOfBirth || firstResult.dob || firstResult.birthDate || firstResult.birth_date;
          const age = firstResult.age;
          const addr = firstResult.addressLine1 || firstResult.address || firstResult.street || firstResult.streetAddress;
          const cityResult = firstResult.city;
          const stateResult = firstResult.state;
          const zip = firstResult.zipCode || firstResult.zip || firstResult.postalCode || firstResult.postal_code;
          
          if (dob && !result.dob) {
            result.dob = dob;
            const calculatedAge = calculateAge(dob);
            if (calculatedAge) result.age = calculatedAge;
            console.log(`    ✓ Found DOB: ${dob}, Age: ${calculatedAge}`);
          } else if (age && !result.age) {
            result.age = age;
            const calculatedDOB = calculateDOBFromAge(age);
            if (calculatedDOB) result.dob = calculatedDOB;
            console.log(`    ✓ Found Age: ${age}, Calculated DOB: ${calculatedDOB}`);
          }
          
          if (addr && !result.address) {
            result.address = addr;
            console.log(`    ✓ Found Address: ${addr}`);
          }
          if (cityResult && !city && !result.city) {
            result.city = cityResult;
            console.log(`    ✓ Found City: ${cityResult}`);
          }
          if (stateResult && !state && !result.state) {
            result.state = stateResult;
            console.log(`    ✓ Found State: ${stateResult}`);
          }
          if (zip && !zipcode && !result.zipcode) {
            result.zipcode = zip;
            console.log(`    ✓ Found Zipcode: ${zip}`);
          }
        } else {
          console.log(`    ⚠ No results found in response`);
        }
      } else if (skipV2Result.error) {
        console.log(`    ⚠ Error: ${skipV2Result.error}`);
        if (!result.error) result.error = skipV2Result.error;
      }
    }
  }

  return result;
}

/**
 * Maps enrichment result back to CSV columns
 */
function mapEnrichmentToCSV(
  enrichment: any,
  row: Record<string, string | number>,
  headers: string[]
): Record<string, string | number> {
  const updatedRow = { ...row };

  if (enrichment.dob) {
    const dobCol = headers.find(h => h.toLowerCase() === 'dob') || 'dob';
    if (!updatedRow[dobCol] || updatedRow[dobCol] === '') {
      updatedRow[dobCol] = enrichment.dob;
    }
  }

  if (enrichment.age !== undefined) {
    const ageCol = headers.find(h => h.toLowerCase() === 'age') || 'age';
    if (!updatedRow[ageCol] || updatedRow[ageCol] === '') {
      updatedRow[ageCol] = enrichment.age;
    }
  }

  if (enrichment.zipcode) {
    const zipCol = headers.find(h => h.toLowerCase() === 'zipcode') || 'zipcode';
    if (!updatedRow[zipCol] || updatedRow[zipCol] === '') {
      updatedRow[zipCol] = enrichment.zipcode;
    }
  }

  if (enrichment.state) {
    const stateCol = headers.find(h => h.toLowerCase() === 'state') || 'state';
    if (!updatedRow[stateCol] || updatedRow[stateCol] === '') {
      updatedRow[stateCol] = enrichment.state;
    }
  }

  if (enrichment.city) {
    const cityCol = headers.find(h => h.toLowerCase() === 'city') || 'city';
    if (!updatedRow[cityCol] || updatedRow[cityCol] === '') {
      updatedRow[cityCol] = enrichment.city;
    }
  }

  if (enrichment.address) {
    const addressCol = headers.find(h => h.toLowerCase() === 'address') || 'address';
    if (!updatedRow[addressCol] || updatedRow[addressCol] === '') {
      updatedRow[addressCol] = enrichment.address;
    }
  }

  return updatedRow;
}

/**
 * Main function
 */
async function enrichSpecificRows(inputPath: string, outputPath: string, rowIndices: number[]) {
  console.log(`Reading CSV file: ${inputPath}`);
  
  const csvContent = fs.readFileSync(inputPath, 'utf-8');
  
  const parseResult = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim(),
    transform: (value: string) => value.trim(),
  });

  if (parseResult.errors.length > 0) {
    console.warn('CSV parsing warnings:', parseResult.errors);
  }

  let headers = parseResult.meta.fields || [];
  const rows = parseResult.data as Record<string, string>[];

  // Add age column if it doesn't exist
  if (!headers.find(h => h.toLowerCase() === 'age')) {
    headers = [...headers, 'age'];
  }

  console.log(`Found ${rows.length} rows total`);
  console.log(`Enriching rows: ${rowIndices.map(i => i + 1).join(', ')}\n`);

  const enrichedRows: Record<string, string | number>[] = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    if (rowIndices.includes(i)) {
      console.log(`\n=== Enriching row ${i + 1}/${rows.length} ===`);
      
      try {
        const enrichment = await enrichRow(row, headers);
        const updatedRow = mapEnrichmentToCSV(enrichment, row, headers);
        enrichedRows.push(updatedRow);
        
        const enrichedFields: string[] = [];
        if (enrichment.dob && !row.dob) enrichedFields.push('dob');
        if (enrichment.age && !row.age) enrichedFields.push('age');
        if (enrichment.zipcode && !row.zipcode) enrichedFields.push('zipcode');
        if (enrichment.state && !row.state) enrichedFields.push('state');
        if (enrichment.city && !row.city) enrichedFields.push('city');
        if (enrichment.address && !row.address) enrichedFields.push('address');
        
        if (enrichedFields.length > 0) {
          console.log(`\n✓ Successfully enriched: ${enrichedFields.join(', ')}`);
        } else {
          console.log(`\n- No new data found`);
        }
        
        // Rate limiting delay
        if (i < rows.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`\n✗ Error:`, error);
        enrichedRows.push(row);
      }
    } else {
      enrichedRows.push(row);
    }
  }

  const csvOutput = Papa.unparse({
    fields: headers,
    data: enrichedRows.map(row => 
      headers.map(header => String(row[header] || ''))
    ),
  });

  fs.writeFileSync(outputPath, csvOutput, 'utf-8');
  console.log(`\n✓ Enriched CSV saved to: ${outputPath}`);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: tsx scripts/enrich-specific-rows.ts <input-csv-path> [output-csv-path] [row-indices...]');
    console.error('Example: tsx scripts/enrich-specific-rows.ts formatted_leads.csv formatted_leads.csv 5 6');
    process.exit(1);
  }

  const inputPath = path.resolve(args[0]);
  const outputPath = args[1] 
    ? path.resolve(args[1])
    : inputPath.replace(/\.csv$/, '_enriched.csv');
  
  // Row indices (0-based, but user provides 1-based)
  const rowIndices = args.slice(2).map(s => parseInt(s) - 1).filter(n => !isNaN(n));
  
  // Default to rows 6 and 7 (indices 5 and 6)
  const indicesToEnrich = rowIndices.length > 0 ? rowIndices : [5, 6];

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`);
    process.exit(1);
  }

  try {
    await enrichSpecificRows(inputPath, outputPath, indicesToEnrich);
    console.log('\n✓ Enrichment complete!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
