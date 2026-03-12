/**
 * Inngest Functions for Lead Enrichment
 * 
 * Handles background enrichment jobs
 */

import { inngest, enrichmentEvents } from '../inngest';
import { enrichData } from '../enrichData';
import { extractLeadSummary } from '../extractLeadSummary';
import type { ParsedData } from '../parseFile';
import { saveJobResults } from '../jobResults';
import { normalizeStationConfig, type EnrichmentStation } from '../enrichmentStations';
import {
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
    const { jobId, parsedData, metadata, enabledStations } = event.data as {
      jobId: string;
      parsedData: ParsedData;
      metadata?: Record<string, unknown>;
      enabledStations?: EnrichmentStation[];
    };

    const normalizedStations = enabledStations
      ? Array.from(normalizeStationConfig(new Set(enabledStations)).stations)
      : undefined;

    try {
      // Update job status to running
      await step.run('update-status-running', async () => {
        const job = {
          jobId,
          type: 'enrichment' as const,
          status: 'running' as const,
          progress: { current: 0, total: parsedData.rows.length, percentage: 0 },
          startedAt: new Date().toISOString(),
          metadata: {
            ...metadata,
            ...(normalizedStations ? { enabledStations: normalizedStations } : {}),
          },
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
          },
          undefined,
          normalizedStations ? new Set(normalizedStations) : undefined
        );
      });

      await step.run('save-results', async () => {
        const leadSummaries = enriched.rows.map(row => extractLeadSummary(row, row._enriched));
        const result = await saveJobResults(jobId, 'enrichment', leadSummaries);
        return {
          count: result.count,
        };
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
        const stopLossMetadata = enriched.stopLoss?.triggered
          ? { stopLoss: enriched.stopLoss }
          : {};
        await completeJob(jobId, {
          enrichedCount: enriched.rows.length,
          totalLeads: parsedData.rows.length,
          resultsStored: true,
          resultCount: enriched.rows.length,
          ...(normalizedStations ? { enabledStations: normalizedStations } : {}),
          ...stopLossMetadata,
        });
        return { success: true };
      });

      return {
        success: true,
        jobId,
        enrichedCount: enriched.rows.length,
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
    const { jobId, row, headers, metadata, enabledStations } = event.data as {
      jobId: string;
      row: Record<string, string | number>;
      headers: string[];
      metadata?: Record<string, unknown>;
      enabledStations?: EnrichmentStation[];
    };

    const normalizedStations = enabledStations
      ? Array.from(normalizeStationConfig(new Set(enabledStations)).stations)
      : undefined;

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
          metadata: {
            ...metadata,
            ...(normalizedStations ? { enabledStations: normalizedStations } : {}),
          },
        };
        saveJobStatus(job);
        return job;
      });

      // Enrich the lead
      const enriched = await step.run('enrich', async () => {
        return await enrichData(parsedData, (current, total) => {
          // Update progress (sync version)
          updateJobProgress(jobId, { current, total });
        }, undefined, normalizedStations ? new Set(normalizedStations) : undefined);
      });

      await step.run('save-results', async () => {
        const leadSummaries = enriched.rows.map(resultRow => extractLeadSummary(resultRow, resultRow._enriched));
        const result = await saveJobResults(jobId, 'enrichment', leadSummaries);
        return {
          count: result.count,
        };
      });

      // Mark as completed
      await step.run('complete', async () => {
        await completeJob(jobId, {
          enriched: true,
          resultsStored: true,
          resultCount: enriched.rows.length,
          ...(normalizedStations ? { enabledStations: normalizedStations } : {}),
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
