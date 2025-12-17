/**
 * API Route to Execute Scrape Profile
 * 
 * Executes a scrape profile with its configured filters and settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { inngest, scrapingEvents } from '@/utils/inngest';
import { generateJobId, saveJobStatus } from '@/utils/jobStatus';
import { loadSettings } from '@/utils/settingsConfig';
import { scheduleJobIfAllowed } from '@/utils/schedulingManager';
import { isInCooldown } from '@/utils/cooldownManager';
import { notifyScrapeStarted } from '@/utils/notifications';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { profileId, metadata } = body as {
      profileId: string;
      metadata?: Record<string, unknown>;
    };

    // Load settings to get profile
    const settings = loadSettings();
    const profile = settings.scrapeProfiles.find((p: any) => p.id === profileId);

    if (!profile) {
      return NextResponse.json(
        { success: false, error: `Profile ${profileId} not found` },
        { status: 404 }
      );
    }

    // Check cooldown
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

    // Check scheduling
    const scheduleCheck = await scheduleJobIfAllowed('scraping');
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

    // Build search params from profile filters
    const searchParams: Record<string, unknown> = {
      platform: profile.platform,
      ...profile.filters,
    };

    // Generate job ID
    const jobId = generateJobId('scraping');

    // Create initial job status
    const initialStatus = {
      jobId,
      type: 'scraping' as const,
      status: 'pending' as const,
      progress: {
        current: 0,
        total: 10, // Default, will be updated
        percentage: 0,
      },
      startedAt: new Date().toISOString(),
      metadata: {
        ...metadata,
        profileId,
        profileName: profile.name,
        searchParams,
      },
    };
    saveJobStatus(initialStatus);

    // Send notification
    await notifyScrapeStarted(jobId, profile.platform);

    // Apply scheduling delay if needed
    if (scheduleCheck.delayMs > 0) {
      // Schedule for later using Inngest's delay
      await inngest.send({
        name: scrapingEvents.scrapeLinkedIn,
        data: {
          jobId,
          searchParams,
          maxPages: 10,
          maxResults: 250,
          metadata: {
            ...metadata,
            profileId,
            profileName: profile.name,
          },
        },
        ts: Date.now() + scheduleCheck.delayMs,
      });
    } else {
      // Execute immediately
      await inngest.send({
        name: scrapingEvents.scrapeLinkedIn,
        data: {
          jobId,
          searchParams,
          maxPages: 10,
          maxResults: 250,
          metadata: {
            ...metadata,
            profileId,
            profileName: profile.name,
          },
        },
      });
    }

    return NextResponse.json({
      success: true,
      jobId,
      message: scheduleCheck.delayMs > 0 
        ? `Job scheduled to start in ${Math.round(scheduleCheck.delayMs / 1000 / 60)} minutes`
        : 'Scraping job started',
      delayMs: scheduleCheck.delayMs,
    });
  } catch (error) {
    console.error('Error starting profile scrape job:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

