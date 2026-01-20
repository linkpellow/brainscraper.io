import { NextRequest, NextResponse } from 'next/server';
import { validateSequentially, validatePersistence, type LockedStep, type SequentialTestResult } from '@/src/tools/api-signal-explorer/sequential-validator';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * POST /api/fullmap/validate-workflow
 * 
 * Validates a workflow by running it multiple times in sequence
 * 
 * @param steps - Array of locked steps to validate
 * @param mode - 'sequential' (2x back-to-back) or 'persistence' (with delays)
 * @param numAttempts - Number of times to run workflow (default: 2)
 * @param delayMs - Delay between attempts for persistence mode (default: 5000ms)
 * @returns SequentialTestResult with validation data
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      steps, 
      mode = 'sequential', 
      numAttempts = 2, 
      delayMs = 5000,
      sessionId
    } = body;

    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Missing or invalid steps array' },
        { status: 400 }
      );
    }

    if (!['sequential', 'persistence'].includes(mode)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid mode. Must be "sequential" or "persistence"' },
        { status: 400 }
      );
    }

    console.log(`[FullMap API] Validating ${steps.length} steps (${mode} mode, ${numAttempts}x attempts)`);

    // Run validation
    let result: SequentialTestResult;
    
    if (mode === 'sequential') {
      result = await validateSequentially(steps, numAttempts);
    } else {
      result = await validatePersistence(steps, numAttempts, delayMs);
    }

    // Save validation result to disk if sessionId provided
    if (sessionId) {
      try {
        const validationDir = path.join(process.cwd(), 'data', 'validations');
        await fs.mkdir(validationDir, { recursive: true });

        const validationPath = path.join(
          validationDir,
          `${sessionId}-${Date.now()}.json`
        );

        await fs.writeFile(
          validationPath,
          JSON.stringify({
            sessionId,
            mode,
            numAttempts,
            delayMs,
            timestamp: Date.now(),
            result,
            steps: steps.map(s => ({
              stepNumber: s.stepNumber,
              endpoint: s.endpoint,
              method: s.method
            }))
          }, null, 2),
          'utf-8'
        );

        console.log(`[FullMap API] Validation result saved: ${validationPath}`);
      } catch (err) {
        console.warn('[FullMap API] Failed to save validation result:', err);
        // Continue even if save fails
      }
    }

    console.log(
      `[FullMap API] Validation complete: ${result.allPassed ? 'PASSED' : 'FAILED'} ` +
      `(${result.successfulAttempts}/${result.totalAttempts}, ${Math.round(result.reliability * 100)}%)`
    );

    return NextResponse.json({
      ok: true,
      result
    });

  } catch (err) {
    console.error('[FullMap API] Validation error:', err);
    return NextResponse.json(
      { 
        ok: false, 
        error: err instanceof Error ? err.message : 'Validation failed' 
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/fullmap/validate-workflow?sessionId=xxx
 * 
 * Retrieves validation history for a session
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: 'Missing sessionId parameter' },
        { status: 400 }
      );
    }

    const validationDir = path.join(process.cwd(), 'data', 'validations');

    try {
      const files = await fs.readdir(validationDir);
      const sessionFiles = files.filter(f => f.startsWith(sessionId));

      const validations = await Promise.all(
        sessionFiles.map(async (file) => {
          const filePath = path.join(validationDir, file);
          const data = await fs.readFile(filePath, 'utf-8');
          return JSON.parse(data);
        })
      );

      // Sort by timestamp (newest first)
      validations.sort((a, b) => b.timestamp - a.timestamp);

      return NextResponse.json({
        ok: true,
        validations,
        count: validations.length
      });

    } catch (err) {
      // Directory doesn't exist or no validations found
      return NextResponse.json({
        ok: true,
        validations: [],
        count: 0
      });
    }

  } catch (err) {
    console.error('[FullMap API] Error retrieving validations:', err);
    return NextResponse.json(
      { 
        ok: false, 
        error: err instanceof Error ? err.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
