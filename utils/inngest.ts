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
    console.error('❌ [INNGEST] INNGEST_EVENT_KEY is not set! Background jobs will not work.');
    console.error('   Set INNGEST_EVENT_KEY environment variable in Railway');
  } else {
    console.log(`✅ [INNGEST] Event key configured: ${eventKey.substring(0, 15)}...`);
  }
}

// Create Inngest client
export const inngest = new Inngest({
  id: 'brainscraper-io',
  name: 'BrainScraper.io',
  eventKey: eventKey,
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
