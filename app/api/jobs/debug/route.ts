/**
 * Comprehensive Debug Endpoint for Background Jobs
 * 
 * Checks the entire flow from event sending to function execution
 */

import { NextRequest, NextResponse } from 'next/server';
import { inngest, enrichmentEvents } from '@/utils/inngest';
import { getActiveJobs, getAllJobs } from '@/utils/jobStatus';

export async function GET(request: NextRequest) {
  try {
    const diagnostics: Record<string, any> = {
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        hasEventKey: !!process.env.INNGEST_EVENT_KEY,
        hasSigningKey: !!process.env.INNGEST_SIGNING_KEY,
        eventKeyPrefix: process.env.INNGEST_EVENT_KEY ? `${process.env.INNGEST_EVENT_KEY.substring(0, 15)}...` : 'NOT SET',
        baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'not set',
      },
      inngestClient: {
        id: inngest.id,
        name: 'BrainScraper.io', // Hardcoded to match utils/inngest.ts
      },
      jobs: {
        active: getActiveJobs().map(job => ({
          jobId: job.jobId,
          type: job.type,
          status: job.status,
          startedAt: job.startedAt,
          ageMinutes: Math.round((Date.now() - new Date(job.startedAt).getTime()) / 60000),
          progress: job.progress,
          error: job.error,
        })),
        recent: getAllJobs(10).map(job => ({
          jobId: job.jobId,
          type: job.type,
          status: job.status,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
        })),
      },
      recommendations: [] as string[],
    };

    // Check for stuck pending jobs
    const stuckJobs = diagnostics.jobs.active.filter((job: { status: string; ageMinutes: number }) => 
      job.status === 'pending' && job.ageMinutes > 5
    );
    
    if (stuckJobs.length > 0) {
      diagnostics.stuckJobs = stuckJobs;
      diagnostics.recommendations.push(
        `Found ${stuckJobs.length} job(s) stuck in pending for more than 5 minutes`
      );
      diagnostics.recommendations.push(
        'Call POST /api/jobs/fail-stuck to mark them as failed'
      );
    }

    // Check Inngest configuration
    if (!diagnostics.environment.hasEventKey) {
      diagnostics.recommendations.push(
        'CRITICAL: INNGEST_EVENT_KEY is not set in Railway environment variables'
      );
    }

    if (!diagnostics.environment.hasSigningKey) {
      diagnostics.recommendations.push(
        'CRITICAL: INNGEST_SIGNING_KEY is not set in Railway environment variables'
      );
    }

    // Test Inngest endpoint accessibility
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
        process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` :
        'https://brainscraper.io';
      
      const inngestUrl = `${baseUrl}/api/inngest`;
      diagnostics.inngestEndpoint = {
        url: inngestUrl,
        accessible: 'unknown - check manually',
        note: 'Visit this URL in browser to verify functions are synced',
      };
    } catch (error) {
      diagnostics.inngestEndpoint = {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    return NextResponse.json({
      success: true,
      diagnostics,
    });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action } = body as { action?: string };

    if (action === 'test-send') {
      // Test sending an event
      const testEvent = {
        name: enrichmentEvents.enrichLeads,
        data: {
          jobId: `test-${Date.now()}`,
          parsedData: {
            headers: ['Name'],
            rows: [{ Name: 'Test Lead' }],
            rowCount: 1,
            columnCount: 1,
          },
          metadata: { test: true },
        },
      };

      console.log('[DEBUG] Testing Inngest send...');
      const result = await inngest.send(testEvent);
      console.log('[DEBUG] Send result:', result);

      return NextResponse.json({
        success: true,
        message: 'Test event sent',
        result,
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action. Use action: "test-send"',
    }, { status: 400 });
  } catch (error) {
    console.error('Error in debug POST:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : String(error),
      },
      { status: 500 }
    );
  }
}

