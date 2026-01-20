import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readdir } from 'fs/promises';
import path from 'path';

const SNAPSHOTS_DIR = path.join(process.cwd(), 'data', 'dom-snapshots');

export async function POST(req: NextRequest) {
  try {
    const { snapshot, sessionId } = await req.json();

    if (!snapshot || !snapshot.id) {
      return NextResponse.json(
        { ok: false, error: 'Invalid snapshot data' },
        { status: 400 }
      );
    }

    // Ensure snapshots directory exists
    await mkdir(SNAPSHOTS_DIR, { recursive: true });

    // Create session subdirectory
    const sessionDir = path.join(SNAPSHOTS_DIR, sessionId || 'default');
    await mkdir(sessionDir, { recursive: true });

    // Save snapshot as JSON
    const filename = `${snapshot.id}.json`;
    const filepath = path.join(sessionDir, filename);

    // Save full snapshot
    await writeFile(filepath, JSON.stringify(snapshot, null, 2), 'utf-8');

    // Save lightweight metadata index
    const metadata = {
      id: snapshot.id,
      url: snapshot.url,
      timestamp: snapshot.timestamp,
      title: snapshot.title,
      contentCount: snapshot.metadata?.contentItems?.length || 0,
      paginationCount: snapshot.metadata?.pagination?.length || 0,
      changes: snapshot.changes,
      filepath: filepath,
    };

    const indexPath = path.join(sessionDir, '_index.json');
    let index = [];
    try {
      const indexData = await readFile(indexPath, 'utf-8');
      index = JSON.parse(indexData);
    } catch {
      // Index doesn't exist yet
    }
    index.push(metadata);
    await writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');

    console.log('[FlipBook API] Snapshot stored:', {
      id: snapshot.id,
      url: snapshot.url,
      size: JSON.stringify(snapshot).length,
    });

    return NextResponse.json({
      ok: true,
      snapshotId: snapshot.id,
      filepath: filepath,
    });
  } catch (err) {
    console.error('[FlipBook API] Store error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId') || 'default';

    const sessionDir = path.join(SNAPSHOTS_DIR, sessionId);
    const indexPath = path.join(sessionDir, '_index.json');

    const indexData = await readFile(indexPath, 'utf-8').catch(() => '[]');
    const index = JSON.parse(indexData);

    return NextResponse.json({
      ok: true,
      sessionId,
      snapshots: index,
      count: index.length,
    });
  } catch (err) {
    console.error('[FlipBook API] List error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

import { readFile } from 'fs/promises';
