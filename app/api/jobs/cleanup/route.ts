/**
 * API Route to Clean Up Old Jobs
 * 
 * Removes old completed/failed job files
 */

import { NextRequest, NextResponse } from 'next/server';
import { cleanupOldJobs } from '@/utils/jobStatus';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { daysToKeep = 30 } = body as { daysToKeep?: number };

    // Validate daysToKeep
    const validatedDays = Math.max(1, Math.min(daysToKeep || 30, 365)); // Between 1 and 365 days

    const result = cleanupOldJobs(validatedDays);

    return NextResponse.json({
      success: true,
      deleted: result.deleted,
      errors: result.errors,
      daysToKeep: validatedDays,
    });
  } catch (error) {
    console.error('Error cleaning up jobs:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
