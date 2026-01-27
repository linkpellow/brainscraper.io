/**
 * API route: List all auth worker sessions from server storage
 * GET /api/auth-worker/sessions
 * 
 * Returns all sessions stored on the server
 */

import { NextRequest, NextResponse } from 'next/server';
import { listSessionsFromServer, getSessionFromServer, deleteSessionFromServer } from '../../../auth-workers/utils/authWorkerServerStorage';
import type { PersistedAuthWorkerState } from '../../../auth-workers/utils/authWorkerPersistence';

export async function GET() {
  try {
    // Force rebuild - add timestamp
    console.log('[AuthWorkerSessions] API called at:', new Date().toISOString());
    const sessionList = listSessionsFromServer();
    console.log('[AuthWorkerSessions] Found session metadata:', sessionList.length, sessionList.map(s => s.sessionId));
    
    // Load full session objects
    const sessions: PersistedAuthWorkerState[] = [];
    for (const sessionMeta of sessionList) {
      const fullSession = getSessionFromServer(sessionMeta.sessionId);
      if (fullSession) {
        console.log('[AuthWorkerSessions] Loaded session:', {
          sessionId: fullSession.sessionId,
          targetDomain: fullSession.targetDomain,
          stabilized: fullSession.stabilized,
          version: fullSession.version,
        });
        sessions.push(fullSession);
      } else {
        console.warn('[AuthWorkerSessions] Failed to load full session:', sessionMeta.sessionId);
      }
    }
    
    console.log('[AuthWorkerSessions] Returning sessions:', sessions.length);
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

/**
 * API route: Delete auth worker session from server storage
 * DELETE /api/auth-worker/sessions
 * 
 * Deletes a session from the server
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    const deleted = await deleteSessionFromServer(sessionId);
    
    if (deleted) {
      return NextResponse.json({
        success: true,
        message: 'Session deleted successfully',
      });
    } else {
      return NextResponse.json(
        { error: 'Failed to delete session' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[AuthWorker] Delete session error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to delete session',
      },
      { status: 500 }
    );
  }
}
