/**
 * API Route to Check Job Status
 * 
 * Returns status of background jobs
 */

import { NextRequest, NextResponse } from 'next/server';
import { getJobStatus, getActiveJobs, getAllJobs } from '@/utils/jobStatus';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');
    const activeOnly = searchParams.get('activeOnly') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // Get specific job
    if (jobId) {
      const job = getJobStatus(jobId);
      if (!job) {
        return NextResponse.json(
          { success: false, error: 'Job not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        job,
      });
    }

    // Get active jobs only
    if (activeOnly) {
      const activeJobs = getActiveJobs();
      return NextResponse.json({
        success: true,
        jobs: activeJobs,
        count: activeJobs.length,
      });
    }

    // Get all jobs
    const allJobs = getAllJobs(limit);
    return NextResponse.json({
      success: true,
      jobs: allJobs,
      count: allJobs.length,
    });
  } catch (error) {
    console.error('Error getting job status:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
