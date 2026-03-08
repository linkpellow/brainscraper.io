/**
 * API route to start Facebook automated lead search job (Inngest).
 */

import { NextRequest, NextResponse } from 'next/server';
import { inngest, facebookEvents } from '@/utils/inngest';
import { generateJobId, saveJobStatus } from '@/utils/jobStatus';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      queries,
      maxPostsPerQuery = 20,
      maxCommentsPerPost = 50,
      includeAds = false,
      country = 'US',
    } = body as {
      queries: string[];
      maxPostsPerQuery?: number;
      maxCommentsPerPost?: number;
      includeAds?: boolean;
      country?: string;
    };

    if (!Array.isArray(queries) || queries.length === 0) {
      return NextResponse.json(
        { success: false, error: 'queries must be a non-empty array of strings' },
        { status: 400 }
      );
    }

    const trimmedQueries = queries.map((q) => String(q).trim()).filter(Boolean);
    if (trimmedQueries.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one non-empty query is required' },
        { status: 400 }
      );
    }

    const jobId = generateJobId('facebook_automated');
    saveJobStatus({
      jobId,
      type: 'facebook_automated',
      status: 'pending',
      progress: { current: 0, total: trimmedQueries.length, percentage: 0 },
      startedAt: new Date().toISOString(),
      metadata: {
        queries: trimmedQueries,
        maxPostsPerQuery: Math.max(1, Math.min(maxPostsPerQuery || 20, 100)),
        maxCommentsPerPost: Math.max(1, Math.min(maxCommentsPerPost || 50, 200)),
        includeAds: !!includeAds,
        country: country || 'US',
      },
    });

    await inngest.send({
      name: facebookEvents.automatedLeadSearch,
      data: {
        jobId,
        queries: trimmedQueries,
        maxPostsPerQuery: Math.max(1, Math.min(maxPostsPerQuery || 20, 100)),
        maxCommentsPerPost: Math.max(1, Math.min(maxCommentsPerPost || 50, 200)),
        includeAds: !!includeAds,
        country: country || 'US',
      },
    });

    return NextResponse.json({
      success: true,
      jobId,
      message: 'Facebook automated lead search job started',
    });
  } catch (error) {
    console.error('[JOBS_FACEBOOK_AUTOMATED]', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
