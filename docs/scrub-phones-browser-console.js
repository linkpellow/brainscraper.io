/**
 * Paste into browser console on any site (or brainscraper.io) to scrub phones
 * and log every field. CORS allows cross-origin.
 *
 * Usage:
 *   1. Open DevTools (F12) -> Console
 *   2. Paste this entire block and run
 */

(async () => {
  const BASE = 'https://brainscraper.io';
  const phones = ['7196414081', '3035551234', '2025551234', '3125551234', '4045551234'];

  for (const phone of phones) {
    const res = await fetch(`${BASE}/api/usha/scrub-phone?phone=${phone}`);
    const d = await res.json();
    console.log(`\n========== ${phone} ==========`);
    if (!d.success) {
      console.log('error:', d.error);
      continue;
    }
    console.log('phone:', d.phone);
    console.log('status:', d.status);
    console.log('isDNC:', d.isDNC);
    console.log('canContact:', d.canContact);
    console.log('reason:', d.reason);
    const inner = (d.data?.data || d.data) || {};
    const cs = inner.contactStatus || {};
    console.log('contactStatus.phoneNumber:', cs.phoneNumber);
    console.log('contactStatus.canContact:', cs.canContact);
    console.log('contactStatus.reason:', cs.reason);
    console.log('contactStatus.expiryDateUTC:', cs.expiryDateUTC);
    console.log('isDoNotCall:', inner.isDoNotCall);
    console.log('objectState:', inner.objectState);
  }

  /* Batch variant – single request, all results (CORS-enabled from agent.ushadvisors.com): */
  console.log('\n========== BATCH ==========');
  try {
    const batch = await fetch(`${BASE}/api/usha/scrub-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumbers: phones }),
    }).then((r) => r.json());
    console.log('success:', batch.success);
    (batch.results || []).forEach((r) => console.log(r));
  } catch (e) {
    console.warn('Batch request failed (often CORS from cross-origin). Use scrub-phone loop above.');
    console.warn(e);
  }
})();
