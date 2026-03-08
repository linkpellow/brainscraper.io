/**
 * API Route to Retrieve Job Results
 * 
 * Returns the actual results from completed jobs
 */

import { NextRequest, NextResponse } from 'next/server';
import { getJobStatus } from '@/utils/jobStatus';
import { getJobResults } from '@/utils/jobResults';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: 'jobId is required' },
        { status: 400 }
      );
    }

    // Get job status
    const job = getJobStatus(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    // Only return results for completed jobs
    if (job.status !== 'completed') {
      return NextResponse.json(
        { 
          success: false, 
          error: `Job is ${job.status}. Results only available for completed jobs.`,
          jobStatus: job.status
        },
        { status: 400 }
      );
    }

    const snapshot = getJobResults(jobId);
    if (!snapshot) {
      return NextResponse.json(
        {
          success: false,
          error: 'Results are not available for this job.',
          jobId,
          jobType: job.type,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      jobId,
      jobType: snapshot.jobType,
      results: {
        leads: snapshot.leads,
        count: snapshot.count,
      },
      metadata: job.metadata,
    });
  } catch (error) {
    console.error('Error retrieving job results:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
