/**
 * Sync client-side sessions to server storage
 * 
 * This allows API routes to access sessions stored in localStorage
 */

import { listAllSessions, getSessionById } from './authWorkerPersistence';

/**
 * Sync all sessions from localStorage to server storage
 * Call this when sessions are updated or on page load
 */
export async function syncAllSessionsToServer(): Promise<void> {
  try {
    // Only run on client
    if (typeof window === 'undefined') {
      return;
    }

    const sessions = listAllSessions();
    
    for (const session of sessions) {
      const fullSession = getSessionById(session.sessionId);
      if (fullSession) {
        try {
          const response = await fetch('/api/auth-worker/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(fullSession),
          });
          
          if (!response.ok) {
            console.warn(`[SyncSessions] Failed to sync session ${session.sessionId}`);
          }
        } catch (err) {
          console.error(`[SyncSessions] Error syncing session ${session.sessionId}:`, err);
        }
      }
    }
  } catch (error) {
    console.error('[SyncSessions] Failed to sync sessions:', error);
  }
}
