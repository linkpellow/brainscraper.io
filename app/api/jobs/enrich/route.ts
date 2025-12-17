/**
 * API Route to Trigger Enrichment Job
 * 
 * Creates a background job for enriching leads
 */

import { NextRequest, NextResponse } from 'next/server';
import { inngest, enrichmentEvents } from '@/utils/inngest';
import { generateJobId, saveJobStatus } from '@/utils/jobStatus';
import type { ParsedData } from '@/utils/parseFile';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { parsedData, metadata } = body as {
      parsedData: ParsedData;
      metadata?: Record<string, unknown>;
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

    // Generate job ID
    const jobId = generateJobId('enrichment');

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
      metadata: metadata || {},
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
        metadata,
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
