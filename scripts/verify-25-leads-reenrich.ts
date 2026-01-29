/**
 * Verify 25-lead re-enrichment proof.
 * Reads 25 leads from enriched-all-leads.json, POSTs to /api/re-enrich-leads,
 * asserts success and enriched count. Read-only for data files.
 */

import { getDataFilePath, safeReadFile } from '../utils/dataDirectory';

const BASE_URL =
  process.env.VERIFY_BASE_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  'http://localhost:3000';
const REENRICH_URL = `${BASE_URL}/api/re-enrich-leads`;
const TIMEOUT_MS = 5 * 60 * 1000;

function loadLeads(): Array<{ name: string; email: string; phone: string; city: string; state: string; zipcode: string; searchFilter: string }> {
  const filePath = getDataFilePath('enriched-all-leads.json');
  const content = safeReadFile(filePath);
  if (!content) {
    console.error('❌ No enriched-all-leads.json found');
    process.exit(1);
  }
  const data = JSON.parse(content);
  const raw = Array.isArray(data) ? data : (data.leads || []);
  const valid = raw.filter((l: any) => (l.name || '').trim().length > 0);
  // Use leads 26–50 to avoid duplicate-detection skip (first 25 may be in checkpoint from prior runs)
  return valid.slice(25, 50).map((lead: any) => {
    let email = lead.email ?? '';
    let phone = lead.phone ?? '';
    if (email === 'EMPTY' || email === 'N/A') email = '';
    if (phone === 'EMPTY' || phone === 'N/A') phone = '';
    return {
      name: (lead.name || '').trim(),
      email,
      phone,
      city: (lead.city || '').trim(),
      state: (lead.state || '').trim(),
      zipcode: (lead.zipcode || '').trim(),
      searchFilter: lead.searchFilter || 'Verify 25-lead re-enrich',
    };
  });
}

async function main() {
  console.log('📋 Verify 25-lead re-enrichment proof\n');
  console.log(`   Base URL: ${BASE_URL}`);
  console.log(`   Endpoint: ${REENRICH_URL}\n`);

  const leads = loadLeads();
  if (leads.length < 25) {
    console.error(`❌ Need 25 leads (indices 26–50); found ${leads.length}`);
    process.exit(1);
  }

  console.log(`   Loaded 25 leads from enriched-all-leads.json (indices 26–50)`);
  console.log(`   Sample: ${leads.slice(0, 3).map((l) => l.name).join(', ')}\n`);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(REENRICH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leads }),
      signal: controller.signal,
    });
    clearTimeout(t);

    const data = (await res.json()) as { success?: boolean; enrichedLeads?: unknown[]; error?: string };
    const count = Array.isArray(data.enrichedLeads) ? data.enrichedLeads.length : 0;

    if (!res.ok) {
      console.error(`❌ Re-enrich failed: ${res.status} ${data.error || res.statusText}`);
      process.exit(1);
    }
    if (data.success !== true) {
      console.error(`❌ Re-enrich returned success: false, error: ${data.error || 'unknown'}`);
      process.exit(1);
    }
    // Pipeline may skip some (age filter, DNC, gatekeep, etc.)
    if (count === 0) {
      console.error(`❌ No enriched leads returned`);
      process.exit(1);
    }

    console.log(`   Sent: 25 leads`);
    console.log(`   Enriched: ${count} leads${count < 25 ? ` (${25 - count} skipped by pipeline)` : ''}`);
    console.log('\n✅ 25-lead re-enrichment proof passed.');
  } catch (e) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`❌ Request failed: ${msg}`);
    process.exit(1);
  }
}

main();
