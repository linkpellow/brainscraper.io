/**
 * Inngest API Route Handler
 *
 * This endpoint receives webhooks from Inngest to trigger background functions.
 * Keys (INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY) let the app send events; Inngest
 * must also know this URL to run jobs. On Railway you must sync the app in
 * Inngest Cloud: paste https://<your-railway-domain>/api/inngest and click Sync.
 * See docs/inngest-railway-sync.md.
 */

import { serve } from 'inngest/next';
import { inngest } from '@/utils/inngest';
import { enrichmentFunctions } from '@/utils/inngest/enrichment';
import { scrapingFunctions } from '@/utils/inngest/scraping';
import { facebookAutomatedLeadSearchFunction } from '@/utils/inngest/facebookAutomated';
import { warnMatchLinkedInFunction } from '@/utils/inngest/warnMatchLinkedIn';

if (process.env.NODE_ENV === 'production') {
  if (!process.env.INNGEST_EVENT_KEY || !process.env.INNGEST_SIGNING_KEY) {
    console.warn('⚠️ Inngest keys not configured - set INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY');
  }
}

// Export the Inngest serve handler
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    ...enrichmentFunctions,
    ...scrapingFunctions,
    facebookAutomatedLeadSearchFunction,
    warnMatchLinkedInFunction,
  ],
});
