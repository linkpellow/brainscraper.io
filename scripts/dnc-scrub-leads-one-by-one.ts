/**
 * Automatic DNC Scrub - Processes leads one by one in the background
 * Uses the single phone API endpoint to scrub each phone number individually
 * Usage: npx tsx scripts/dnc-scrub-leads-one-by-one.ts <input-csv> [output-csv]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import Papa from 'papaparse';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const USHA_API_URL = 'https://api-business-agent.ushadvisors.com/Leads/api/leads/scrubphonenumber';
const DEFAULT_AGENT_NUMBER = '00044447';
const DELAY_BETWEEN_REQUESTS = 500; // 500ms delay between requests to avoid rate limiting

// Use the authenticated token (will be replaced with automatic token handling later)
const AUTHENTICATED_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlM2FkZjhjNC04ZWM2LTQ1YzctYTI3MC1iMmJmYjAyMThlNjAiLCJzdWIiOiI1RjlFMjBGQS1FMEQzLTQwQzQtQTUzMS0wREIzOTAwN0Q4REEiLCJ1bmlxdWVfbmFtZSI6IkxJTksuUEVMTE9XQHVzaGFkdmlzb3JzLmNvbSIsIk5hbWUiOiJMSU5LLlBFTExPV0B1c2hhZHZpc29ycy5jb20iLCJFbWFpbCI6IkxJTksuUEVMTE9XQHVzaGFkdmlzb3JzLmNvbSIsIkFnZW50TnVtYmVyIjoiMDAwNDQ0NDciLCJDdXJyZW50Q29udGV4dEFnZW50TnVtYmVyIjoiMDAwNDQ0NDciLCJDdXJyZW50Q29udGV4dEFnZW50SUQiOiI0MjY5MiIsIkN1cnJlbnRDb250ZXh0QWdlbmN5VGl0bGUiOiJXQSIsIklkIjoiNUY5RTIwRkEtRTBEMy00MEM0LUE1MzEtMERCMzkwMDdEOERBIiwiZXhwIjoxNzY1OTMwMTIxLCJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjUxMzcwIiwiYXVkIjoiaHR0cDovL2xvY2FsaG9zdDo1MTM3MCJ9.UVgVzF1QEKl8wSrjQji2qN3VEtoKx1wiID_ExqOApuM';

interface LeadRow {
  [key: string]: string | number;
}

interface DNCResult {
  isDoNotCall: boolean;
  canContact: boolean;
  reason?: string;
  error?: string;
}

/**
 * Scrub a single phone number using the USHA API
 */
async function scrubPhoneNumber(
  phone: string,
  token: string = AUTHENTICATED_TOKEN,
  agentNumber: string = DEFAULT_AGENT_NUMBER
): Promise<DNCResult> {
  // Clean phone number - remove all non-digits
  const cleanedPhone = phone.replace(/\D/g, '');
  
  if (cleanedPhone.length < 10) {
    return {
      isDoNotCall: false,
      canContact: true,
      reason: 'Invalid phone number format',
      error: 'Phone number too short'
    };
  }

  try {
    const url = `${USHA_API_URL}?currentContextAgentNumber=${encodeURIComponent(agentNumber)}&phone=${encodeURIComponent(cleanedPhone)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://agent.ushadvisors.com',
        'Referer': 'https://agent.ushadvisors.com',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        isDoNotCall: false,
        canContact: true,
        reason: `API Error: ${response.statusText}`,
        error: errorText
      };
    }

    const result = await response.json();
    
    // Parse response - check nested data structure
    const responseData = result.data || result;
    const isDNC = responseData.isDoNotCall === true || 
                  responseData.contactStatus?.canContact === false;
    const canContact = responseData.contactStatus?.canContact !== false && !isDNC;
    const reason = responseData.contactStatus?.reason || responseData.reason || 
                   (isDNC ? 'Do Not Call' : undefined);

    return {
      isDoNotCall: isDNC,
      canContact: canContact,
      reason: reason
    };
  } catch (error) {
    return {
      isDoNotCall: false,
      canContact: true,
      reason: 'Error checking DNC',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Find phone number in a row by checking multiple column names
 */
function findPhoneNumber(row: LeadRow): string | null {
  const phoneColumns = [
    'phone',
    'Phone',
    'primaryPhone',
    'PrimaryPhone',
    'phoneNumber',
    'PhoneNumber',
    'mobile',
    'Mobile',
    '_matched_phone_10'
  ];

  for (const col of phoneColumns) {
    if (row[col] && String(row[col]).trim()) {
      return String(row[col]).trim();
    }
  }

  return null;
}

/**
 * Main function to scrub leads from CSV file
 */
async function scrubLeadsFromCSV(
  inputFilePath: string,
  outputFilePath: string,
  token: string = AUTHENTICATED_TOKEN
) {
  console.log(`\n🔍 Starting Automatic DNC Scrub Process\n`);
  console.log(`📁 Input file: ${inputFilePath}`);
  console.log(`📁 Output file: ${outputFilePath}`);
  console.log(`🔑 Using authenticated token\n`);

  // Read CSV file
  const csvContent = fs.readFileSync(inputFilePath, 'utf-8');
  const parseResult = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim(),
    transform: (value: string) => value.trim(),
  });

  if (parseResult.errors.length > 0) {
    console.warn('⚠️  CSV parsing warnings:', parseResult.errors);
  }

  const headers = parseResult.meta.fields || [];
  const records: LeadRow[] = parseResult.data as LeadRow[];

  console.log(`📊 Found ${records.length} leads in CSV\n`);

  // Add DNC columns if they don't exist
  const dncColumns = ['dncStatus', 'isDoNotCall', 'canContact', 'dncReason'];
  const newHeaders = [...headers];
  dncColumns.forEach(col => {
    if (!newHeaders.includes(col)) {
      newHeaders.push(col);
    }
  });

  // Track statistics
  let processed = 0;
  let withPhone = 0;
  let dncCount = 0;
  let canContactCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  // Process each lead one by one
  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const phone = findPhoneNumber(row);

    if (!phone) {
      // No phone number, mark as unknown
      row.dncStatus = 'Unknown';
      row.canContact = 'Unknown';
      row.isDoNotCall = 'Unknown';
      row.dncReason = 'No phone number';
      skippedCount++;
      continue;
    }

    withPhone++;
    processed++;

    // Clean phone for display
    const cleanedPhone = phone.replace(/\D/g, '');
    
    process.stdout.write(`[${processed}/${withPhone}] Scrubbing ${cleanedPhone}... `);

    try {
      // Scrub phone number using single phone API
      const dncResult = await scrubPhoneNumber(phone, token);

      // Populate DNC fields
      row.dncStatus = dncResult.isDoNotCall ? 'Do Not Call' : 'Safe';
      row.isDoNotCall = dncResult.isDoNotCall ? 'Yes' : 'No';
      row.canContact = dncResult.canContact ? 'Yes' : 'No';
      row.dncReason = dncResult.reason || '';

      if (dncResult.isDoNotCall) {
        dncCount++;
        console.log(`❌ DNC: ${dncResult.reason || 'Do Not Call'}`);
      } else {
        canContactCount++;
        console.log(`✅ Safe`);
      }

      if (dncResult.error) {
        errorCount++;
        console.log(`⚠️  Error: ${dncResult.error}`);
      }

      // Delay between requests to avoid rate limiting
      if (i < records.length - 1) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
      }
    } catch (error) {
      errorCount++;
      row.dncStatus = 'Error';
      row.canContact = 'Unknown';
      row.isDoNotCall = 'Unknown';
      row.dncReason = error instanceof Error ? error.message : 'Unknown error';
      console.log(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Write updated CSV
  const csvOutput = Papa.unparse({
    fields: newHeaders,
    data: records.map(row => 
      newHeaders.map(header => String(row[header] || ''))
    ),
  });

  fs.writeFileSync(outputFilePath, csvOutput, 'utf-8');

  // Print summary
  console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 DNC SCRUB SUMMARY`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Total Leads:        ${records.length}`);
  console.log(`With Phone:         ${withPhone}`);
  console.log(`Processed:          ${processed}`);
  console.log(`Skipped (no phone): ${skippedCount}`);
  console.log(`🔴 Do Not Call:      ${dncCount}`);
  console.log(`🟢 Safe to Call:    ${canContactCount}`);
  console.log(`⚠️  Errors:          ${errorCount}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  console.log(`✅ Updated CSV saved to: ${outputFilePath}\n`);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: npx tsx scripts/dnc-scrub-leads-one-by-one.ts <input-csv-path> [output-csv-path]');
    console.error('\nExample:');
    console.error('  npx tsx scripts/dnc-scrub-leads-one-by-one.ts app/leads.csv');
    console.error('  npx tsx scripts/dnc-scrub-leads-one-by-one.ts app/leads.csv app/leads-dnc-scrubbed.csv');
    process.exit(1);
  }

  const inputPath = path.resolve(args[0]);
  const outputPath = args[1] 
    ? path.resolve(args[1])
    : inputPath.replace('.csv', '_DNC_SCRUBBED.csv');

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ ERROR: File not found: ${inputPath}`);
    process.exit(1);
  }

  // Get token from env or use authenticated token
  const token = process.env.USHA_JWT_TOKEN || AUTHENTICATED_TOKEN;

  if (!token) {
    console.error('❌ ERROR: USHA_JWT_TOKEN not found');
    console.error('Add USHA_JWT_TOKEN=your-token to .env.local');
    process.exit(1);
  }

  console.log('🚀 Starting automatic background DNC scrub...\n');

  try {
    await scrubLeadsFromCSV(inputPath, outputPath, token);
    console.log('✅ DNC scrub complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
