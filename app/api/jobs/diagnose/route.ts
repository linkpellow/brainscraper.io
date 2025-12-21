/**
 * API Route to Diagnose Background Job Issues
 * 
 * Checks Inngest configuration and job status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getJobStatus, getAllJobs } from '@/utils/jobStatus';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');

    const diagnostics: Record<string, any> = {
      timestamp: new Date().toISOString(),
      inngest: {
        configured: !!(process.env.INNGEST_EVENT_KEY && process.env.INNGEST_SIGNING_KEY),
        hasEventKey: !!process.env.INNGEST_EVENT_KEY,
        hasSigningKey: !!process.env.INNGEST_SIGNING_KEY,
        eventKeyPrefix: process.env.INNGEST_EVENT_KEY ? process.env.INNGEST_EVENT_KEY.substring(0, 10) + '...' : 'not set',
        signingKeyPrefix: process.env.INNGEST_SIGNING_KEY ? process.env.INNGEST_SIGNING_KEY.substring(0, 15) + '...' : 'not set',
        baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'not set',
        environment: process.env.NODE_ENV || 'development',
      },
      recommendations: [] as string[],
    };

    // Check Inngest configuration
    if (!diagnostics.inngest.configured) {
      if (diagnostics.inngest.environment === 'production') {
        diagnostics.recommendations.push(
          'CRITICAL: Set INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY environment variables in production'
        );
      } else {
        diagnostics.recommendations.push(
          'For local development, run: npx inngest-cli@latest dev'
        );
        diagnostics.recommendations.push(
          'Or set INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY in .env.local'
        );
      }
    }

    // Check base URL
    if (!process.env.NEXT_PUBLIC_BASE_URL && diagnostics.inngest.environment === 'production') {
      diagnostics.recommendations.push(
        'CRITICAL: Set NEXT_PUBLIC_BASE_URL to your production domain'
      );
    }

    // Check specific job if provided
    if (jobId) {
      const job = getJobStatus(jobId);
      if (job) {
        diagnostics.job = {
          jobId: job.jobId,
          type: job.type,
          status: job.status,
          progress: job.progress,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          error: job.error,
        };

        // Analyze job issues
        if (job.status === 'running' && job.progress.current === 0 && job.progress.total > 0) {
          const runningTime = Date.now() - new Date(job.startedAt).getTime();
          if (runningTime > 60000) { // More than 1 minute with no progress
            diagnostics.job.issue = 'Job appears stuck - no progress after 1 minute';
            diagnostics.recommendations.push(
              'Job may be stuck. Check Inngest dashboard or server logs for errors'
            );
          }
        }

        if (job.status === 'failed' && job.error) {
          diagnostics.job.issue = `Job failed: ${job.error}`;
          if (job.error.includes('Inngest')) {
            diagnostics.recommendations.push('Check Inngest configuration and ensure Inngest dev server is running (local)');
          }
        }
      } else {
        diagnostics.job = { error: 'Job not found' };
      }
    }

    // Get recent jobs
    const recentJobs = getAllJobs(10);
    diagnostics.recentJobs = recentJobs.map(job => ({
      jobId: job.jobId,
      type: job.type,
      status: job.status,
      progress: job.progress,
      startedAt: job.startedAt,
      error: job.error,
    }));

    return NextResponse.json({
      success: true,
      diagnostics,
    });
  } catch (error) {
    console.error('Error diagnosing jobs:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
