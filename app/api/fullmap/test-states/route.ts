import { NextRequest, NextResponse } from 'next/server';
import { buildStateVariantMap, generateAdaptiveWorkflow, validateWorkflowForState, type StateTestCase, type DOMSnapshot } from '@/src/tools/api-signal-explorer/state-variant-mapper';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * POST /api/fullmap/test-states
 * 
 * Tests multiple states/zipcodes to detect form variations
 * 
 * @param sessionId - Flipbook session ID containing snapshots
 * @param testCases - Array of states to test (state, zipcode pairs)
 * @returns State variant map with all detected variations
 * 
 * @example
 * POST /api/fullmap/test-states
 * {
 *   "sessionId": "session-123",
 *   "testCases": [
 *     { "state": "CO", "zipcode": "80202", "description": "Colorado - Denver" },
 *     { "state": "CA", "zipcode": "90210", "description": "California - Beverly Hills" },
 *     { "state": "TX", "zipcode": "75001", "description": "Texas - Dallas" }
 *   ]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, testCases } = body;

    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: 'Missing sessionId' },
        { status: 400 }
      );
    }

    if (!testCases || !Array.isArray(testCases) || testCases.length < 2) {
      return NextResponse.json(
        { ok: false, error: 'At least 2 test cases required for comparison' },
        { status: 400 }
      );
    }

    console.log(`[FullMap API] Testing ${testCases.length} states for variations...`);

    // Load DOM snapshots for each test case
    // In a real implementation, this would trigger the browser to:
    // 1. Navigate to the form
    // 2. Enter each zipcode
    // 3. Capture the resulting form structure
    
    // For now, we'll load existing snapshots from the session
    const snapshotsDir = path.join(process.cwd(), 'data', 'dom-snapshots', sessionId);
    
    let snapshots: DOMSnapshot[] = [];
    try {
      const indexPath = path.join(snapshotsDir, '_index.json');
      const indexData = await fs.readFile(indexPath, 'utf-8');
      const index = JSON.parse(indexData);

      // Load snapshots (would be filtered by test case in real implementation)
      for (const snapshotMeta of index.snapshots || []) {
        const snapshotPath = path.join(snapshotsDir, `${snapshotMeta.id}.json`);
        const snapshotData = await fs.readFile(snapshotPath, 'utf-8');
        const snapshot = JSON.parse(snapshotData);
        snapshots.push(snapshot);
      }
    } catch (err) {
      console.error('[FullMap API] Failed to load snapshots:', err);
      return NextResponse.json(
        { ok: false, error: 'Failed to load DOM snapshots' },
        { status: 500 }
      );
    }

    if (snapshots.length < testCases.length) {
      return NextResponse.json(
        { 
          ok: false, 
          error: `Not enough snapshots. Need ${testCases.length}, found ${snapshots.length}. Please capture snapshots for each test case.` 
        },
        { status: 400 }
      );
    }

    // Build state variant map
    const variantMap = buildStateVariantMap(
      snapshots.slice(0, testCases.length),
      testCases
    );

    // Generate adaptive workflow
    const adaptiveWorkflow = generateAdaptiveWorkflow(variantMap);

    // Validate workflow for each state
    const validationResults = testCases.map(tc => ({
      state: tc.state,
      ...validateWorkflowForState(adaptiveWorkflow, tc.state, variantMap)
    }));

    // Save variant map to disk
    const variantMapDir = path.join(process.cwd(), 'data', 'state-variants');
    await fs.mkdir(variantMapDir, { recursive: true });
    
    const variantMapPath = path.join(variantMapDir, `${sessionId}-${Date.now()}.json`);
    await fs.writeFile(
      variantMapPath,
      JSON.stringify({
        sessionId,
        testCases,
        variantMap,
        adaptiveWorkflow,
        validationResults,
        generatedAt: Date.now()
      }, null, 2),
      'utf-8'
    );

    console.log(`[FullMap API] State variant analysis complete:`);
    console.log(`  - States tested: ${variantMap.testedStates.join(', ')}`);
    console.log(`  - Total variations: ${variantMap.totalVariations}`);
    console.log(`  - Adaptation strategy: ${variantMap.adaptationStrategy}`);

    return NextResponse.json({
      ok: true,
      variantMap,
      adaptiveWorkflow,
      validationResults,
      summary: {
        testedStates: variantMap.testedStates,
        totalVariations: variantMap.totalVariations,
        criticalVariations: variantMap.variations.filter(v => v.impact === 'critical').length,
        adaptationStrategy: variantMap.adaptationStrategy,
        requiresStateParameter: adaptiveWorkflow.metadata.requiresStateParameter,
        averageCoverage: validationResults.reduce((sum, v) => sum + v.coverage, 0) / validationResults.length
      }
    });

  } catch (err) {
    console.error('[FullMap API] State variant testing error:', err);
    return NextResponse.json(
      { 
        ok: false, 
        error: err instanceof Error ? err.message : 'State variant testing failed' 
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/fullmap/test-states?sessionId=xxx
 * 
 * Retrieves previously generated state variant maps
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

    const variantMapDir = path.join(process.cwd(), 'data', 'state-variants');

    try {
      const files = await fs.readdir(variantMapDir);
      const sessionFiles = files.filter(f => f.startsWith(sessionId));

      const variantMaps = await Promise.all(
        sessionFiles.map(async (file) => {
          const filePath = path.join(variantMapDir, file);
          const data = await fs.readFile(filePath, 'utf-8');
          return JSON.parse(data);
        })
      );

      // Sort by timestamp (newest first)
      variantMaps.sort((a, b) => b.generatedAt - a.generatedAt);

      return NextResponse.json({
        ok: true,
        variantMaps,
        count: variantMaps.length
      });

    } catch (err) {
      // Directory doesn't exist or no variant maps found
      return NextResponse.json({
        ok: true,
        variantMaps: [],
        count: 0
      });
    }

  } catch (err) {
    console.error('[FullMap API] Error retrieving state variant maps:', err);
    return NextResponse.json(
      { 
        ok: false, 
        error: err instanceof Error ? err.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
