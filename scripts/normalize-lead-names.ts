/**
 * Script to normalize names in lead data files
 * Fixes names with credentials, titles, emojis, and role descriptors
 * Updates firstName/lastName fields in the data files
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Normalizes a name by stripping credentials, suffixes, and noise
 * Returns: { firstName: string, lastName: string, suffixRaw?: string }
 */
interface NormalizedName {
  firstName: string;
  lastName: string;
  suffixRaw?: string;
}

function normalizeName(fullName: string): NormalizedName {
  if (!fullName) return { firstName: '', lastName: '' };
  
  // Step 1: Remove emojis and special unicode characters
  let cleaned = fullName
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emojis
    .replace(/[\u{2600}-\u{26FF}]/gu, '') // Remove miscellaneous symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '') // Remove dingbats
    .replace(/[★☀️🦊🚀🎯]/g, '') // Remove specific symbols
    .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
    .trim();
  
  // Step 2: Remove titles like "Dr." at the beginning (handle variations)
  cleaned = cleaned.replace(/^(Dr\.|Dr\s+)/i, '').trim();
  
  // Step 3: Remove parenthetical content (e.g., "(Bill)", "(Disabled Veteran)", "(MHA...", "(She...")
  // Also handle truncated parentheses like "(MHA (truncated..."
  cleaned = cleaned.replace(/\s*\([^)]*(\)|$)/g, '').trim();
  
  // Step 4: Strip credentials and noise using deny-list regex
  const baseCredentialPattern = '(MD|M\\.D\\.|DO|PharmD|Pharm\\.D\\.|CPA|JD|MPH|MBA|PsyD|RN|NP|PA|DDS|DMD|LCSW|LMFT|SHRM[-]?[A-Z]*)';
  
  // Handle compound credentials like "MD/MPH" first (before individual ones)
  const compoundCredentialPattern = new RegExp(`\\b${baseCredentialPattern}\\s*\\/\\s*${baseCredentialPattern}\\b`, 'gi');
  
  // Handle individual credentials and phrases
  // Also handle "Pharm. D" as a compound credential
  const credentialPattern = new RegExp(`\\b(${baseCredentialPattern}|Pharm\\.\\s*D|SAFe\\s+[A-Z/]*|AKA\\s+.*?|DBA\\s+.*?|The\\s+.*?|Psychotherapist|Guru|Loan\\s+Officer|People's\\s+.*?|Mortgage\\s+Guru|Lean\\s+Six\\s+Sigma|Disabled\\s+Veteran)\\b`, 'gi');
  
  // Extract suffix before removing it (check compound first, then individual)
  const suffixMatchCompound = cleaned.match(compoundCredentialPattern);
  const suffixMatchIndividual = cleaned.match(credentialPattern);
  const allSuffixes = [...(suffixMatchCompound || []), ...(suffixMatchIndividual || [])];
  const suffixRaw = allSuffixes.length > 0 ? allSuffixes.join(' ').trim() : undefined;
  
  // Remove credentials (compound first, then individual)
  cleaned = cleaned.replace(compoundCredentialPattern, '').trim();
  cleaned = cleaned.replace(credentialPattern, '').trim();
  
  // Step 5: Normalize casing (convert all caps to title case, but preserve existing mixed case)
  // Only convert if entire string is uppercase
  if (cleaned === cleaned.toUpperCase() && cleaned.length > 1 && cleaned.match(/[A-Z]/)) {
    cleaned = cleaned.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
  }
  
  // Step 6: Remove any remaining non-name characters (preserve apostrophes and hyphens)
  cleaned = cleaned
    .replace(/[^\w\s\-'.]/g, '') // Keep only word chars, spaces, hyphens, apostrophes, periods
    .replace(/\s+/g, ' ') // Normalize spaces again
    .trim();
  
  // Step 7: Handle middle initials/names - keep them but don't use as last name
  // Split and extract first/last name
  const tokens = cleaned.split(/\s+/).filter(t => t.length > 0);
  
  if (tokens.length === 0) {
    return { firstName: '', lastName: '', suffixRaw };
  }
  
  // First token = first_name
  const firstName = tokens[0];
  
  // Last valid token = last_name (if more than one token)
  // Skip single-letter tokens (middle initials) and common suffixes
  const commonSuffixes = ['Jr', 'Sr', 'Jr.', 'Sr.', 'II', 'III', 'IV', 'PhD', 'Ph.D', 'MD', 'CPA', 'MBA'];
  let lastName = '';
  if (tokens.length > 1) {
    // Find the last token that's:
    // - Not a single letter (middle initial)
    // - Not a common suffix
    // - Not all caps if it's a short credential-like string
    for (let i = tokens.length - 1; i >= 1; i--) {
      const token = tokens[i];
      const isSingleLetter = token.length === 1;
      const isSuffix = commonSuffixes.includes(token);
      const looksLikeCredential = token.length <= 5 && token === token.toUpperCase() && /^[A-Z-]+$/.test(token);
      
      if (!isSingleLetter && !isSuffix && !looksLikeCredential) {
        lastName = token;
        break;
      }
      // If we're at the last token and haven't found a good one, use it anyway
      if (i === 1 && !lastName) {
        lastName = token;
      }
    }
  }
  
  return { firstName, lastName, suffixRaw };
}

/**
 * Processes a single lead and normalizes its name
 */
function normalizeLead(lead: any): { updated: boolean; changes: string[] } {
  const changes: string[] = [];
  let updated = false;
  
  // Try to find the name field
  const nameField = lead.Name || lead.name || lead.fullName || lead.full_name || 
    (lead.firstName || lead.first_name ? 
      `${lead.firstName || lead.first_name} ${lead.lastName || lead.last_name || ''}`.trim() : 
      null);
  
  if (!nameField) {
    return { updated: false, changes: ['No name field found'] };
  }
  
  // Normalize the name
  const normalized = normalizeName(nameField);
  
  if (!normalized.firstName && !normalized.lastName) {
    return { updated: false, changes: [`Could not parse name: "${nameField}"`] };
  }
  
  // Update firstName/lastName fields
  const oldFirstName = lead['First Name'] || lead.firstName || lead.first_name || '';
  const oldLastName = lead['Last Name'] || lead.lastName || lead.last_name || '';
  
  if (normalized.firstName && normalized.firstName !== oldFirstName) {
    lead['First Name'] = normalized.firstName;
    lead.firstName = normalized.firstName;
    lead.first_name = normalized.firstName;
    changes.push(`firstName: "${oldFirstName}" → "${normalized.firstName}"`);
    updated = true;
  }
  
  if (normalized.lastName && normalized.lastName !== oldLastName) {
    lead['Last Name'] = normalized.lastName;
    lead.lastName = normalized.lastName;
    lead.last_name = normalized.lastName;
    changes.push(`lastName: "${oldLastName}" → "${normalized.lastName}"`);
    updated = true;
  }
  
  // Store suffix for reference
  if (normalized.suffixRaw) {
    lead.nameSuffix = normalized.suffixRaw;
    changes.push(`suffix: "${normalized.suffixRaw}"`);
  }
  
  return { updated, changes };
}

/**
 * Processes all leads in a JSON file
 */
function processFile(filePath: string): { processed: number; updated: number; errors: number } {
  console.log(`\n📄 Processing: ${filePath}`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    let leads: any[] = [];
    let isMetadataFormat = false;
    
    // Handle different file formats
    if (data.leads && Array.isArray(data.leads)) {
      leads = data.leads;
      isMetadataFormat = true;
    } else if (data.processedResults && Array.isArray(data.processedResults)) {
      leads = data.processedResults;
    } else if (data.rawResponse?.response?.data && Array.isArray(data.rawResponse.response.data)) {
      leads = data.rawResponse.response.data;
    } else if (Array.isArray(data)) {
      leads = data;
    } else {
      console.log(`⚠️  Unknown file format, skipping`);
      return { processed: 0, updated: 0, errors: 0 };
    }
    
    console.log(`   Found ${leads.length} leads`);
    
    let updated = 0;
    let errors = 0;
    
    for (let i = 0; i < leads.length; i++) {
      try {
        const result = normalizeLead(leads[i]);
        if (result.updated) {
          updated++;
          if (result.changes.length > 0) {
            const nameField = leads[i].Name || leads[i].name || 'Unknown';
            console.log(`   ✅ [${i + 1}] ${nameField}: ${result.changes.join(', ')}`);
          }
        }
      } catch (error) {
        errors++;
        console.error(`   ❌ [${i + 1}] Error:`, error);
      }
    }
    
    // Save updated file
    if (updated > 0 || errors > 0) {
      const output = isMetadataFormat ? { ...data, leads } : leads;
      fs.writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf-8');
      console.log(`   💾 Saved ${updated} updated leads`);
    }
    
    return { processed: leads.length, updated, errors };
  } catch (error) {
    console.error(`   ❌ Error processing file:`, error);
    return { processed: 0, updated: 0, errors: 1 };
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting name normalization script...\n');
  
  const dataDir = path.join(process.cwd(), 'data');
  const apiResultsDir = path.join(dataDir, 'api-results');
  
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalErrors = 0;
  
  // Process files in api-results directory
  if (fs.existsSync(apiResultsDir)) {
    console.log('📁 Processing api-results directory...');
    const files = fs.readdirSync(apiResultsDir)
      .filter(f => f.endsWith('.json'))
      .sort();
    
    for (const file of files) {
      const filePath = path.join(apiResultsDir, file);
      const result = processFile(filePath);
      totalProcessed += result.processed;
      totalUpdated += result.updated;
      totalErrors += result.errors;
    }
  }
  
  // Process enriched leads files
  const enrichedFiles = [
    'enriched-all-leads.json',
    'enriched-leads-required-fields.json',
    're-enriched-leads.json',
  ];
  
  console.log('\n📁 Processing enriched leads files...');
  for (const fileName of enrichedFiles) {
    const filePath = path.join(dataDir, fileName);
    if (fs.existsSync(filePath)) {
      const result = processFile(filePath);
      totalProcessed += result.processed;
      totalUpdated += result.updated;
      totalErrors += result.errors;
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   Total leads processed: ${totalProcessed}`);
  console.log(`   Leads updated: ${totalUpdated}`);
  console.log(`   Errors: ${totalErrors}`);
  console.log('='.repeat(60));
  
  if (totalUpdated > 0) {
    console.log('\n✅ Name normalization complete!');
    console.log('   Updated leads now have clean firstName/lastName fields.');
  } else {
    console.log('\nℹ️  No leads needed updating (or no leads found).');
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
