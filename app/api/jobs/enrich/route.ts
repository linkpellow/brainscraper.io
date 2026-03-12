/**
 * API Route to Trigger Enrichment Job
 *
 * Creates a background job for enriching leads. For small batches (sync: true, ≤SYNC_MAX rows),
 * runs enrichment in-process so it does not depend on Inngest.
 */

import { NextRequest, NextResponse } from 'next/server';
import { inngest, enrichmentEvents } from '@/utils/inngest';
import { generateJobId, saveJobStatus, updateJobProgress, completeJob, failJob } from '@/utils/jobStatus';
import { saveJobResults } from '@/utils/jobResults';
import { enrichData } from '@/utils/enrichData';
import { extractLeadSummary } from '@/utils/extractLeadSummary';
import type { ParsedData } from '@/utils/parseFile';
import {
  normalizeStationId,
  normalizeStationConfig,
  type EnrichmentStation,
} from '@/utils/enrichmentStations';

const SYNC_MAX = 50;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { parsedData, metadata, enabledStations, sync } = body as {
      parsedData: ParsedData;
      metadata?: Record<string, unknown>;
      enabledStations?: unknown;
      sync?: boolean;
    };

    // Input validation
    if (!parsedData) {
      return NextResponse.json(
        { success: false, error: 'parsedData is required' },
        { status: 400 }
      );
    }

    if (!parsedData.rows || !Array.isArray(parsedData.rows)) {
      return NextResponse.json(
        { success: false, error: 'parsedData.rows must be an array' },
        { status: 400 }
      );
    }

    if (!parsedData.headers || !Array.isArray(parsedData.headers)) {
      return NextResponse.json(
        { success: false, error: 'parsedData.headers must be an array' },
        { status: 400 }
      );
    }

    if (parsedData.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'parsedData.rows cannot be empty' },
        { status: 400 }
      );
    }

    if (parsedData.rows.length > 10000) {
      return NextResponse.json(
        { success: false, error: 'Maximum 10,000 leads per job. Please split into smaller batches.' },
        { status: 400 }
      );
    }

    if (enabledStations !== undefined && !Array.isArray(enabledStations)) {
      return NextResponse.json(
        { success: false, error: 'enabledStations must be an array when provided' },
        { status: 400 }
      );
    }

    if (Array.isArray(enabledStations) && enabledStations.some(station => typeof station !== 'string')) {
      return NextResponse.json(
        { success: false, error: 'enabledStations must contain only string station ids' },
        { status: 400 }
      );
    }

    const requestedStations = Array.isArray(enabledStations)
      ? enabledStations as string[]
      : undefined;

    const invalidStations = requestedStations?.filter(
      station => !normalizeStationId(station)
    ) || [];

    if (invalidStations.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid enabledStations value(s): ${invalidStations.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const normalizedStationConfig = requestedStations
      ? normalizeStationConfig(requestedStations)
      : undefined;

    const effectiveStations = normalizedStationConfig
      ? Array.from(normalizedStationConfig.stations)
      : undefined;

    const stationIssues = normalizedStationConfig?.issues.map(issue =>
      `${issue.station} disabled because ${issue.missingDependencies.join(', ')} ${issue.missingDependencies.length === 1 ? 'is' : 'are'} missing`
    );

    // Check cooldown
    try {
      const { isInCooldown } = await import('@/utils/cooldownManager');
      const inCooldown = await isInCooldown();
      if (inCooldown) {
        return NextResponse.json(
          {
            success: false,
            error: 'System is in cooldown. Please wait before starting new jobs.',
          },
          { status: 503 }
        );
      }
    } catch (cooldownError) {
      console.warn('[JOBS_ENRICH] Failed to check cooldown:', cooldownError);
    }

    // Check scheduling
    let scheduleCheck: { shouldExecute: boolean; delayMs: number; reason?: string } = {
      shouldExecute: true,
      delayMs: 0,
    };
    try {
      const { scheduleJobIfAllowed } = await import('@/utils/schedulingManager');
      scheduleCheck = await scheduleJobIfAllowed('enrichment');
      if (!scheduleCheck.shouldExecute) {
        return NextResponse.json(
          {
            success: false,
            error: scheduleCheck.reason || 'Job scheduling blocked',
            delayMs: scheduleCheck.delayMs,
          },
          { status: 503 }
        );
      }
    } catch (scheduleError) {
      console.warn('[JOBS_ENRICH] Failed to check schedule:', scheduleError);
    }

    const useSync = sync === true && parsedData.rows.length <= SYNC_MAX;
    const jobId = generateJobId('enrichment');

    if (useSync) {
      try {
        saveJobStatus({
          jobId,
          type: 'enrichment',
          status: 'running',
          progress: { current: 0, total: parsedData.rows.length, percentage: 0 },
          startedAt: new Date().toISOString(),
          metadata: {
            ...(metadata || {}),
            ...(requestedStations ? { requestedStations, enabledStations: effectiveStations, stationConfigIssues: stationIssues } : {}),
            sync: true,
          },
        });
        const enriched = await enrichData(
          parsedData,
          (current, total) => updateJobProgress(jobId, { current, total }),
          undefined,
          effectiveStations ? new Set(effectiveStations) : undefined
        );
        const stopLossMetadata = enriched.stopLoss?.triggered
          ? { stopLoss: enriched.stopLoss }
          : {};
        const leadSummaries = enriched.rows.map((row: { _enriched?: unknown }) =>
          extractLeadSummary(row as Parameters<typeof extractLeadSummary>[0], row._enriched as Parameters<typeof extractLeadSummary>[1])
        );
        await saveJobResults(jobId, 'enrichment', leadSummaries);
        try {
          const { notifyScrapeCompleted } = await import('@/utils/notifications');
          await notifyScrapeCompleted(jobId, 'linkedin', enriched.rows.length);
        } catch {
          // ignore
        }
        await completeJob(jobId, {
          enrichedCount: enriched.rows.length,
          totalLeads: parsedData.rows.length,
          resultsStored: true,
          resultCount: enriched.rows.length,
          ...(effectiveStations ? { enabledStations: effectiveStations } : {}),
          ...stopLossMetadata,
        });
        return NextResponse.json({
          success: true,
          jobId,
          message: 'Enrichment completed',
          sync: true,
          enrichedCount: enriched.rows.length,
          ...(enriched.stopLoss?.triggered ? { stopLoss: enriched.stopLoss } : {}),
        });
      } catch (syncError) {
        const errMsg = syncError instanceof Error ? syncError.message : 'Enrichment failed';
        await failJob(jobId, errMsg);
        console.error('[JOBS_ENRICH] Sync enrichment failed:', syncError);
        return NextResponse.json(
          { success: false, error: errMsg, jobId },
          { status: 500 }
        );
      }
    }

    // Async path: create pending job and send to Inngest
    // Create initial job status
    const initialStatus = {
      jobId,
      type: 'enrichment' as const,
      status: 'pending' as const,
      progress: {
        current: 0,
        total: parsedData.rows.length,
        percentage: 0,
      },
      startedAt: new Date().toISOString(),
      metadata: {
        ...(metadata || {}),
        ...(requestedStations ? {
          requestedStations,
          enabledStations: effectiveStations,
          stationConfigIssues: stationIssues,
        } : {}),
      },
    };
    saveJobStatus(initialStatus);

    // Send notification
    try {
      const { notifyScrapeStarted } = await import('@/utils/notifications');
      await notifyScrapeStarted(jobId, 'linkedin');
    } catch (notifyError) {
      console.warn('[JOBS_ENRICH] Failed to send notification:', notifyError);
    }

    // Trigger Inngest event (with delay if scheduled)
    const eventData = {
      name: enrichmentEvents.enrichLeads,
      data: {
        jobId,
        parsedData,
        metadata: initialStatus.metadata,
        enabledStations: effectiveStations,
      },
    };

    if (scheduleCheck.delayMs > 0) {
      // Schedule for later
      await inngest.send({
        ...eventData,
        ts: Date.now() + scheduleCheck.delayMs,
      });
    } else {
      // Execute immediately
      await inngest.send(eventData);
    }

    return NextResponse.json({
      success: true,
      jobId,
      message: 'Enrichment job started',
      ...(effectiveStations ? { enabledStations: effectiveStations } : {}),
    });
  } catch (error) {
    console.error('Error starting enrichment job:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
