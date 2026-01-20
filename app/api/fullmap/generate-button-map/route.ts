import { NextRequest, NextResponse } from 'next/server';
import { generateButtonMap, type DOMSnapshot } from '@/src/tools/api-signal-explorer/form-correlator';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * POST /api/fullmap/generate-button-map
 * 
 * Generates a complete button map from DOM snapshots and network events
 * 
 * @param sessionId - Flipbook session ID to load snapshots from
 * @param networkEvents - Array of network events to correlate
 * @returns ButtonMapResult with correlation data
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, networkEvents } = body;

    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: 'Missing sessionId' },
        { status: 400 }
      );
    }

    if (!networkEvents || !Array.isArray(networkEvents)) {
      return NextResponse.json(
        { ok: false, error: 'Missing or invalid networkEvents array' },
        { status: 400 }
      );
    }

    // Load DOM snapshots from session
    const snapshotsDir = path.join(process.cwd(), 'data', 'dom-snapshots', sessionId);
    
    let snapshots: DOMSnapshot[] = [];
    try {
      const indexPath = path.join(snapshotsDir, '_index.json');
      const indexData = await fs.readFile(indexPath, 'utf-8');
      const index = JSON.parse(indexData);

      // Load each snapshot
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

    if (snapshots.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No snapshots found for this session' },
        { status: 404 }
      );
    }

    // Generate button map
    console.log(`[FullMap API] Generating button map from ${snapshots.length} snapshots and ${networkEvents.length} events`);
    const buttonMap = generateButtonMap(snapshots, networkEvents);

    // Save button map to disk for persistence
    const buttonMapPath = path.join(snapshotsDir, '_button-map.json');
    await fs.writeFile(buttonMapPath, JSON.stringify(buttonMap, null, 2), 'utf-8');

    console.log(`[FullMap API] Button map generated: ${buttonMap.mappedButtons}/${buttonMap.totalButtons} elements mapped (${Math.round(buttonMap.coverage * 100)}%)`);

    return NextResponse.json({
      ok: true,
      buttonMap
    });

  } catch (err) {
    console.error('[FullMap API] Error generating button map:', err);
    return NextResponse.json(
      { 
        ok: false, 
        error: err instanceof Error ? err.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/fullmap/generate-button-map?sessionId=xxx
 * 
 * Retrieves a previously generated button map
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

    const snapshotsDir = path.join(process.cwd(), 'data', 'dom-snapshots', sessionId);
    const buttonMapPath = path.join(snapshotsDir, '_button-map.json');

    try {
      const buttonMapData = await fs.readFile(buttonMapPath, 'utf-8');
      const buttonMap = JSON.parse(buttonMapData);

      return NextResponse.json({
        ok: true,
        buttonMap
      });
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: 'Button map not found for this session' },
        { status: 404 }
      );
    }

  } catch (err) {
    console.error('[FullMap API] Error retrieving button map:', err);
    return NextResponse.json(
      { 
        ok: false, 
        error: err instanceof Error ? err.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
