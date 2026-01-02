/**
 * Inngest Client Configuration
 * 
 * Centralized Inngest client for background job processing
 */

import { Inngest } from 'inngest';

// Get event key - handle both build-time and runtime
const eventKey = process.env.INNGEST_EVENT_KEY;

// Log event key status (only in server context)
if (typeof window === 'undefined') {
  if (!eventKey) {
    console.warn('⚠️ [INNGEST] INNGEST_EVENT_KEY not found at module load. SDK will read from environment at runtime.');
  } else {
    console.log(`✅ [INNGEST] Event key found: ${eventKey.substring(0, 15)}...`);
  }
}

// Create Inngest client
// Only pass eventKey if it's defined - otherwise let SDK read from env automatically
// This is important because Next.js may not have env vars at build time, but they're available at runtime
export const inngest = new Inngest({
  id: 'brainscraper-io',
  name: 'BrainScraper.io',
  ...(eventKey ? { eventKey } : {}), // Only include eventKey if it's defined
});

// Event types for type safety
export const enrichmentEvents = {
  enrichLeads: 'enrichment/enrich-leads',
  enrichLead: 'enrichment/enrich-lead',
} as const;

export const scrapingEvents = {
  scrapeLinkedIn: 'scraping/scrape-linkedin',
  scrapePage: 'scraping/scrape-page',
} as const;

export const jobEvents = {
  jobStarted: 'jobs/started',
  jobProgress: 'jobs/progress',
  jobCompleted: 'jobs/completed',
  jobFailed: 'jobs/failed',
} as const;
