/**
 * API Route to Fail Stuck Pending Jobs
 * 
 * Finds jobs that have been pending for too long and marks them as failed
 * Useful for cleaning up jobs that were created before Inngest was properly configured
 */

import { NextRequest, NextResponse } from 'next/server';
import { failStuckPendingJobs, cancelJob, failJob } from '@/utils/jobStatus';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { 
      timeoutMinutes = 5,
      jobId,
      action = 'fail-stuck' // 'fail-stuck' | 'fail-specific' | 'cancel-specific'
    } = body as { 
      timeoutMinutes?: number;
      jobId?: string;
      action?: 'fail-stuck' | 'fail-specific' | 'cancel-specific';
    };

    if (action === 'fail-stuck') {
      // Fail all stuck pending jobs
      const validatedTimeout = Math.max(1, Math.min(timeoutMinutes || 5, 60)); // Between 1 and 60 minutes
      const result = await failStuckPendingJobs(validatedTimeout);

      return NextResponse.json({
        success: true,
        failed: result.failed,
        errors: result.errors,
        timeoutMinutes: validatedTimeout,
        message: `Failed ${result.failed} stuck pending job(s)`,
      });
    } else if (action === 'fail-specific' && jobId) {
      // Fail a specific job
      await failJob(jobId, 'Job manually marked as failed. This job was likely stuck in pending state.');
      
      return NextResponse.json({
        success: true,
        jobId,
        message: 'Job marked as failed',
      });
    } else if (action === 'cancel-specific' && jobId) {
      // Cancel a specific job
      await cancelJob(jobId, 'Job manually cancelled. This job was likely stuck in pending state.');
      
      return NextResponse.json({
        success: true,
        jobId,
        message: 'Job cancelled',
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid action or missing jobId',
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error failing stuck jobs:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

