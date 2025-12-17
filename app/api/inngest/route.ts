/**
 * Inngest API Route Handler
 * 
 * This endpoint receives webhooks from Inngest to trigger background functions
 */

import { serve } from 'inngest/next';
import { inngest } from '@/utils/inngest';
import { enrichmentFunctions } from '@/utils/inngest/enrichment';
import { scrapingFunctions } from '@/utils/inngest/scraping';

// Validate Inngest configuration (warn if missing in production)
if (process.env.NODE_ENV === 'production') {
  if (!process.env.INNGEST_EVENT_KEY && !process.env.INNGEST_SIGNING_KEY) {
    console.warn('⚠️ Inngest keys not configured - background jobs may not work in production');
    console.warn('   Set INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY environment variables');
  }
}

// Export the Inngest serve handler
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    ...enrichmentFunctions,
    ...scrapingFunctions,
  ],
});
