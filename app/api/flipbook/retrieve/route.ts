import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

const SNAPSHOTS_DIR = path.join(process.cwd(), 'data', 'dom-snapshots');

/**
 * GET /api/flipbook/retrieve?snapshotId=snap-xxx&sessionId=session-xxx
 * 
 * Retrieves a specific snapshot by ID
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const snapshotId = searchParams.get('snapshotId');
    const sessionId = searchParams.get('sessionId') || 'default';

    if (!snapshotId) {
      return NextResponse.json(
        { ok: false, error: 'snapshotId required' },
        { status: 400 }
      );
    }

    const sessionDir = path.join(SNAPSHOTS_DIR, sessionId);
    const filepath = path.join(sessionDir, `${snapshotId}.json`);

    const data = await readFile(filepath, 'utf-8');
    const snapshot = JSON.parse(data);

    return NextResponse.json({
      ok: true,
      snapshot,
    });
  } catch (err) {
    console.error('[FlipBook API] Retrieve error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
