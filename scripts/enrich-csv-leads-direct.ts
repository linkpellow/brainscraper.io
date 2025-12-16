/**
 * Script to enrich CSV lead data with missing fields using RapidAPI services
 * This version calls APIs directly (bypassing Next.js routes)
 */

import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

if (!RAPIDAPI_KEY) {
  console.error('Error: RAPIDAPI_KEY not found in environment variables');
  process.exit(1);
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
    // Clean phone number and ensure E.164 format
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
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  dateOfBirth?: string;
  age?: number;
  income?: number;
  skipTracingData?: any;
  skipTracingV2Data?: any;
  telnyxLookupData?: any;
  incomeData?: any;
  error?: string;
}> {
  const result: any = {};

  // Extract existing data - check multiple column name variations
  const getValue = (variations: string[]): string | null => {
    for (const variation of variations) {
      const header = headers.find(h => {
        const lower = h.toLowerCase();
        return variations.some(v => lower.includes(v.toLowerCase()));
      });
      if (header) {
        const value = String(row[header] || '').trim();
        if (value) return value;
      }
    }
    return null;
  };

  const email = getValue(['email']) || null;
  const phone = getValue(['primaryphone', 'phone', 'primary_phone']) || null;
  const zipCode = getValue(['postalcode', 'zipcode', 'zip', 'postal_code']) || null;
  const firstName = getValue(['firstname', 'first_name', 'first name', 'fname']) || null;
  const lastName = getValue(['lastname', 'last_name', 'last name', 'lname']) || null;
  const addressOne = getValue(['addressone', 'address1', 'address_one', 'street_1', 'street1', 'address']) || null;
  const addressTwo = getValue(['addresstwo', 'address2', 'address_two', 'street_2', 'street2']) || null;
  const city = getValue(['city']) || null;
  const state = getValue(['state']) || null;
  const dateOfBirth = getValue(['dateofbirth', 'dob', 'date_of_birth', 'birthdate']) || null;
  const age = headers.find(h => h.toLowerCase() === 'age')
    ? (row[headers.find(h => h.toLowerCase() === 'age')!] ? Number(row[headers.find(h => h.toLowerCase() === 'age')!]) : null)
    : null;
  const income = getValue(['income', 'household_income', 'householdincome']) || null;

  // Clean phone number
  const cleanPhone = phone ? phone.replace(/[^\d+]/g, '') : null;

  // Phase 1: Foundation Data
  if (cleanPhone && cleanPhone.length >= 10) {
    const telnyxResult = await callTelnyxAPI(cleanPhone);
    if (telnyxResult.data) {
      result.telnyxLookupData = telnyxResult.data;
    }
  }

  if (zipCode && zipCode.match(/\d{5}/)) {
    const zip5 = zipCode.match(/\d{5}/)![0];
    const incomeResult = await callRapidAPI(
      `https://household-income-by-zip-code.p.rapidapi.com/v1/Census/HouseholdIncomeByZip/${zip5}`,
      'household-income-by-zip-code.p.rapidapi.com'
    );
    if (incomeResult.data) {
      result.incomeData = incomeResult.data;
      if (incomeResult.data.medianIncome) {
        result.income = incomeResult.data.medianIncome;
      }
    }
  }

  // Skip-tracing v1 - use if we have email/phone and missing critical fields
  const hasDOB = dateOfBirth || age;
  const hasCompleteName = firstName && lastName;
  const needsEnrichment = !hasDOB || !hasCompleteName || !city || !state;
  
  if ((email || cleanPhone) && needsEnrichment) {
    const params = new URLSearchParams();
    if (email) params.append('email', email);
    if (cleanPhone) params.append('phone', cleanPhone);

    const skipResult = await callRapidAPI(
      `https://skip-tracing-working-api.p.rapidapi.com/search/byemail?${params.toString()}`,
      'skip-tracing-working-api.p.rapidapi.com'
    );

    if (skipResult.data) {
      result.skipTracingData = skipResult.data;
      const data = skipResult.data;
      
      // Extract fields from skip-tracing response
      if (data.email && !email) result.email = data.email;
      if (data.phone && !cleanPhone) result.phone = data.phone;
      if (data.firstName && !firstName) result.firstName = data.firstName;
      if (data.lastName && !lastName) result.lastName = data.lastName;
      if (data.dateOfBirth) result.dateOfBirth = data.dateOfBirth;
      if (data.age) result.age = data.age;
      if (data.city && !city) result.city = data.city;
      if (data.state && !state) result.state = data.state;
      if (data.zipCode || data.zip) result.zipCode = data.zipCode || data.zip;
      if (data.addressLine1 && !addressOne) result.addressLine1 = data.addressLine1;
      if (data.income) result.income = data.income;
    }
    if (skipResult.error) {
      result.error = skipResult.error;
    }
  }

  // Skip-tracing v2 (address-based) - use if we have address but missing other data
  if ((addressOne || (firstName && lastName)) && (city || state || zipCode) && needsEnrichment) {
    const addressLine1 = addressOne || (addressOne ? addressOne : '');
    const addressLine2 = [city, state, zipCode].filter(Boolean).join(', ');
    
    // Try name + address search if we have name
    if (firstName && lastName && addressLine2) {
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
        result.skipTracingV2Data = skipV2Result.data;
        const data = skipV2Result.data;
        const searchResults = data.nameAddressSearch || data.addressSearch || (Array.isArray(data) ? data : [data]);
        if (Array.isArray(searchResults) && searchResults.length > 0) {
          const firstResult = searchResults[0];
          if (firstResult.email && !email && !result.email) result.email = firstResult.email;
          if (firstResult.phone && !cleanPhone && !result.phone) result.phone = firstResult.phone;
          if (firstResult.firstName && !firstName && !result.firstName) result.firstName = firstResult.firstName;
          if (firstResult.lastName && !lastName && !result.lastName) result.lastName = firstResult.lastName;
          if (firstResult.city && !city && !result.city) result.city = firstResult.city;
          if (firstResult.state && !state && !result.state) result.state = firstResult.state;
          if (firstResult.zipCode && !zipCode && !result.zipCode) result.zipCode = firstResult.zipCode;
          if (firstResult.addressLine1 && !addressOne && !result.addressLine1) result.addressLine1 = firstResult.addressLine1;
          if (firstResult.dateOfBirth && !dateOfBirth) result.dateOfBirth = firstResult.dateOfBirth;
          if (firstResult.age && !age) result.age = firstResult.age;
        }
      }
    }
    
    // Also try address-only search
    if (addressLine1 && addressLine2) {
      const skipV2Result = await callRapidAPI(
        'https://skip-tracing-api.p.rapidapi.com/owners-by-address',
        'skip-tracing-api.p.rapidapi.com',
        {
          method: 'POST',
          body: JSON.stringify({
            addressLine1: addressLine1,
            addressLine2: addressLine2,
          }),
        }
      );

      if (skipV2Result.data) {
        if (!result.skipTracingV2Data) {
          result.skipTracingV2Data = skipV2Result.data;
        }
        const data = skipV2Result.data;
        
        // Extract from addressSearch or nameAddressSearch
        const searchResults = data.addressSearch || data.nameAddressSearch || (Array.isArray(data) ? data : [data]);
        if (Array.isArray(searchResults) && searchResults.length > 0) {
          const firstResult = searchResults[0];
          if (firstResult.email && !email && !result.email) result.email = firstResult.email;
          if (firstResult.phone && !cleanPhone && !result.phone) result.phone = firstResult.phone;
          if (firstResult.firstName && !firstName && !result.firstName) result.firstName = firstResult.firstName;
          if (firstResult.lastName && !lastName && !result.lastName) result.lastName = firstResult.lastName;
          if (firstResult.city && !city && !result.city) result.city = firstResult.city;
          if (firstResult.state && !state && !result.state) result.state = firstResult.state;
          if (firstResult.zipCode && !zipCode && !result.zipCode) result.zipCode = firstResult.zipCode;
          if (firstResult.addressLine1 && !addressOne && !result.addressLine1) result.addressLine1 = firstResult.addressLine1;
          if (firstResult.dateOfBirth && !dateOfBirth) result.dateOfBirth = firstResult.dateOfBirth;
          if (firstResult.age && !age) result.age = firstResult.age;
        }
      }
    }
  }
  
  // Also copy data from alternative column names to primary column names if missing
  if (!result.firstName && firstName) result.firstName = firstName;
  if (!result.lastName && lastName) result.lastName = lastName;
  if (!result.phone && cleanPhone) result.phone = cleanPhone;
  if (!result.email && email) result.email = email;
  if (!result.city && city) result.city = city;
  if (!result.state && state) result.state = state;
  if (!result.zipCode && zipCode) result.zipCode = zipCode;
  if (!result.addressLine1 && addressOne) result.addressLine1 = addressOne;
  if (!result.dateOfBirth && dateOfBirth) result.dateOfBirth = dateOfBirth;
  if (!result.age && age) result.age = age;

  // Also check for data in row that might be in different columns
  const first_name = getValue(['first_name']);
  const last_name = getValue(['last_name']);
  const phone_alt = getValue(['phone']) && !cleanPhone ? getValue(['phone']) : null;
  const street_1 = getValue(['street_1']);
  const street_2 = getValue(['street_2']);
  const zipcode_alt = getValue(['zipcode']);
  const dob_alt = getValue(['dob']);

  if (!result.firstName && first_name) result.firstName = first_name;
  if (!result.lastName && last_name) result.lastName = last_name;
  if (!result.phone && phone_alt) result.phone = phone_alt;
  if (!result.addressLine1 && street_1) result.addressLine1 = street_1;
  if (!result.zipCode && zipcode_alt) result.zipCode = zipcode_alt;
  if (!result.dateOfBirth && dob_alt) result.dateOfBirth = dob_alt;

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
  
  // First, copy data from alternative columns to primary columns if primary is empty
  const copyIfEmpty = (primaryCol: string, altCols: string[]) => {
    const primary = headers.find(h => h.toLowerCase() === primaryCol.toLowerCase());
    if (primary && (!updatedRow[primary] || updatedRow[primary] === '')) {
      for (const altCol of altCols) {
        const alt = headers.find(h => h.toLowerCase() === altCol.toLowerCase());
        if (alt && updatedRow[alt] && updatedRow[alt] !== '') {
          updatedRow[primary] = updatedRow[alt];
          break;
        }
      }
    }
  };
  
  copyIfEmpty('firstName', ['first_name', 'First Name']);
  copyIfEmpty('lastName', ['last_name', 'Last Name']);
  copyIfEmpty('primaryPhone', ['phone']);
  copyIfEmpty('addressOne', ['street_1']);
  copyIfEmpty('addressTwo', ['street_2']);
  copyIfEmpty('postalCode', ['zipcode', 'zip']);
  copyIfEmpty('dateOfBirth', ['dob']);

  if (enrichment.email) {
    const emailCol = headers.find(h => h.toLowerCase().includes('email')) || 'email';
    if (!updatedRow[emailCol]) updatedRow[emailCol] = enrichment.email;
  }

  if (enrichment.phone) {
    const primaryCol = headers.find(h => h.toLowerCase() === 'primaryphone');
    const altCol = headers.find(h => h.toLowerCase() === 'phone' && h.toLowerCase() !== 'primaryphone');
    const targetCol = primaryCol || altCol || 'primaryPhone';
    if (!updatedRow[targetCol] || updatedRow[targetCol] === '') {
      updatedRow[targetCol] = enrichment.phone;
    }
    if (altCol && altCol !== targetCol && (!updatedRow[altCol] || updatedRow[altCol] === '')) {
      updatedRow[altCol] = enrichment.phone;
    }
  }

  if (enrichment.firstName) {
    // Try to fill primary column first, then alternative columns
    const primaryCol = headers.find(h => h.toLowerCase() === 'firstname');
    const altCol = headers.find(h => h.toLowerCase().includes('first_name') || h.toLowerCase().includes('first name'));
    const targetCol = primaryCol || altCol || 'firstName';
    if (!updatedRow[targetCol] || updatedRow[targetCol] === '') {
      updatedRow[targetCol] = enrichment.firstName;
    }
    // Also fill alternative column if different
    if (altCol && altCol !== targetCol && (!updatedRow[altCol] || updatedRow[altCol] === '')) {
      updatedRow[altCol] = enrichment.firstName;
    }
  }

  if (enrichment.lastName) {
    const primaryCol = headers.find(h => h.toLowerCase() === 'lastname');
    const altCol = headers.find(h => h.toLowerCase().includes('last_name') || h.toLowerCase().includes('last name'));
    const targetCol = primaryCol || altCol || 'lastName';
    if (!updatedRow[targetCol] || updatedRow[targetCol] === '') {
      updatedRow[targetCol] = enrichment.lastName;
    }
    if (altCol && altCol !== targetCol && (!updatedRow[altCol] || updatedRow[altCol] === '')) {
      updatedRow[altCol] = enrichment.lastName;
    }
  }

  if (enrichment.addressLine1) {
    const addressCol = headers.find(h => 
      (h.toLowerCase().includes('addressone') || h.toLowerCase().includes('address1') || h.toLowerCase().includes('street_1')) && !updatedRow[h]
    ) || 'addressOne';
    updatedRow[addressCol] = enrichment.addressLine1;
  }

  if (enrichment.city) {
    const cityCol = headers.find(h => h.toLowerCase() === 'city');
    if (cityCol && !updatedRow[cityCol]) updatedRow[cityCol] = enrichment.city;
  }

  if (enrichment.state) {
    const stateCol = headers.find(h => h.toLowerCase() === 'state');
    if (stateCol && !updatedRow[stateCol]) updatedRow[stateCol] = enrichment.state;
  }

  if (enrichment.zipCode) {
    const zipCol = headers.find(h => 
      (h.toLowerCase().includes('zipcode') || h.toLowerCase().includes('postalcode')) && !updatedRow[h]
    ) || 'postalCode';
    updatedRow[zipCol] = enrichment.zipCode;
  }

  if (enrichment.dateOfBirth) {
    const primaryCol = headers.find(h => h.toLowerCase() === 'dateofbirth');
    const altCol = headers.find(h => h.toLowerCase() === 'dob');
    const targetCol = primaryCol || altCol || 'dateOfBirth';
    if (!updatedRow[targetCol] || updatedRow[targetCol] === '') {
      updatedRow[targetCol] = enrichment.dateOfBirth;
    }
    if (altCol && altCol !== targetCol && (!updatedRow[altCol] || updatedRow[altCol] === '')) {
      updatedRow[altCol] = enrichment.dateOfBirth;
    }
  }

  if (enrichment.age) {
    if (!updatedRow.age) updatedRow.age = enrichment.age;
  }

  if (enrichment.income) {
    const incomeCol = headers.find(h => 
      h.toLowerCase().includes('income') && !updatedRow[h]
    ) || 'income';
    updatedRow[incomeCol] = enrichment.income;
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

  const headers = parseResult.meta.fields || [];
  const rows = parseResult.data as Record<string, string>[];

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
      if (enrichment.email && !row.email) enrichedFields.push('email');
      if (enrichment.phone && !row.primaryPhone) enrichedFields.push('phone');
      if (enrichment.firstName && !row.firstName) enrichedFields.push('firstName');
      if (enrichment.lastName && !row.lastName) enrichedFields.push('lastName');
      if (enrichment.city && !row.city) enrichedFields.push('city');
      if (enrichment.state && !row.state) enrichedFields.push('state');
      if (enrichment.zipCode && !row.postalCode) enrichedFields.push('zipCode');
      if (enrichment.dateOfBirth && !row.dateOfBirth) enrichedFields.push('dateOfBirth');
      if (enrichment.income && !row.income) enrichedFields.push('income');
      
      if (enrichedFields.length > 0) {
        console.log(`  ✓ Enriched: ${enrichedFields.join(', ')}`);
      } else {
        console.log(`  - No new data found`);
      }
      
      if (enrichment.error) {
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
    console.error('Usage: tsx scripts/enrich-csv-leads-direct.ts <input-csv-path> [output-csv-path]');
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
