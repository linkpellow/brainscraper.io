/**
 * Inngest Functions for LinkedIn Scraping
 * 
 * Handles background LinkedIn scraping jobs
 */

import { inngest, scrapingEvents } from '../inngest';
import {
  generateJobId,
  saveJobStatus,
  updateJobProgress,
  completeJob,
  failJob,
} from '../jobStatus';

/**
 * Scrape LinkedIn leads in the background
 */
export const scrapeLinkedInFunction = inngest.createFunction(
  {
    id: 'scrape-linkedin',
    name: 'Scrape LinkedIn Leads',
    retries: 2,
  },
  {
    event: scrapingEvents.scrapeLinkedIn,
  },
  async ({ event, step }) => {
    const { jobId, searchParams, maxPages, maxResults, metadata } = event.data as {
      jobId: string;
      searchParams: Record<string, unknown>;
      maxPages: number;
      maxResults: number;
      metadata?: Record<string, unknown>;
    };

    try {
      // Update job status to running
      await step.run('update-status-running', async () => {
        const job = {
          jobId,
          type: 'scraping' as const,
          status: 'running' as const,
          progress: { current: 0, total: maxPages, percentage: 0 },
          startedAt: new Date().toISOString(),
          metadata: {
            ...metadata,
            searchParams,
            maxPages,
            maxResults,
          },
        };
        saveJobStatus(job);
        return job;
      });

      // Fetch all pages sequentially
      const { allLeads, pagesScraped, rawResponse } = await step.run('scrape-pages', async () => {
        const leads: any[] = [];
        let page = 1;
        let hasMore = true;
        const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
        let fullResponse: any = null;

        if (!RAPIDAPI_KEY) {
          throw new Error('RAPIDAPI_KEY not configured');
        }

        while (hasMore && page <= maxPages && leads.length < maxResults) {
          // Call LinkedIn Sales Navigator API
          const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/linkedin-sales-navigator`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ...searchParams,
              start: (page - 1) * 25, // LinkedIn pagination
              count: 25,
            }),
          });

          if (!response.ok) {
            throw new Error(`API request failed: ${response.statusText}`);
          }

          const result = await response.json();
          
          // Store full response for saving
          if (page === 1) {
            fullResponse = result;
          }
          
          if (result.data?.response?.data) {
            const pageLeads = result.data.response.data;
            leads.push(...pageLeads);
            
            // Update progress (sync version for callbacks)
            updateJobProgress(jobId, {
              current: page,
              total: maxPages,
            });

            // Check if there are more pages
            hasMore = result.pagination?.hasMore || false;
          } else {
            hasMore = false;
          }

          page++;

          // Rate limiting delay
          if (hasMore && page <= maxPages) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        const finalLeads = leads.slice(0, maxResults);
        
        // Update response with final leads
        if (fullResponse && fullResponse.data?.response) {
          fullResponse.data.response.data = finalLeads;
          fullResponse.pagination = {
            ...fullResponse.pagination,
            count: finalLeads.length,
            hasMore: false,
          };
        }

        return {
          allLeads: finalLeads,
          pagesScraped: page - 1,
          rawResponse: fullResponse || { response: { data: finalLeads } },
        };
      });

      // Save scraped results to api-results/ directory
      await step.run('save-results', async () => {
        try {
          const { saveApiResults } = await import('../saveApiResults');
          const savedPath = await saveApiResults(
            'linkedin-sales-navigator',
            searchParams,
            rawResponse,
            allLeads
          );
          
          if (savedPath) {
            console.log(`💾 [SCRAPING] Saved results to: ${savedPath}`);
          }
          return { saved: true, path: savedPath };
        } catch (error) {
          console.error('❌ [SCRAPING] Failed to save results:', error);
          // Don't fail the job if saving fails - results are still in memory
          return { saved: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      });

      // Track scrape usage
      await step.run('track-usage', async () => {
        try {
          const { incrementScrapeCount } = await import('../scrapeUsageTracker');
          if (allLeads.length > 0) {
            await incrementScrapeCount('linkedin', allLeads.length, jobId);
            console.log(`📊 [SCRAPING] Tracked ${allLeads.length} LinkedIn leads in usage counter`);
          }
        } catch (usageError) {
          // Don't fail the job if usage tracking fails
          console.warn('❌ [SCRAPING] Failed to track scrape usage:', usageError);
        }
        return { success: true };
      });

      // Send completion notification
      await step.run('send-notification', async () => {
        try {
          const { notifyScrapeCompleted } = await import('../notifications');
          await notifyScrapeCompleted(jobId, 'linkedin', allLeads.length);
        } catch (notifyError) {
          console.warn('[SCRAPING] Failed to send notification:', notifyError);
        }
        return { success: true };
      });

      // Mark as completed
      await step.run('mark-completed', async () => {
        await completeJob(jobId, {
          leadsCount: allLeads.length,
          pagesScraped,
        });
        return { success: true };
      });

      return {
        success: true,
        jobId,
        leadsCount: allLeads.length,
        leads: allLeads,
      };
    } catch (error) {
      // Record error for cooldown tracking
      await step.run('record-error', async () => {
        try {
          const { recordError } = await import('../cooldownManager');
          await recordError();
        } catch (cooldownError) {
          console.warn('[SCRAPING] Failed to record error:', cooldownError);
        }
        return { success: true };
      });

      // Send error notification
      await step.run('send-error-notification', async () => {
        try {
          const { notifyErrorsDetected } = await import('../notifications');
          await notifyErrorsDetected(jobId, 1, [error instanceof Error ? error.message : 'Unknown error']);
        } catch (notifyError) {
          console.warn('[SCRAPING] Failed to send error notification:', notifyError);
        }
        return { success: true };
      });

      // Mark as failed
      await step.run('mark-failed', async () => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await failJob(jobId, errorMessage);
        return { error: errorMessage };
      });

      throw error;
    }
  }
);

export const scrapingFunctions = [
  scrapeLinkedInFunction,
];
