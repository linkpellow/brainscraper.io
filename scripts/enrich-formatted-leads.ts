/**
 * Script to enrich formatted_leads.csv with missing fields
 * Handles age calculation from DOB and uses age when DOB is missing
 */

import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

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
 * Calls RapidAPI directly
 */
async function callRapidAPI(
  url: string,
  host: string,
  options: RequestInit = {}
): Promise<{ data?: any; error?: string }> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY!,
        'x-rapidapi-host': host,
        'Content-Type': 'application/json',
        ...options.headers,
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
 * Calls Telnyx API directly
 */
async function callTelnyxAPI(phone: string): Promise<{ data?: any; error?: string }> {
  if (!TELNYX_API_KEY) {
    return { error: 'TELNYX_API_KEY not configured' };
  }

  try {
    let cleanedPhone = phone.replace(/[^\d+]/g, '');
    if (!cleanedPhone.startsWith('+')) {
      if (cleanedPhone.startsWith('1') && cleanedPhone.length === 11) {
        cleanedPhone = '+' + cleanedPhone;
      } else if (cleanedPhone.length === 10) {
        cleanedPhone = '+1' + cleanedPhone;
      }
    }

    const url = `https://api.telnyx.com/v2/number_lookup/${encodeURIComponent(cleanedPhone)}?type=carrier&type=caller-name`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { error: `HTTP ${response.status}: ${errorText}` };
    }

    return { data: await response.json() };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Enriches a single row
 */
async function enrichRow(row: Record<string, string | number>, headers: string[]): Promise<{
  dob?: string;
  age?: number;
  zipcode?: string;
  state?: string;
  city?: string;
  address?: string;
  phone?: string;
  income?: number;
  error?: string;
}> {
  const result: any = {};

  // Extract existing data
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
  const dob = getValue(['dob', 'dateofbirth', 'date_of_birth']);
  const age = getValue(['age']) ? Number(getValue(['age'])) : null;
  const zipcode = getValue(['zipcode', 'zip', 'postalcode']);
  const state = getValue(['state']);
  const city = getValue(['city']);
  const address = getValue(['address', 'addressone', 'street_1']);
  const phone = getValue(['phone', 'primaryphone']);

  // Calculate age from DOB if DOB exists but age doesn't
  if (dob && !age) {
    const calculatedAge = calculateAge(dob);
    if (calculatedAge) {
      result.age = calculatedAge;
    }
  }

  // Calculate DOB from age if age exists but DOB doesn't (as user requested)
  if (age && !dob) {
    const calculatedDOB = calculateDOBFromAge(age);
    if (calculatedDOB) {
      result.dob = calculatedDOB;
    }
  }

  // Clean phone number
  const cleanPhone = phone ? phone.replace(/[^\d+]/g, '') : null;

  // Phase 1: Foundation Data
  if (cleanPhone && cleanPhone.length >= 10) {
    const telnyxResult = await callTelnyxAPI(cleanPhone);
    if (telnyxResult.data) {
      result.telnyxLookupData = telnyxResult.data;
    }
  }

  if (zipcode && zipcode.match(/\d{5}/)) {
    const zip5 = zipcode.match(/\d{5}/)![0];
    const incomeResult = await callRapidAPI(
      `https://household-income-by-zip-code.p.rapidapi.com/v1/Census/HouseholdIncomeByZip/${zip5}`,
      'household-income-by-zip-code.p.rapidapi.com'
    );
    if (incomeResult.data && incomeResult.data.medianIncome) {
      result.income = incomeResult.data.medianIncome;
    }
  }

  // Skip-tracing v1 - use if we have phone and missing critical fields
  const hasDOB = dob || result.dob;
  const hasAge = age || result.age;
  const needsEnrichment = !hasDOB || !hasAge || !city || !state || !address || !zipcode;
  
  // Try skip-tracing even if we just have phone number
  if (cleanPhone && needsEnrichment) {
    const params = new URLSearchParams();
    if (cleanPhone) params.append('phone', cleanPhone);

    const skipResult = await callRapidAPI(
      `https://skip-tracing-working-api.p.rapidapi.com/search/byemail?${params.toString()}`,
      'skip-tracing-working-api.p.rapidapi.com'
    );

    if (skipResult.data) {
      const data = skipResult.data;
      
      // Extract fields from skip-tracing response
      // Prioritize DOB, but use age if DOB not available (as user requested)
      if (data.dateOfBirth && !dob && !result.dob) {
        result.dob = data.dateOfBirth;
        const calculatedAge = calculateAge(data.dateOfBirth);
        if (calculatedAge) result.age = calculatedAge;
      } else if (data.age && !age && !result.age) {
        // If DOB not available, use age to calculate approximate DOB
        result.age = data.age;
        if (!dob && !result.dob) {
          const calculatedDOB = calculateDOBFromAge(data.age);
          if (calculatedDOB) result.dob = calculatedDOB;
        }
      }
      if (data.city && !city) result.city = data.city;
      if (data.state && !state) result.state = data.state;
      if (data.zipCode || data.zip) {
        if (!zipcode) result.zipcode = data.zipCode || data.zip;
      }
      if (data.addressLine1 && !address) result.address = data.addressLine1;
    }
    if (skipResult.error && !skipResult.error.includes('429')) {
      result.error = skipResult.error;
    }
  }

  // Skip-tracing v2 (name + address) if we have name and location but missing address
  if (firstName && lastName && (city || state || zipcode) && !address) {
    const addressLine2 = [city, state, zipcode].filter(Boolean).join(', ');
    
    if (addressLine2) {
      const skipV2Result = await callRapidAPI(
        'https://skip-tracing-api.p.rapidapi.com/by-name-and-address',
        'skip-tracing-api.p.rapidapi.com',
        {
          method: 'POST',
          body: JSON.stringify({
            firstName,
            lastName,
            addressLine2,
          }),
        }
      );

      if (skipV2Result.data) {
        const data = skipV2Result.data;
        const searchResults = data.nameAddressSearch || data.addressSearch || (Array.isArray(data) ? data : [data]);
        if (Array.isArray(searchResults) && searchResults.length > 0) {
          const firstResult = searchResults[0];
          if (firstResult.addressLine1 && !address) result.address = firstResult.addressLine1;
          if (firstResult.city && !city) result.city = firstResult.city;
          if (firstResult.state && !state) result.state = firstResult.state;
          if (firstResult.zipCode && !zipcode) result.zipcode = firstResult.zipCode;
          if (firstResult.dateOfBirth && !dob && !result.dob) {
            result.dob = firstResult.dateOfBirth;
            const calculatedAge = calculateAge(firstResult.dateOfBirth);
            if (calculatedAge) result.age = calculatedAge;
          }
          if (firstResult.age && !age && !result.age) {
            result.age = firstResult.age;
            if (!dob && !result.dob) {
              const calculatedDOB = calculateDOBFromAge(firstResult.age);
              if (calculatedDOB) result.dob = calculatedDOB;
            }
          }
        }
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

  // Map to the original column names (lowercase)
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

  if (enrichment.phone) {
    const phoneCol = headers.find(h => h.toLowerCase() === 'phone') || 'phone';
    if (!updatedRow[phoneCol] || updatedRow[phoneCol] === '') {
      updatedRow[phoneCol] = enrichment.phone;
    }
  }

  return updatedRow;
}

/**
 * Main function
 */
async function enrichCSVFile(inputPath: string, outputPath: string) {
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

  console.log(`Found ${rows.length} rows to enrich`);
  console.log(`Headers: ${headers.length} columns\n`);

  const enrichedRows: Record<string, string | number>[] = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    console.log(`Enriching row ${i + 1}/${rows.length}...`);
    
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
        console.log(`  ✓ Enriched: ${enrichedFields.join(', ')}`);
      } else {
        console.log(`  - No new data found`);
      }
      
      if (enrichment.error && !enrichment.error.includes('429')) {
        console.log(`  ⚠ Warning: ${enrichment.error}`);
      }
      
      // Rate limiting delay
      if (i < rows.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } catch (error) {
      console.error(`  ✗ Error:`, error);
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
    console.error('Usage: tsx scripts/enrich-formatted-leads.ts <input-csv-path> [output-csv-path]');
    process.exit(1);
  }

  const inputPath = path.resolve(args[0]);
  const outputPath = args[1] 
    ? path.resolve(args[1])
    : inputPath.replace(/\.csv$/, '_enriched.csv');

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`);
    process.exit(1);
  }

  try {
    await enrichCSVFile(inputPath, outputPath);
    console.log('\n✓ Enrichment complete!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
