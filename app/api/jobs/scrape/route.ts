/**
 * API Route to Trigger LinkedIn Scraping Job
 * 
 * Creates a background job for scraping LinkedIn leads
 */

import { NextRequest, NextResponse } from 'next/server';
import { inngest, scrapingEvents } from '@/utils/inngest';
import { generateJobId, saveJobStatus } from '@/utils/jobStatus';

export async function POST(request: NextRequest) {
  try {
    // Check scrape limits before processing
    try {
      const { checkScrapeLimit } = await import('@/utils/scrapeUsageTracker');
      const { loadSettings } = await import('@/utils/settingsConfig');
      const settings = loadSettings();
      const limitCheck = await checkScrapeLimit(
        'linkedin',
        settings.scrapeLimits.linkedin.daily,
        settings.scrapeLimits.linkedin.monthly
      );

      if (!limitCheck.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: 'Scrape limit reached',
            message: `${limitCheck.limitType === 'daily' ? 'Daily' : 'Monthly'} limit reached. Current: ${limitCheck.currentCount}, Limit: ${limitCheck.limit === Infinity ? 'Unlimited' : limitCheck.limit}`,
            limitType: limitCheck.limitType,
          },
          { status: 429 }
        );
      }
    } catch (limitError) {
      // If limit check fails, log but continue (backward compatible)
      console.warn('[JOBS_SCRAPE] Failed to check scrape limits:', limitError);
    }

    const body = await request.json();
    const { searchParams, maxPages = 10, maxResults = 250, metadata } = body as {
      searchParams: Record<string, unknown>;
      maxPages?: number;
      maxResults?: number;
      metadata?: Record<string, unknown>;
    };

    // Input validation
    if (!searchParams || typeof searchParams !== 'object') {
      return NextResponse.json(
        { success: false, error: 'searchParams is required and must be an object' },
        { status: 400 }
      );
    }

    // Validate maxPages
    const validatedMaxPages = Math.max(1, Math.min(maxPages || 10, 100)); // Between 1 and 100
    if (maxPages !== validatedMaxPages) {
      console.warn(`maxPages adjusted from ${maxPages} to ${validatedMaxPages}`);
    }

    // Validate maxResults
    const validatedMaxResults = Math.max(1, Math.min(maxResults || 250, 10000)); // Between 1 and 10,000
    if (maxResults !== validatedMaxResults) {
      console.warn(`maxResults adjusted from ${maxResults} to ${validatedMaxResults}`);
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
      console.warn('[JOBS_SCRAPE] Failed to check cooldown:', cooldownError);
    }

    // Check scheduling
    let scheduleCheck: { shouldExecute: boolean; delayMs: number; reason?: string } = {
      shouldExecute: true,
      delayMs: 0,
    };
    try {
      const { scheduleJobIfAllowed } = await import('@/utils/schedulingManager');
      scheduleCheck = await scheduleJobIfAllowed('scraping');
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
      console.warn('[JOBS_SCRAPE] Failed to check schedule:', scheduleError);
    }

    // Generate job ID
    const jobId = generateJobId('scraping');

    // Create initial job status
    const initialStatus = {
      jobId,
      type: 'scraping' as const,
      status: 'pending' as const,
      progress: {
        current: 0,
        total: validatedMaxPages,
        percentage: 0,
      },
      startedAt: new Date().toISOString(),
      metadata: {
        ...metadata,
        searchParams,
        maxPages: validatedMaxPages,
        maxResults: validatedMaxResults,
      },
    };
    saveJobStatus(initialStatus);

    // Send notification
    try {
      const { notifyScrapeStarted } = await import('@/utils/notifications');
      await notifyScrapeStarted(jobId, 'linkedin');
    } catch (notifyError) {
      console.warn('[JOBS_SCRAPE] Failed to send notification:', notifyError);
    }

    // Trigger Inngest event (with delay if scheduled)
    const eventData = {
      name: scrapingEvents.scrapeLinkedIn,
      data: {
        jobId,
        searchParams,
        maxPages: validatedMaxPages,
        maxResults: validatedMaxResults,
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
      message: 'Scraping job started',
    });
  } catch (error) {
    console.error('Error starting scraping job:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
