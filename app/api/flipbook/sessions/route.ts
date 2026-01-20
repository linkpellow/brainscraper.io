import { NextRequest, NextResponse } from 'next/server';
import { readdir } from 'fs/promises';
import path from 'path';

const SNAPSHOTS_DIR = path.join(process.cwd(), 'data', 'dom-snapshots');

/**
 * GET /api/flipbook/sessions
 * 
 * Lists all available snapshot sessions
 */
export async function GET(req: NextRequest) {
  try {
    const sessions = await readdir(SNAPSHOTS_DIR).catch(() => []);

    const sessionData = [];
    for (const session of sessions) {
      const sessionDir = path.join(SNAPSHOTS_DIR, session);
      const indexPath = path.join(sessionDir, '_index.json');
      
      try {
        const indexData = await readdir(sessionDir);
        const snapshotCount = indexData.filter(f => f.endsWith('.json') && f !== '_index.json').length;
        
        sessionData.push({
          sessionId: session,
          snapshotCount,
          path: sessionDir,
        });
      } catch {
        // Skip invalid sessions
      }
    }

    return NextResponse.json({
      ok: true,
      sessions: sessionData,
    });
  } catch (err) {
    console.error('[FlipBook API] Sessions error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
