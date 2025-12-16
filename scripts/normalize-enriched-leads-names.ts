/**
 * Script to normalize names in enriched leads files (LeadSummary format)
 * Updates the 'name' field in LeadSummary objects to use normalized firstName/lastName
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Normalizes a name by stripping credentials, suffixes, and noise
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
  
  // Step 2: Remove titles like "Dr." at the beginning
  cleaned = cleaned.replace(/^(Dr\.|Dr\s+)/i, '').trim();
  
  // Step 3: Remove parenthetical content
  cleaned = cleaned.replace(/\s*\([^)]*(\)|$)/g, '').trim();
  
  // Step 4: Strip credentials
  const baseCredentialPattern = '(MD|M\\.D\\.|DO|PharmD|Pharm\\.D\\.|CPA|JD|MPH|MBA|PsyD|RN|NP|PA|DDS|DMD|LCSW|LMFT|SHRM[-]?[A-Z]*)';
  const compoundCredentialPattern = new RegExp(`\\b${baseCredentialPattern}\\s*\\/\\s*${baseCredentialPattern}\\b`, 'gi');
  const credentialPattern = new RegExp(`\\b(${baseCredentialPattern}|Pharm\\.\\s*D|SAFe\\s+[A-Z/]*|AKA\\s+.*?|DBA\\s+.*?|The\\s+.*?|Psychotherapist|Guru|Loan\\s+Officer|People's\\s+.*?|Mortgage\\s+Guru|Lean\\s+Six\\s+Sigma|Disabled\\s+Veteran)\\b`, 'gi');
  
  const suffixMatchCompound = cleaned.match(compoundCredentialPattern);
  const suffixMatchIndividual = cleaned.match(credentialPattern);
  const allSuffixes = [...(suffixMatchCompound || []), ...(suffixMatchIndividual || [])];
  const suffixRaw = allSuffixes.length > 0 ? allSuffixes.join(' ').trim() : undefined;
  
  cleaned = cleaned.replace(compoundCredentialPattern, '').trim();
  cleaned = cleaned.replace(credentialPattern, '').trim();
  
  // Step 5: Normalize casing
  if (cleaned === cleaned.toUpperCase() && cleaned.length > 1 && cleaned.match(/[A-Z]/)) {
    cleaned = cleaned.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
  }
  
  // Step 6: Clean remaining characters
  cleaned = cleaned
    .replace(/[^\w\s\-'.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Step 7: Extract first/last name
  const tokens = cleaned.split(/\s+/).filter(t => t.length > 0);
  
  if (tokens.length === 0) {
    return { firstName: '', lastName: '', suffixRaw };
  }
  
  const firstName = tokens[0];
  const commonSuffixes = ['Jr', 'Sr', 'Jr.', 'Sr.', 'II', 'III', 'IV', 'PhD', 'Ph.D', 'MD', 'CPA', 'MBA'];
  let lastName = '';
  if (tokens.length > 1) {
    for (let i = tokens.length - 1; i >= 1; i--) {
      const token = tokens[i];
      const isSingleLetter = token.length === 1;
      const isSuffix = commonSuffixes.includes(token);
      const looksLikeCredential = token.length <= 5 && token === token.toUpperCase() && /^[A-Z-]+$/.test(token);
      
      if (!isSingleLetter && !isSuffix && !looksLikeCredential) {
        lastName = token;
        break;
      }
      if (i === 1 && !lastName) {
        lastName = token;
      }
    }
  }
  
  return { firstName, lastName, suffixRaw };
}

/**
 * Normalizes a LeadSummary object's name field
 */
function normalizeLeadSummary(lead: any): { updated: boolean; oldName: string; newName: string } {
  const oldName = lead.name || '';
  if (!oldName || oldName.trim() === '') {
    return { updated: false, oldName, newName: '' };
  }
  
  const normalized = normalizeName(oldName);
  if (!normalized.firstName && !normalized.lastName) {
    return { updated: false, oldName, newName: oldName };
  }
  
  // Reconstruct name from normalized parts
  const newName = [normalized.firstName, normalized.lastName].filter(Boolean).join(' ').trim();
  
  if (newName !== oldName && newName.length > 0) {
    lead.name = newName;
    return { updated: true, oldName, newName };
  }
  
  return { updated: false, oldName, newName: oldName };
}

/**
 * Processes an enriched leads file
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
        const result = normalizeLeadSummary(leads[i]);
        if (result.updated) {
          updated++;
          console.log(`   ✅ [${i + 1}] "${result.oldName}" → "${result.newName}"`);
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
  console.log('🚀 Starting enriched leads name normalization...\n');
  
  const dataDir = path.join(process.cwd(), 'data');
  
  const files = [
    'enriched-all-leads.json',
    'enriched-leads-required-fields.json',
    're-enriched-leads.json',
  ];
  
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalErrors = 0;
  
  for (const fileName of files) {
    const filePath = path.join(dataDir, fileName);
    if (fs.existsSync(filePath)) {
      const result = processFile(filePath);
      totalProcessed += result.processed;
      totalUpdated += result.updated;
      totalErrors += result.errors;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   Total leads processed: ${totalProcessed}`);
  console.log(`   Names updated: ${totalUpdated}`);
  console.log(`   Errors: ${totalErrors}`);
  console.log('='.repeat(60));
  
  if (totalUpdated > 0) {
    console.log('\n✅ Name normalization complete!');
    console.log('   Refresh your browser to see the updated names.');
  } else {
    console.log('\nℹ️  No names needed updating (or no leads found).');
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
