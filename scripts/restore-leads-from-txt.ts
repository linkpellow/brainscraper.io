/**
 * Restore leads from the saved text file to localStorage
 * Parses tab-separated data and converts to LeadSummary format
 */

import * as fs from 'fs';
import * as path from 'path';
import type { LeadSummary } from '../utils/extractLeadSummary';

function parseLeadsFromTxt(filePath: string): LeadSummary[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  const leads: LeadSummary[] = [];
  
  for (const line of lines) {
    // Split by tab character
    const parts = line.split('\t');
    
    if (parts.length < 10) {
      console.warn(`Skipping line with insufficient columns: ${line.substring(0, 50)}...`);
      continue;
    }
    
    const name = parts[0]?.trim() || '';
    const phone = parts[1]?.trim() || '';
    const email = parts[2]?.trim() || '';
    const city = parts[3]?.trim() || '';
    const state = parts[4]?.trim() || '';
    const zipcode = parts[5]?.trim() || '';
    const age = parts[6]?.trim() || '';
    const lineType = parts[7]?.trim() || '';
    const carrier = parts[8]?.trim() || '';
    const searchFilter = parts[9]?.trim() || '';
    const dncStatus = parts[10]?.trim() || 'UNKNOWN';
    
    // Skip if no name
    if (!name || name === 'N/A') {
      continue;
    }
    
    // Convert age to dobOrAge (use age if it's a number, otherwise empty)
    const dobOrAge = age && age !== 'N/A' ? age : '';
    
    const lead: LeadSummary = {
      name,
      phone: phone !== 'N/A' ? phone : '',
      dobOrAge,
      zipcode: zipcode !== 'N/A' ? zipcode : '',
      state: state !== 'N/A' ? state : '',
      city: city !== 'N/A' ? city : '',
      email: email !== 'N/A' ? email : '',
      dncStatus: dncStatus || 'UNKNOWN',
      lineType: lineType !== 'N/A' ? lineType : undefined,
      carrier: carrier !== 'N/A' ? carrier : undefined,
      searchFilter: searchFilter || undefined,
    };
    
    leads.push(lead);
  }
  
  return leads;
}

async function main() {
  const txtFilePath = '/Users/linkpellow/Documents/leads.txt';
  const outputPath = path.join(process.cwd(), 'data', 'restored-leads.json');
  
  console.log('📖 Reading leads from text file...');
  const leads = parseLeadsFromTxt(txtFilePath);
  
  console.log(`✅ Parsed ${leads.length} leads from text file`);
  
  // Save to JSON file
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(leads, null, 2));
  
  console.log(`💾 Saved restored leads to: ${outputPath}`);
  console.log(`\n📊 Summary:`);
  console.log(`  Total leads: ${leads.length}`);
  console.log(`  With phone: ${leads.filter(l => l.phone).length}`);
  console.log(`  With email: ${leads.filter(l => l.email).length}`);
  console.log(`  With zipcode: ${leads.filter(l => l.zipcode).length}`);
  console.log(`  With age: ${leads.filter(l => l.dobOrAge).length}`);
  
  console.log(`\n✨ To restore to the enriched leads page:`);
  console.log(`  1. Open your browser's developer console`);
  console.log(`  2. Run: localStorage.setItem('enrichedLeads', JSON.stringify(${JSON.stringify(leads)}));`);
  console.log(`  3. Or copy the contents of ${outputPath} and paste into localStorage`);
}

main().catch(console.error);
