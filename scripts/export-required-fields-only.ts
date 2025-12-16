/**
 * Export a final leads file where every lead has:
 * - phone
 * - age (or DOB-derived age)
 * - state
 * - zip
 *
 * Input:  data/re-enriched-leads.json  (array of LeadSummary)
 * Output: data/enriched-leads-required-fields.json
 */

import * as fs from 'fs';
import * as path from 'path';

interface LeadSummary {
  name: string;
  phone: string;
  dobOrAge: string;
  zipcode: string;
  state: string;
  city: string;
  address: string;
  income: string;
  email: string;
  dncStatus: string;
  lineType?: string;
  carrier?: string;
  normalizedCarrier?: string;
  searchFilter?: string;
}

function calculateAgeFromDobOrAge(dobOrAge: string): string {
  const value = (dobOrAge || '').trim();
  if (!value) return '';

  // If already a plain number, treat as age
  if (/^\d+$/.test(value)) {
    return value;
  }

  // Try parsing as a date to derive age
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return '';
  }

  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    age--;
  }

  return age > 0 ? String(age) : '';
}

async function main() {
  const inputPath = path.join(process.cwd(), 'data', 're-enriched-leads.json');
  const outputPath = path.join(process.cwd(), 'data', 'enriched-leads-required-fields.json');

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Input file not found: ${inputPath}`);
    console.error('💡 Run `tsx scripts/re-enrich-leads-optimized.ts` first to generate re-enriched leads.');
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, 'utf-8');
  const allLeads: LeadSummary[] = JSON.parse(raw);

  console.log(`📥 Loaded ${allLeads.length} leads from re-enriched-leads.json`);

  let kept = 0;
  let droppedNoPhone = 0;
  let droppedNoAge = 0;
  let droppedNoState = 0;
  let droppedNoZip = 0;

  const filtered = allLeads.filter((lead) => {
    const phone = (lead.phone || '').trim();
    const state = (lead.state || '').trim();
    const zipcode = (lead.zipcode || '').trim();
    const age = calculateAgeFromDobOrAge(lead.dobOrAge);

    const hasPhone = phone.length >= 10;
    const hasState = state.length > 0;
    const hasZip = zipcode.length > 0;
    const hasAge = age.length > 0;

    if (!hasPhone) {
      droppedNoPhone++;
      return false;
    }
    if (!hasAge) {
      droppedNoAge++;
      return false;
    }
    if (!hasState) {
      droppedNoState++;
      return false;
    }
    if (!hasZip) {
      droppedNoZip++;
      return false;
    }

    // Persist normalized age so downstream consumers can rely on it
    (lead as any).age = age;
    kept++;
    return true;
  });

  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        metadata: {
          generatedAt: new Date().toISOString(),
          source: 're-enriched-leads.json',
          totalInput: allLeads.length,
          totalKept: kept,
          totalDropped: allLeads.length - kept,
          droppedNoPhone,
          droppedNoAge,
          droppedNoState,
          droppedNoZip,
          requiredFields: ['phone', 'age', 'state', 'zip'],
        },
        leads: filtered,
      },
      null,
      2,
    ),
  );

  console.log(`✅ Kept ${kept} leads with all required fields`);
  console.log(`🗑️  Dropped ${allLeads.length - kept} leads missing required data`);
  console.log(`   - Missing phone: ${droppedNoPhone}`);
  console.log(`   - Missing age:   ${droppedNoAge}`);
  console.log(`   - Missing state: ${droppedNoState}`);
  console.log(`   - Missing zip:   ${droppedNoZip}`);
  console.log(`💾 Saved to: ${outputPath}`);
}

main().catch((err) => {
  console.error('❌ Failed to export required-fields-only leads:', err);
  process.exit(1);
});

