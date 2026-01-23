/**
 * Server-side Auth Worker Storage
 * 
 * DEPRECATED: This file has been moved to app/auth-workers/utils/authWorkerServerStorage.ts
 * Re-exporting from new location for backward compatibility
 */

export * from '../../../../auth-workers/utils/authWorkerServerStorage';

const SESSIONS_DIR = 'auth-workers';
const STORAGE_VERSION = '1.0.0';

/**
 * Get file path for a session
 */
function getSessionFilePath(sessionId: string): string {
  return getDataFilePath(`${SESSIONS_DIR}/${sessionId}.json`);
}

/**
 * Save session to server-side storage
 */
export async function saveSessionToServer(session: PersistedAuthWorkerState): Promise<void> {
  try {
    ensureDataDirectory();
    const filePath = getSessionFilePath(session.sessionId);
    
    const data = {
      ...session,
      version: STORAGE_VERSION,
      savedAt: Date.now(),
    };
    
    safeWriteFile(filePath, JSON.stringify(data, null, 2));
    console.log('[AuthWorkerServerStorage] ✅ Session saved to server:', session.sessionId);
  } catch (error) {
    console.error('[AuthWorkerServerStorage] ❌ Failed to save session:', error);
    throw error;
  }
}

/**
 * Get session from server-side storage
 */
export function getSessionFromServer(sessionId: string): PersistedAuthWorkerState | null {
  try {
    const filePath = getSessionFilePath(sessionId);
    const content = safeReadFile(filePath);
    
    if (!content) {
      return null;
    }
    
    const session: PersistedAuthWorkerState = JSON.parse(content);
    
    // Validate version
    if (session.version !== STORAGE_VERSION || !session.stabilized) {
      return null;
    }
    
    return session;
  } catch (error) {
    console.error('[AuthWorkerServerStorage] ❌ Failed to read session:', error);
    return null;
  }
}

/**
 * List all sessions from server-side storage
 */
export function listSessionsFromServer(): Array<{
  sessionId: string;
  targetDomain: string;
  stabilizedAt: number;
  authenticatedRequestCount: number;
}> {
  try {
    const sessionsDir = getDataFilePath(SESSIONS_DIR);
    const fs = require('fs');
    const path = require('path');
    
    if (!fs.existsSync(sessionsDir)) {
      return [];
    }
    
    const files = fs.readdirSync(sessionsDir);
    const sessions: Array<{
      sessionId: string;
      targetDomain: string;
      stabilizedAt: number;
      authenticatedRequestCount: number;
    }> = [];
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      try {
        const filePath = path.join(sessionsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const session: PersistedAuthWorkerState = JSON.parse(content);
        
        if (session.version === STORAGE_VERSION && session.stabilized) {
          sessions.push({
            sessionId: session.sessionId,
            targetDomain: session.targetDomain,
            stabilizedAt: session.stabilizedAt,
            authenticatedRequestCount: session.step2.verificationStatus.authenticatedRequestCount,
          });
        }
      } catch (err) {
        // Skip invalid files
        continue;
      }
    }
    
    return sessions;
  } catch (error) {
    console.error('[AuthWorkerServerStorage] ❌ Failed to list sessions:', error);
    return [];
  }
}

/**
 * Update session tokens on server
 */
export async function updateSessionTokensOnServer(
  sessionId: string,
  newAccessToken?: string,
  newRefreshToken?: string
): Promise<boolean> {
  try {
    const session = getSessionFromServer(sessionId);
    if (!session) {
      return false;
    }
    
    if (newAccessToken) {
      session.step2.extractedVars.access_token = newAccessToken;
    }
    if (newRefreshToken) {
      session.step2.extractedVars.refresh_token = newRefreshToken;
    }
    
    if (newAccessToken) {
      session.step2.verificationStatus.verifiedAt = Date.now();
    }
    
    await saveSessionToServer(session);
    return true;
  } catch (error) {
    console.error('[AuthWorkerServerStorage] ❌ Failed to update tokens:', error);
    return false;
  }
}

/**
 * Update session with enriched credentials (ROOT CAUSE FIX)
 * This allows existing sessions to be updated with missing OAuth credentials from HAR
 */
export async function enrichSessionOnServer(
  sessionId: string,
  enrichedExtractedVars: Record<string, string>
): Promise<boolean> {
  try {
    const session = getSessionFromServer(sessionId);
    if (!session) {
      return false;
    }
    
    // Merge new credentials into existing extractedVars
    const extractedVars = session.step2.extractedVars as Record<string, string>;
    Object.assign(extractedVars, enrichedExtractedVars);
    
    // Update the session
    session.step2.extractedVars = extractedVars;
    
    await saveSessionToServer(session);
    console.log('[AuthWorkerServerStorage] ✅ Session enriched:', sessionId, Object.keys(enrichedExtractedVars));
    return true;
  } catch (error) {
    console.error('[AuthWorkerServerStorage] ❌ Failed to enrich session:', error);
    return false;
  }
}
