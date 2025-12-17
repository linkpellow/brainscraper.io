/**
 * Inngest Client Configuration
 * 
 * Centralized Inngest client for background job processing
 */

import { Inngest } from 'inngest';

// Create Inngest client
export const inngest = new Inngest({
  id: 'brainscraper-io',
  name: 'BrainScraper.io',
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
