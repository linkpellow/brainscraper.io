/**
 * Inngest Functions for Lead Enrichment
 * 
 * Handles background enrichment jobs
 */

import { inngest, enrichmentEvents } from '../inngest';
import { enrichData } from '../enrichData';
import type { ParsedData } from '../parseFile';
import {
  generateJobId,
  saveJobStatus,
  updateJobProgress,
  completeJob,
  failJob,
} from '../jobStatus';

/**
 * Enrich multiple leads in the background
 */
export const enrichLeadsFunction = inngest.createFunction(
  {
    id: 'enrich-leads',
    name: 'Enrich Leads',
    retries: 3,
  },
  {
    event: enrichmentEvents.enrichLeads,
  },
  async ({ event, step }) => {
    console.log(`[ENRICHMENT] 🚀 Function triggered! Job ID: ${event.data?.jobId}`);
    const { jobId, parsedData, metadata } = event.data as {
      jobId: string;
      parsedData: ParsedData;
      metadata?: Record<string, unknown>;
    };

    try {
      // Update job status to running
      await step.run('update-status-running', async () => {
        const job = {
          jobId,
          type: 'enrichment' as const,
          status: 'running' as const,
          progress: { current: 0, total: parsedData.rows.length, percentage: 0 },
          startedAt: new Date().toISOString(),
          metadata,
        };
        saveJobStatus(job);
        return job;
      });

      // Enrich leads with progress tracking
      const enriched = await step.run('enrich-data', async () => {
        return await enrichData(
          parsedData,
          (current, total) => {
            // Update progress (sync version - errors handled internally)
            updateJobProgress(jobId, { current, total });
          }
        );
      });

      // CRITICAL: Aggregate leads to enriched-all-leads.json
      // THIS STEP IS REQUIRED AND CANNOT BE SKIPPED
      // If this fails, the entire job fails and retries
      const aggregationResult = await step.run('aggregate-leads', async () => {
        const { aggregateLeadsWithVerification } = await import('../leadDataManager');
        
        console.log(`[ENRICHMENT] 📊 Starting aggregation: ${enriched.rows.length} enriched rows to process`);
        const result = await aggregateLeadsWithVerification(enriched.rows, jobId);
        
        if (!result.success || !result.verified) {
          const errorMsg = result.error || 'Aggregation failed verification';
          console.error(`[ENRICHMENT] ❌ Aggregation failed: ${errorMsg}`);
          console.error(`[ENRICHMENT] ❌ Input: ${enriched.rows.length} enriched rows, Output: ${result.newLeadsAdded} new leads added`);
          throw new Error(`Lead aggregation failed: ${errorMsg}. This is a critical step and cannot be skipped.`);
        }
        
        if (result.newLeadsAdded === 0 && enriched.rows.length > 0) {
          console.warn(`[ENRICHMENT] ⚠️ WARNING: ${enriched.rows.length} enriched rows processed but 0 new leads added!`);
          console.warn(`[ENRICHMENT] ⚠️ This usually means all leads were duplicates or failed validation.`);
          console.warn(`[ENRICHMENT] ⚠️ Check that leads have: name (non-empty) AND phone (10+ digits)`);
        }
        
        console.log(`[ENRICHMENT] ✅ Aggregated ${result.newLeadsAdded} new leads (total: ${result.totalLeads})`);
        return result;
      });

      // Route enriched leads to configured destination
      await step.run('route-output', async () => {
        try {
          const { routeEnrichedLeads } = await import('../outputRouter');
          await routeEnrichedLeads(enriched.rows);
        } catch (routingError) {
          console.warn('[ENRICHMENT] Failed to route leads:', routingError);
        }
        return { success: true };
      });

      // Send notification
      await step.run('send-notification', async () => {
        try {
          const { notifyScrapeCompleted } = await import('../notifications');
          await notifyScrapeCompleted(jobId, 'linkedin', enriched.rows.length);
        } catch (notifyError) {
          console.warn('[ENRICHMENT] Failed to send notification:', notifyError);
        }
        return { success: true };
      });

      // Mark as completed
      await step.run('mark-completed', async () => {
        await completeJob(jobId, {
          enrichedCount: enriched.rows.length,
          totalLeads: parsedData.rows.length,
          aggregatedCount: aggregationResult.totalLeads,
          newLeadsAdded: aggregationResult.newLeadsAdded,
        });
        return { success: true };
      });

      return {
        success: true,
        jobId,
        enrichedCount: enriched.rows.length,
        aggregatedCount: aggregationResult.totalLeads,
        newLeadsAdded: aggregationResult.newLeadsAdded,
      };
    } catch (error) {
      // Record error for cooldown tracking
      await step.run('record-error', async () => {
        try {
          const { recordError } = await import('../cooldownManager');
          await recordError();
        } catch (cooldownError) {
          console.warn('[ENRICHMENT] Failed to record error:', cooldownError);
        }
        return { success: true };
      });

      // Send error notification
      await step.run('send-error-notification', async () => {
        try {
          const { notifyErrorsDetected } = await import('../notifications');
          await notifyErrorsDetected(jobId, 1, [error instanceof Error ? error.message : 'Unknown error']);
        } catch (notifyError) {
          console.warn('[ENRICHMENT] Failed to send error notification:', notifyError);
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

/**
 * Enrich a single lead in the background
 */
export const enrichLeadFunction = inngest.createFunction(
  {
    id: 'enrich-lead',
    name: 'Enrich Single Lead',
    retries: 2,
  },
  {
    event: enrichmentEvents.enrichLead,
  },
  async ({ event, step }) => {
    const { jobId, row, headers, metadata } = event.data as {
      jobId: string;
      row: Record<string, string | number>;
      headers: string[];
      metadata?: Record<string, unknown>;
    };

    try {
      // Convert single row to ParsedData format
      const parsedData: ParsedData = {
        headers,
        rows: [row],
        rowCount: 1,
        columnCount: headers.length,
      };

      // Update job status
      await step.run('update-status', async () => {
        const job = {
          jobId,
          type: 'enrichment' as const,
          status: 'running' as const,
          progress: { current: 0, total: 1, percentage: 0 },
          startedAt: new Date().toISOString(),
          metadata,
        };
        saveJobStatus(job);
        return job;
      });

      // Enrich the lead
      const enriched = await step.run('enrich', async () => {
        return await enrichData(parsedData, (current, total) => {
          // Update progress (sync version)
          updateJobProgress(jobId, { current, total });
        });
      });

      // CRITICAL: Aggregate lead to enriched-all-leads.json
      // THIS STEP IS REQUIRED AND CANNOT BE SKIPPED
      const aggregationResult = await step.run('aggregate-lead', async () => {
        const { aggregateLeadsWithVerification } = await import('../leadDataManager');
        const result = await aggregateLeadsWithVerification(enriched.rows, jobId);
        
        if (!result.success || !result.verified) {
          const errorMsg = result.error || 'Aggregation failed verification';
          console.error(`[ENRICHMENT] ❌ Single lead aggregation failed: ${errorMsg}`);
          throw new Error(`Lead aggregation failed: ${errorMsg}. This is a critical step and cannot be skipped.`);
        }
        
        return result;
      });

      // Route enriched lead to configured destination
      await step.run('route-output', async () => {
        try {
          const { routeEnrichedLeads } = await import('../outputRouter');
          await routeEnrichedLeads(enriched.rows);
        } catch (routingError) {
          console.warn('[ENRICHMENT] Failed to route lead:', routingError);
        }
        return { success: true };
      });

      // Mark as completed
      await step.run('complete', async () => {
        await completeJob(jobId, {
          enriched: true,
          aggregated: true,
          newLeadsAdded: aggregationResult.newLeadsAdded,
        });
        return { success: true };
      });

      return {
        success: true,
        jobId,
        enrichedRow: enriched.rows[0],
      };
    } catch (error) {
      // Record error for cooldown tracking
      await step.run('record-error', async () => {
        try {
          const { recordError } = await import('../cooldownManager');
          await recordError();
        } catch (cooldownError) {
          console.warn('[ENRICHMENT] Failed to record error:', cooldownError);
        }
        return { success: true };
      });

      // Send error notification
      await step.run('send-error-notification', async () => {
        try {
          const { notifyErrorsDetected } = await import('../notifications');
          await notifyErrorsDetected(jobId, 1, [error instanceof Error ? error.message : 'Unknown error']);
        } catch (notifyError) {
          console.warn('[ENRICHMENT] Failed to send error notification:', notifyError);
        }
        return { success: true };
      });

      await step.run('fail', async () => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await failJob(jobId, errorMessage);
        return { error: errorMessage };
      });

      throw error;
    }
  }
);

export const enrichmentFunctions = [
  enrichLeadsFunction,
  enrichLeadFunction,
];
