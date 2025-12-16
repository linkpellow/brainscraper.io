import * as fs from 'fs';
import * as path from 'path';

const leadsFile = '/Users/linkpellow/Documents/leads.txt';
const outputFile = path.join(process.cwd(), 'data', 'enriched-322-leads.json');

console.log('🚀 RESTORING ALL LEADS FROM leads.txt...\n');

const content = fs.readFileSync(leadsFile, 'utf-8');
const lines = content.split('\n').filter(l => l.trim());

const leads = lines.map((line, index) => {
  const parts = line.split('\t');
  if (parts.length < 11) {
    if (parts.length > 0 && parts[0].trim()) {
      console.log(`⚠️  Line ${index + 1} has ${parts.length} parts, trying to parse anyway`);
    }
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
  
  if (!name) return null;
  
  return {
    name: name || '',
    phone: phone === 'N/A' ? '' : phone,
    email: email === 'N/A' ? '' : email,
    city: city === 'N/A' ? '' : city,
    state: state === 'N/A' ? '' : state,
    zipcode: zipcode === 'N/A' ? '' : zipcode,
    dobOrAge: age === 'N/A' ? '' : age,
    lineType: lineType === 'N/A' ? '' : lineType,
    carrier: carrier === 'N/A' ? '' : carrier,
    searchFilter: searchFilter || '',
    dncStatus: dncStatus || 'UNKNOWN',
  };
}).filter((l): l is NonNullable<typeof l> => l !== null && l.name !== '');

fs.writeFileSync(outputFile, JSON.stringify(leads, null, 2));
console.log(`\n✅ RESTORED ${leads.length} leads with ALL enriched data:`);
console.log(`   - Phone numbers: ${leads.filter(l => l.phone).length}`);
console.log(`   - Zip codes: ${leads.filter(l => l.zipcode).length}`);
console.log(`   - Ages: ${leads.filter(l => l.dobOrAge).length}`);
console.log(`   - Line types: ${leads.filter(l => l.lineType).length}`);
console.log(`   - Carriers: ${leads.filter(l => l.carrier).length}`);
console.log(`\n💾 Saved to: ${outputFile}`);
console.log('\n✅ DONE! Refresh your browser to see all your data restored.');
