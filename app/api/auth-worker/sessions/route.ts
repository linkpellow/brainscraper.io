/**
 * API route: List all auth worker sessions from server storage
 * GET /api/auth-worker/sessions
 * 
 * Returns all sessions stored on the server
 */

import { NextResponse } from 'next/server';
import { listSessionsFromServer, getSessionFromServer } from '../../../auth-workers/utils/authWorkerServerStorage';
import type { PersistedAuthWorkerState } from '../../../auth-workers/utils/authWorkerPersistence';

export async function GET() {
  try {
    const sessionList = listSessionsFromServer();
    
    // Load full session objects
    const sessions: PersistedAuthWorkerState[] = [];
    for (const sessionMeta of sessionList) {
      const fullSession = getSessionFromServer(sessionMeta.sessionId);
      if (fullSession) {
        sessions.push(fullSession);
      }
    }
    
    return NextResponse.json({
      success: true,
      sessions,
      count: sessions.length,
    });
  } catch (error: any) {
    console.error('[AuthWorker] List sessions error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to list sessions',
        sessions: [],
        count: 0,
      },
      { status: 500 }
    );
  }
}
