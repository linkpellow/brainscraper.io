/**
 * Server-side Auth Worker Storage
 * 
 * Stores auth worker sessions in files (server-side only)
 * This allows API routes to access sessions
 * 
 * IMPORTANT: This file uses Node.js fs module and must only run on the server.
 * Client components should use dynamic imports to access these functions.
 * 
 * NOTE: We don't use 'server-only' package here because this file is imported
 * by client components via dynamic imports. Runtime checks prevent client usage.
 */

import { getDataFilePath, safeReadFile, safeWriteFile, ensureDataDirectory } from '@/utils/dataDirectory';
import type { PersistedAuthWorkerState } from './authWorkerPersistence';

// Server-only imports - loaded inline within functions to prevent static analysis
// Do not define helper functions here - Next.js will analyze them at build time

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
  // Server-side only - no-op on client
  if (typeof window !== 'undefined') {
    console.warn('[AuthWorkerServerStorage] saveSessionToServer called in client context');
    return;
  }

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
  // Server-side only - return null on client
  if (typeof window !== 'undefined') {
    return null;
  }

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
  // Server-side only - check if we're in a server environment
  if (typeof window !== 'undefined') {
    console.warn('[AuthWorkerServerStorage] listSessionsFromServer called in client context');
    return [];
  }

  try {
    // Load fs and path modules using Function constructor - completely hidden from static analysis
    // This pattern prevents Next.js/Turbopack from analyzing the require calls
    let fs: any = null;
    let path: any = null;
    
    if (typeof window === 'undefined') {
      // Build module names dynamically using character codes to prevent static analysis
      const modules = {
        fs: String.fromCharCode(102, 115), // 'fs'
        path: String.fromCharCode(112, 97, 116, 104), // 'path'
      };
      
      // Use Function constructor with webpack ignore - webpack cannot analyze this
      // @ts-ignore - webpack will not analyze Function constructor
      // eslint-disable-next-line no-new-func
      const req = new Function('m', 'return typeof require !== "undefined" ? require(m) : null');
      try {
        fs = req(modules.fs);
        path = req(modules.path);
      } catch (e) {
        // If require fails (shouldn't happen on server), return empty
        console.warn('[AuthWorkerServerStorage] Failed to load fs/path:', e);
        return [];
      }
    }
    
    if (!fs || !path) {
      return [];
    }
    
    // Use same path resolution as initialization in server.js
    const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    const sessionsDir = path.join(DATA_DIR, SESSIONS_DIR);
    
    console.log('[AuthWorkerServerStorage] Reading sessions from:', sessionsDir);
    console.log('[AuthWorkerServerStorage] DATA_DIR:', process.env.DATA_DIR);
    console.log('[AuthWorkerServerStorage] Directory exists:', fs.existsSync(sessionsDir));
    
    if (!fs.existsSync(sessionsDir)) {
      console.warn('[AuthWorkerServerStorage] Sessions directory does not exist:', sessionsDir);
      return [];
    }
    
    const files = fs.readdirSync(sessionsDir);
    console.log('[AuthWorkerServerStorage] Found files:', files.length, files);
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
  // Server-side only - return false on client
  if (typeof window !== 'undefined') {
    console.warn('[AuthWorkerServerStorage] updateSessionTokensOnServer called in client context');
    return false;
  }

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
  // Server-side only - return false on client
  if (typeof window !== 'undefined') {
    console.warn('[AuthWorkerServerStorage] enrichSessionOnServer called in client context');
    return false;
  }

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
