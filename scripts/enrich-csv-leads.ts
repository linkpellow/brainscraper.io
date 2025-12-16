/**
 * Script to enrich CSV lead data with missing fields using RapidAPI services
 */

import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';
import { enrichRow, EnrichmentResult } from '../utils/enrichData';

/**
 * Maps enrichment result data back to CSV column names
 */
function mapEnrichmentToCSVColumns(
  enrichment: EnrichmentResult,
  row: Record<string, string | number>,
  headers: string[]
): Record<string, string | number> {
  const updatedRow = { ...row };

  // Map email
  if (enrichment.email) {
    const emailCol = headers.find(h => 
      h.toLowerCase().includes('email') && !row[h]
    ) || 'email';
    updatedRow[emailCol] = enrichment.email;
  }

  // Map phone
  if (enrichment.phone) {
    const phoneCol = headers.find(h => 
      (h.toLowerCase().includes('phone') || h.toLowerCase().includes('primaryphone')) && !row[h]
    ) || 'primaryPhone';
    updatedRow[phoneCol] = enrichment.phone;
  }

  // Map first name
  if (enrichment.firstName) {
    const firstNameCol = headers.find(h => 
      (h.toLowerCase().includes('firstname') || h.toLowerCase().includes('first name')) && !row[h]
    ) || 'firstName';
    updatedRow[firstNameCol] = enrichment.firstName;
  }

  // Map last name
  if (enrichment.lastName) {
    const lastNameCol = headers.find(h => 
      (h.toLowerCase().includes('lastname') || h.toLowerCase().includes('last name')) && !row[h]
    ) || 'lastName';
    updatedRow[lastNameCol] = enrichment.lastName;
  }

  // Map address
  if (enrichment.addressLine1) {
    const addressCol = headers.find(h => 
      (h.toLowerCase().includes('addressone') || h.toLowerCase().includes('address1') || h.toLowerCase().includes('street_1')) && !row[h]
    ) || 'addressOne';
    updatedRow[addressCol] = enrichment.addressLine1;
  }

  if (enrichment.addressLine2) {
    const address2Col = headers.find(h => 
      (h.toLowerCase().includes('addresstwo') || h.toLowerCase().includes('address2') || h.toLowerCase().includes('street_2')) && !row[h]
    ) || 'addressTwo';
    updatedRow[address2Col] = enrichment.addressLine2;
  }

  // Extract data from skip-tracing results
  if (enrichment.skipTracingData) {
    const skipData = enrichment.skipTracingData as any;
    
    // Map DOB
    if (skipData.dateOfBirth && !row.dateOfBirth && !row.dob) {
      const dobCol = headers.find(h => 
        (h.toLowerCase().includes('dob') || h.toLowerCase().includes('dateofbirth')) && !row[h]
      ) || 'dateOfBirth';
      updatedRow[dobCol] = skipData.dateOfBirth;
    }

    // Map age
    if (skipData.age && !row.age) {
      updatedRow.age = skipData.age;
    }

    // Map city
    if (skipData.city && !row.city) {
      updatedRow.city = skipData.city;
    }

    // Map state
    if (skipData.state && !row.state) {
      updatedRow.state = skipData.state;
    }

    // Map zipcode
    if (skipData.zipCode || skipData.zip) {
      const zipCol = headers.find(h => 
        (h.toLowerCase().includes('zipcode') || h.toLowerCase().includes('postalcode')) && !row[h]
      ) || 'postalCode';
      updatedRow[zipCol] = skipData.zipCode || skipData.zip;
    }

    // Map income
    if (skipData.income && !row.income && !row.household_income) {
      updatedRow.income = skipData.income;
    }
  }

  // Extract data from skip-tracing v2 results
  if (enrichment.skipTracingV2Data) {
    const skipV2Data = enrichment.skipTracingV2Data as any;
    const addressSearch = skipV2Data.addressSearch || skipV2Data.nameAddressSearch || skipV2Data;
    
    if (Array.isArray(addressSearch) && addressSearch.length > 0) {
      const firstResult = addressSearch[0];
      
      // Map address fields
      if (firstResult.addressLine1 && !enrichment.addressLine1 && !row.addressOne) {
        updatedRow.addressOne = firstResult.addressLine1;
      }
      if (firstResult.city && !row.city) {
        updatedRow.city = firstResult.city;
      }
      if (firstResult.state && !row.state) {
        updatedRow.state = firstResult.state;
      }
      if (firstResult.zipCode && !row.postalCode) {
        updatedRow.postalCode = firstResult.zipCode;
      }
    }
  }

  // Extract income data
  if (enrichment.incomeData) {
    const incomeData = enrichment.incomeData as any;
    if (incomeData.medianIncome && !row.income && !row.household_income) {
      updatedRow.income = incomeData.medianIncome;
    }
  }

  // Extract LinkedIn profile data
  if (enrichment.linkedinProfileData) {
    const linkedinData = enrichment.linkedinProfileData as any;
    
    if (linkedinData.headline && !row.campaignName) {
      updatedRow.campaignName = linkedinData.headline;
    }
    
    if (linkedinData.location && !row.city) {
      const locationParts = linkedinData.location.split(',').map((s: string) => s.trim());
      if (locationParts.length >= 2) {
        updatedRow.city = locationParts[0];
        updatedRow.state = locationParts[1];
      }
    }
  }

  // Extract fresh LinkedIn profile data
  if (enrichment.freshLinkedinProfileData) {
    const freshData = enrichment.freshLinkedinProfileData as any;
    
    if (freshData.firstName && !enrichment.firstName && !row.firstName) {
      updatedRow.firstName = freshData.firstName;
    }
    
    if (freshData.lastName && !enrichment.lastName && !row.lastName) {
      updatedRow.lastName = freshData.lastName;
    }
    
    if (freshData.headline && !row.campaignName) {
      updatedRow.campaignName = freshData.headline;
    }
    
    if (freshData.location && !row.city) {
      const locationParts = freshData.location.split(',').map((s: string) => s.trim());
      if (locationParts.length >= 2) {
        updatedRow.city = locationParts[0];
        updatedRow.state = locationParts[1];
      }
    }
  }

  return updatedRow;
}

/**
 * Main function to enrich CSV file
 */
async function enrichCSVFile(inputPath: string, outputPath: string) {
  console.log(`Reading CSV file: ${inputPath}`);
  
  // Read CSV file
  const csvContent = fs.readFileSync(inputPath, 'utf-8');
  
  // Parse CSV
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
  console.log(`Headers: ${headers.length} columns`);

  // Enrich each row
  const enrichedRows: Record<string, string | number>[] = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    console.log(`\nEnriching row ${i + 1}/${rows.length}...`);
    
    try {
      // Enrich the row
      const enrichment = await enrichRow(row, headers);
      
      // Map enrichment data back to CSV columns
      const updatedRow = mapEnrichmentToCSVColumns(enrichment, row, headers);
      
      enrichedRows.push(updatedRow);
      
      // Log what was enriched
      const enrichedFields: string[] = [];
      if (enrichment.email && !row.email) enrichedFields.push('email');
      if (enrichment.phone && !row.primaryPhone) enrichedFields.push('phone');
      if (enrichment.firstName && !row.firstName) enrichedFields.push('firstName');
      if (enrichment.lastName && !row.lastName) enrichedFields.push('lastName');
      
      if (enrichedFields.length > 0) {
        console.log(`  ✓ Enriched: ${enrichedFields.join(', ')}`);
      } else {
        console.log(`  - No new data found`);
      }
      
      if (enrichment.error) {
        console.log(`  ⚠ Warning: ${enrichment.error}`);
      }
      
      // Add delay to avoid rate limiting
      if (i < rows.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(`  ✗ Error enriching row ${i + 1}:`, error);
      enrichedRows.push(row); // Keep original row on error
    }
  }

  // Convert back to CSV
  const csvOutput = Papa.unparse({
    fields: headers,
    data: enrichedRows.map(row => 
      headers.map(header => row[header] || '')
    ),
  });

  // Write output file
  fs.writeFileSync(outputPath, csvOutput, 'utf-8');
  console.log(`\n✓ Enriched CSV saved to: ${outputPath}`);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: tsx scripts/enrich-csv-leads.ts <input-csv-path> [output-csv-path]');
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

// Run if executed directly
if (require.main === module) {
  main();
}
