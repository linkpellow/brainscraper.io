/**
 * API route: Sync session from client to server storage
 * POST /api/auth-worker/sync
 * 
 * Receives session data from client and saves to server storage
 */

import { NextRequest, NextResponse } from 'next/server';
import { saveSessionToServer } from '../../../auth-workers/utils/authWorkerServerStorage';
import type { PersistedAuthWorkerState } from '../../../auth-workers/utils/authWorkerPersistence';

export async function POST(request: NextRequest) {
  try {
    const session: PersistedAuthWorkerState = await request.json();

    if (!session.sessionId || !session.stabilized) {
      return NextResponse.json(
        { error: 'Invalid session data' },
        { status: 400 }
      );
    }

    await saveSessionToServer(session);

    return NextResponse.json({
      success: true,
      sessionId: session.sessionId,
    });
  } catch (error: any) {
    console.error('[AuthWorker] Sync error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to sync session' },
      { status: 500 }
    );
  }
}
