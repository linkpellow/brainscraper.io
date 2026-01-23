/**
 * Auth Worker Persistence Utilities
 * 
 * Handles persistence and restoration of verified Auth Worker state
 * Supports multiple sessions per domain
 */

/**
 * Locked step type (matches step2 structure)
 */
export type LockedStep = {
  id: string;
  endpoint: string;
  method: string;
  extractedVars?: Record<string, string>;
  verificationStatus?: {
    tokenCaptured: boolean;
    tokenInjectionAttempted: boolean;
    tokenInjectionSucceeded: boolean;
    authenticatedRequestsDetected: boolean;
    authenticatedRequestCount: number;
    verified: boolean;
    verifiedAt: number;
    authenticatedEndpoints: string[];
    issues: string[];
  };
  response?: any;
  code?: string;
  // Optional fields used in health monitoring
  stepNumber?: number;
  dependencies?: string[];
  lockedAt?: number;
  status?: string;
};

const STORAGE_KEY_PREFIX = 'authWorker_session_';
const STORAGE_INDEX_KEY = 'authWorker_sessions_index';
const STORAGE_VERSION = '1.0.0';

export type PersistedAuthWorkerState = {
  version: string;
  sessionId: string;
  targetDomain: string; // Extracted from step-2 endpoint
  name?: string; // Custom display name (optional)
  stabilized: boolean;
  stabilizedAt: number;
  step2: {
    id: string;
    endpoint: string;
    method: string;
    extractedVars: {
      access_token?: string; // Full token (unmasked)
      refresh_token?: string; // Full token (unmasked)
      id_token?: string; // Full token (unmasked)
      // Expiration tracking (set by refresh service / JWT decode)
      expires_at?: string; // epoch millis as string
      expires_in?: string; // seconds as string
      // OAuth credentials (from HAR or manual capture)
      client_id?: string;
      clientId?: string;
      client_secret?: string;
      clientSecret?: string;
      scope?: string;
      // HAR-extracted metadata
      refresh_url?: string;
      token_endpoint_host?: string;
      // Allow additional fields for extensibility
      [key: string]: string | undefined;
    };
    verificationStatus: {
      tokenCaptured: boolean;
      tokenInjectionAttempted: boolean;
      tokenInjectionSucceeded: boolean;
      authenticatedRequestsDetected: boolean;
      authenticatedRequestCount: number;
      verified: boolean;
      verifiedAt: number;
      authenticatedEndpoints: string[];
      issues: string[];
    };
    response?: any; // Store response to get expires_in
  };
  authenticatedEndpoints: string[];
  lockedSteps: Array<{
    id: string;
    stepNumber: number;
    endpoint: string;
    method: string;
    lockedAt: number;
  }>;
  apiKey?: string; // API key for accessing token endpoint
};

export type SessionMetadata = {
  sessionId: string;
  targetDomain: string;
  name?: string; // Custom display name
  stabilizedAt: number;
  authenticatedRequestCount: number;
  status: 'verified' | 'failed' | 'unverified';
  verificationStatus?: PersistedAuthWorkerState['step2']['verificationStatus'];
};

/**
 * Extract domain from endpoint URL
 */
function extractDomainFromEndpoint(endpoint: string): string {
  try {
    // Handle full URLs
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      const url = new URL(endpoint);
      return url.hostname.replace('www.', '');
    }
    
    // Handle paths like "/oauth2/v2.0/token" - extract from step-2 code or response
    // For now, try to extract from common patterns
    if (endpoint.includes('microsoftonline.com')) {
      return 'microsoftonline.com';
    }
    if (endpoint.includes('login.microsoftonline.com')) {
      return 'microsoftonline.com';
    }
    if (endpoint.includes('google.com')) {
      return 'google.com';
    }
    if (endpoint.includes('auth0.com')) {
      return 'auth0.com';
    }
    
    // Try to extract from endpoint path patterns
    const domainMatch = endpoint.match(/([a-z0-9-]+\.(com|net|org|io|co|dev|app))/i);
    if (domainMatch) {
      return domainMatch[1].toLowerCase();
    }
    
    return 'unknown-domain';
  } catch {
    return 'unknown-domain';
  }
}

/**
 * Extract domain from step-2 endpoint or code
 */
function extractDomainFromStep2(step2: LockedStep): string {
  // Try code field first (may contain full URL in fetch call)
  if (step2.code) {
    // Match URLs in fetch('https://...') or fetch("https://...")
    const urlMatches = step2.code.match(/https?:\/\/([^\/\s"')]+)/g);
    if (urlMatches && urlMatches.length > 0) {
      for (const urlStr of urlMatches) {
        try {
          const url = new URL(urlStr);
          const hostname = url.hostname.replace('www.', '');
          // Skip common auth domains that are just redirects
          if (!hostname.includes('login.microsoftonline.com') && 
              !hostname.includes('accounts.google.com') &&
              !hostname.includes('auth0.com')) {
            return hostname;
          }
          // For Microsoft, extract tenant domain
          if (hostname.includes('microsoftonline.com')) {
            // Try to extract tenant from path: /{tenant}/oauth2/...
            const tenantMatch = step2.endpoint?.match(/\/([a-f0-9-]{36})\//);
            if (tenantMatch) {
              return 'microsoftonline.com';
            }
            return 'microsoftonline.com';
          }
        } catch {
          // Invalid URL, continue
        }
      }
    }
  }
  
  // Try endpoint (may be full URL or path)
  if (step2.endpoint) {
    const domain = extractDomainFromEndpoint(step2.endpoint);
    if (domain !== 'unknown-domain') {
      return domain;
    }
  }
  
  // Try response field (may contain issuer or domain info)
  if (step2.response) {
    try {
      const response = typeof step2.response === 'string' 
        ? JSON.parse(step2.response) 
        : step2.response;
      
      // Check for issuer in JWT-like responses
      if (response.iss) {
        try {
          const issuerUrl = new URL(response.iss);
          return issuerUrl.hostname.replace('www.', '');
        } catch {
          // Not a URL
        }
      }
    } catch {
      // Response parsing failed
    }
  }
  
  return 'unknown-domain';
}

/**
 * Truncate/mask token for safe storage
 * Only stores first 10 and last 10 characters, middle is masked
 */
function maskToken(token: string): string {
  if (!token || token.length < 20) {
    return '[TOKEN_TOO_SHORT]';
  }
  const start = token.substring(0, 10);
  const end = token.substring(token.length - 10);
  return `${start}...${end}`;
}

/**
 * Get storage key for a session
 */
function getSessionStorageKey(sessionId: string): string {
  return `${STORAGE_KEY_PREFIX}${sessionId}`;
}

/**
 * Get sessions index
 */
function getSessionsIndex(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_INDEX_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Update sessions index
 */
function updateSessionsIndex(sessionIds: string[]): void {
  try {
    localStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(sessionIds));
  } catch (err) {
    console.error('[AuthWorkerPersistence] Failed to update sessions index:', err);
  }
}

/**
 * Persist stabilized Auth Worker state
 * 
 * Overload 1: Full state object (from HAR creation)
 * Overload 2: Individual parameters (legacy)
 */
export function persistAuthWorkerState(
  sessionId: string,
  step2OrState: LockedStep | PersistedAuthWorkerState,
  authenticatedEndpoints?: string[],
  lockedSteps?: LockedStep[]
): void {
  // Check if second parameter is a full state object
  if (authenticatedEndpoints === undefined && lockedSteps === undefined && 'step2' in step2OrState) {
    // Overload 1: Full state object
    const state = step2OrState as PersistedAuthWorkerState;
    persistFullState(sessionId, state);
    return;
  }
  
  // Overload 2: Individual parameters (legacy)
  const step2 = step2OrState as LockedStep;
  persistFromComponents(sessionId, step2, authenticatedEndpoints || [], lockedSteps || []);
}

/**
 * Persist full state object
 */
function persistFullState(sessionId: string, state: PersistedAuthWorkerState): void {
  try {
    // Ensure sessionId matches
    if (state.sessionId !== sessionId) {
      state = { ...state, sessionId };
    }
    
    // Ensure lockedSteps is always an array
    if (!state.lockedSteps || !Array.isArray(state.lockedSteps)) {
      state = {
        ...state,
        lockedSteps: state.step2 ? [{
          id: state.step2.id,
          stepNumber: 2,
          endpoint: state.step2.endpoint,
          method: state.step2.method,
          lockedAt: Date.now(),
        }] : [],
      };
    }

    const storageKey = getSessionStorageKey(sessionId);
    localStorage.setItem(storageKey, JSON.stringify(state));
    
    // Update sessions index
    const index = getSessionsIndex();
    if (!index.includes(sessionId)) {
      index.push(sessionId);
      updateSessionsIndex(index);
    }
    
    // Also save to server-side storage (for API access)
    // Sync via API call (works from client)
    if (typeof window !== 'undefined') {
      // Client-side: sync via API
      fetch('/api/auth-worker/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(state),
      }).catch((err) => {
        console.warn('[AuthWorkerPersistence] Failed to sync to server storage:', err);
      });
    } else {
      // Server-side: direct save
      try {
        const { saveSessionToServer } = require('./authWorkerServerStorage');
        saveSessionToServer(state).catch((err: any) => {
          console.error('[AuthWorkerPersistence] Failed to sync to server storage:', err);
        });
      } catch (err) {
        // Server storage not available
      }
    }
    
    console.log('[AuthWorkerPersistence] ✅ State persisted:', {
      sessionId,
      targetDomain: state.targetDomain,
      stabilizedAt: new Date(state.stabilizedAt).toISOString(),
      authenticatedRequestCount: state.step2.verificationStatus.authenticatedRequestCount,
    });
  } catch (err) {
    console.error('[AuthWorkerPersistence] ❌ Failed to persist state:', err);
  }
}

/**
 * Persist from individual components (legacy)
 */
function persistFromComponents(
  sessionId: string,
  step2: LockedStep,
  authenticatedEndpoints: string[],
  lockedSteps: LockedStep[]
): void {
  try {
    // Extract domain from step-2
    const targetDomain = extractDomainFromStep2(step2);
    
    // Store full tokens (unmasked) - user is the only user, encryption not needed
    const extractedVars: Record<string, string> = {};
    if (step2.extractedVars?.access_token) {
      extractedVars.access_token = step2.extractedVars.access_token;
    }
    if (step2.extractedVars?.refresh_token) {
      extractedVars.refresh_token = step2.extractedVars.refresh_token;
    }
    if (step2.extractedVars?.id_token) {
      extractedVars.id_token = step2.extractedVars.id_token;
    }

    // Generate API key for this session
    const apiKey = generateApiKey();

    // Ensure verificationStatus has required fields
    const verificationStatus = step2.verificationStatus || {
      tokenCaptured: false,
      tokenInjectionAttempted: false,
      tokenInjectionSucceeded: false,
      authenticatedRequestsDetected: false,
      authenticatedRequestCount: 0,
      verified: false,
      verifiedAt: Date.now(),
      authenticatedEndpoints: [],
      issues: [],
    };

    const state: PersistedAuthWorkerState = {
      version: STORAGE_VERSION,
      sessionId,
      targetDomain,
      stabilized: true,
      stabilizedAt: Date.now(),
      step2: {
        id: step2.id,
        endpoint: step2.endpoint,
        method: step2.method,
        extractedVars: extractedVars,
        verificationStatus: {
          ...verificationStatus,
          verifiedAt: verificationStatus.verifiedAt || Date.now(),
          authenticatedEndpoints: verificationStatus.authenticatedEndpoints || [],
        },
        response: step2.response, // Store response to get expires_in
      },
      authenticatedEndpoints,
      lockedSteps: (lockedSteps || [])
        .filter(step => step.stepNumber != null && step.lockedAt != null)
        .map(step => ({
          id: step.id,
          stepNumber: step.stepNumber!,
          endpoint: step.endpoint,
          method: step.method,
          lockedAt: step.lockedAt!,
        })),
      apiKey,
    };

    const storageKey = getSessionStorageKey(sessionId);
    localStorage.setItem(storageKey, JSON.stringify(state));
    
    // Update sessions index
    const index = getSessionsIndex();
    if (!index.includes(sessionId)) {
      index.push(sessionId);
      updateSessionsIndex(index);
    }
    
    // Also save to server-side storage (for API access)
    // Sync via API call (works from client)
    if (typeof window !== 'undefined') {
      // Client-side: sync via API
      fetch('/api/auth-worker/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(state),
      }).catch((err) => {
        console.warn('[AuthWorkerPersistence] Failed to sync to server storage:', err);
      });
    } else {
      // Server-side: direct save
      try {
        const { saveSessionToServer } = require('./authWorkerServerStorage');
        saveSessionToServer(state).catch((err: any) => {
          console.error('[AuthWorkerPersistence] Failed to sync to server storage:', err);
        });
      } catch (err) {
        // Server storage not available
      }
    }
    
    console.log('[AuthWorkerPersistence] ✅ State persisted:', {
      sessionId,
      targetDomain,
      stabilizedAt: new Date(state.stabilizedAt).toISOString(),
      authenticatedRequestCount: state.step2.verificationStatus.authenticatedRequestCount,
    });
  } catch (err) {
    console.error('[AuthWorkerPersistence] ❌ Failed to persist state:', err);
  }
}

/**
 * Restore persisted Auth Worker state by session ID
 */
export function restoreAuthWorkerState(sessionId?: string): PersistedAuthWorkerState | null {
  try {
    // If no sessionId provided, get the most recent one
    if (!sessionId) {
      const index = getSessionsIndex();
      if (index.length === 0) return null;
      
      // Get the most recent session
      const sessions = listAllSessions();
      if (sessions.length === 0) return null;
      
      const mostRecent = sessions.sort((a, b) => b.stabilizedAt - a.stabilizedAt)[0];
      sessionId = mostRecent.sessionId;
    }
    
    const storageKey = getSessionStorageKey(sessionId);
    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      return null;
    }

    const state: PersistedAuthWorkerState = JSON.parse(stored);

    // Validate version
    if (state.version !== STORAGE_VERSION) {
      console.warn('[AuthWorkerPersistence] ⚠️ Version mismatch, clearing old state');
      clearAuthWorkerState(sessionId);
      return null;
    }

    // Validate structure
    if (!state.stabilized || !state.sessionId || !state.step2?.verificationStatus?.verified) {
      console.warn('[AuthWorkerPersistence] ⚠️ Invalid state structure, clearing');
      clearAuthWorkerState(sessionId);
      return null;
    }

    console.log('[AuthWorkerPersistence] ✅ State restored:', {
      sessionId: state.sessionId,
      targetDomain: state.targetDomain,
      stabilizedAt: new Date(state.stabilizedAt).toISOString(),
      authenticatedRequestCount: state.step2.verificationStatus.authenticatedRequestCount,
    });

    return state;
  } catch (err) {
    console.error('[AuthWorkerPersistence] ❌ Failed to restore state:', err);
    if (sessionId) {
      clearAuthWorkerState(sessionId);
    }
    return null;
  }
}

/**
 * List all persisted sessions
 */
export function listAllSessions(): SessionMetadata[] {
  try {
    const index = getSessionsIndex();
    const sessions: SessionMetadata[] = [];
    
    for (const sessionId of index) {
      const storageKey = getSessionStorageKey(sessionId);
      const stored = localStorage.getItem(storageKey);
      if (!stored) continue;
      
      try {
        const state: PersistedAuthWorkerState = JSON.parse(stored);
        
        // Skip invalid or old versions
        if (state.version !== STORAGE_VERSION || !state.stabilized) {
          continue;
        }
        
        const status: SessionMetadata['status'] = 
          state.step2.verificationStatus.verified ? 'verified' :
          state.step2.verificationStatus.verified === false ? 'failed' :
          'unverified';
        
        sessions.push({
          sessionId: state.sessionId,
          targetDomain: state.targetDomain || 'unknown-domain',
          name: state.name,
          stabilizedAt: state.stabilizedAt,
          authenticatedRequestCount: state.step2.verificationStatus.authenticatedRequestCount,
          status,
          verificationStatus: state.step2.verificationStatus,
        });
      } catch {
        // Invalid session, skip
        continue;
      }
    }
    
    return sessions;
  } catch (err) {
    console.error('[AuthWorkerPersistence] ❌ Failed to list sessions:', err);
    return [];
  }
}

/**
 * Get session by ID
 */
export function getSessionById(sessionId: string): PersistedAuthWorkerState | null {
  try {
    const storageKey = getSessionStorageKey(sessionId);
    const stored = localStorage.getItem(storageKey);
    if (!stored) return null;
    
    const state: PersistedAuthWorkerState = JSON.parse(stored);
    if (state.version !== STORAGE_VERSION || !state.stabilized) {
      return null;
    }
    
    return state;
  } catch {
    return null;
  }
}

/**
 * Clear persisted Auth Worker state
 */
export function clearAuthWorkerState(sessionId?: string): void {
  try {
    if (sessionId) {
      // Clear specific session
      const storageKey = getSessionStorageKey(sessionId);
      localStorage.removeItem(storageKey);
      
      // Update index
      const index = getSessionsIndex();
      const updatedIndex = index.filter(id => id !== sessionId);
      updateSessionsIndex(updatedIndex);
      
      console.log('[AuthWorkerPersistence] ✅ Session cleared:', sessionId);
    } else {
      // Clear all sessions (legacy support)
      const index = getSessionsIndex();
      for (const id of index) {
        localStorage.removeItem(getSessionStorageKey(id));
      }
      localStorage.removeItem(STORAGE_INDEX_KEY);
      console.log('[AuthWorkerPersistence] ✅ All sessions cleared');
    }
  } catch (err) {
    console.error('[AuthWorkerPersistence] ❌ Failed to clear state:', err);
  }
}

/**
 * Check if Auth Worker state is persisted
 */
export function hasPersistedState(sessionId?: string): boolean {
  try {
    if (sessionId) {
      const storageKey = getSessionStorageKey(sessionId);
      const stored = localStorage.getItem(storageKey);
      if (!stored) return false;
      
      const state: PersistedAuthWorkerState = JSON.parse(stored);
      return state.stabilized === true && state.version === STORAGE_VERSION;
    } else {
      // Check if any session exists
      return listAllSessions().length > 0;
    }
  } catch {
    return false;
  }
}

/**
 * Update tokens for a persisted session (after refresh)
 */
export function updateSessionTokens(
  sessionId: string,
  newAccessToken?: string,
  newRefreshToken?: string,
  expiresIn?: number
): boolean {
  try {
    const state = getSessionById(sessionId);
    if (!state) {
      console.error('[AuthWorkerPersistence] Session not found for token update:', sessionId);
      return false;
    }

    // Update tokens
    if (newAccessToken) {
      state.step2.extractedVars.access_token = newAccessToken;
    }
    if (newRefreshToken) {
      state.step2.extractedVars.refresh_token = newRefreshToken;
    }

    // Update verification timestamp if token was refreshed
    if (newAccessToken) {
      state.step2.verificationStatus.verifiedAt = Date.now();
    }

    // Save updated state
    const storageKey = getSessionStorageKey(sessionId);
    localStorage.setItem(storageKey, JSON.stringify(state));

    // Also sync to server storage
    if (typeof window !== 'undefined') {
      // Client-side: sync via API
      fetch('/api/auth-worker/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(state),
      }).catch((err) => {
        console.warn('[AuthWorkerPersistence] Failed to sync tokens to server:', err);
      });
    } else {
      // Server-side: direct save
      try {
        const { saveSessionToServer } = require('./authWorkerServerStorage');
        saveSessionToServer(state).catch((err: any) => {
          console.error('[AuthWorkerPersistence] Failed to sync tokens to server:', err);
        });
      } catch (err) {
        // Server storage not available
      }
    }

    console.log('[AuthWorkerPersistence] ✅ Tokens updated for session:', sessionId);
    return true;
  } catch (err) {
    console.error('[AuthWorkerPersistence] ❌ Failed to update tokens:', err);
    return false;
  }
}

/**
 * Generate a random API key
 */
function generateApiKey(): string {
  // Generate a random 32-character hex string
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Get or generate API key for a session
 */
export function getOrGenerateApiKey(sessionId: string): string {
  try {
    const state = getSessionById(sessionId);
    if (!state) {
      throw new Error('Session not found');
    }

    // If API key exists, return it
    if (state.apiKey) {
      return state.apiKey;
    }

    // Generate new API key
    const newApiKey = generateApiKey();
    
    // Update session with API key
    const storageKey = getSessionStorageKey(sessionId);
    const updatedState = {
      ...state,
      apiKey: newApiKey,
    };
    
    localStorage.setItem(storageKey, JSON.stringify(updatedState));
    
    console.log('[AuthWorkerPersistence] ✅ API key generated for session:', sessionId);
    return newApiKey;
  } catch (err) {
    console.error('[AuthWorkerPersistence] ❌ Failed to get/generate API key:', err);
    throw err;
  }
}

/**
 * Update display name for a session
 */
export function updateSessionName(sessionId: string, name: string): boolean {
  try {
    const state = getSessionById(sessionId);
    if (!state) {
      throw new Error('Session not found');
    }

    // Update session with new name
    const storageKey = getSessionStorageKey(sessionId);
    const updatedState = {
      ...state,
      name: name.trim() || undefined, // Remove name if empty
    };
    
    localStorage.setItem(storageKey, JSON.stringify(updatedState));
    
    // Also sync to server storage
    if (typeof window !== 'undefined') {
      // Client-side: sync via API
      fetch('/api/auth-worker/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedState),
      }).catch((err) => {
        console.warn('[AuthWorkerPersistence] Failed to sync name to server:', err);
      });
    } else {
      // Server-side: direct save
      try {
        const { saveSessionToServer } = require('./authWorkerServerStorage');
        saveSessionToServer(updatedState).catch((err: any) => {
          console.error('[AuthWorkerPersistence] Failed to sync name to server:', err);
        });
      } catch (err) {
        // Server storage not available
      }
    }
    
    console.log('[AuthWorkerPersistence] ✅ Name updated for session:', sessionId, name);
    return true;
  } catch (err) {
    console.error('[AuthWorkerPersistence] ❌ Failed to update name:', err);
    return false;
  }
}

/**
 * Update API key for a session
 */
export function updateApiKey(sessionId: string, apiKey?: string): string {
  try {
    const state = getSessionById(sessionId);
    if (!state) {
      throw new Error('Session not found');
    }

    // Generate new key if not provided
    const newApiKey = apiKey || generateApiKey();
    
    // Update session with API key
    const storageKey = getSessionStorageKey(sessionId);
    const updatedState = {
      ...state,
      apiKey: newApiKey,
    };
    
    localStorage.setItem(storageKey, JSON.stringify(updatedState));
    
    // Also sync to server storage
    if (typeof window !== 'undefined') {
      // Client-side: sync via API
      fetch('/api/auth-worker/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedState),
      }).catch((err) => {
        console.warn('[AuthWorkerPersistence] Failed to sync API key to server:', err);
      });
    } else {
      // Server-side: direct save
      try {
        const { saveSessionToServer } = require('./authWorkerServerStorage');
        saveSessionToServer(updatedState).catch((err: any) => {
          console.error('[AuthWorkerPersistence] Failed to sync API key to server:', err);
        });
      } catch (err) {
        // Server storage not available
      }
    }
    
    console.log('[AuthWorkerPersistence] ✅ API key updated for session:', sessionId);
    return newApiKey;
  } catch (err) {
    console.error('[AuthWorkerPersistence] ❌ Failed to update API key:', err);
    throw err;
  }
}

/**
 * Get persisted state metadata (without full restoration)
 */
export function getPersistedStateMetadata(sessionId?: string): {
  sessionId: string;
  targetDomain: string;
  stabilizedAt: number;
  authenticatedRequestCount: number;
} | null {
  try {
    if (sessionId) {
      const state = getSessionById(sessionId);
      if (!state) return null;
      
      return {
        sessionId: state.sessionId,
        targetDomain: state.targetDomain,
        stabilizedAt: state.stabilizedAt,
        authenticatedRequestCount: state.step2.verificationStatus.authenticatedRequestCount,
      };
    } else {
      // Get most recent
      const sessions = listAllSessions();
      if (sessions.length === 0) return null;
      
      const mostRecent = sessions.sort((a, b) => b.stabilizedAt - a.stabilizedAt)[0];
      return {
        sessionId: mostRecent.sessionId,
        targetDomain: mostRecent.targetDomain,
        stabilizedAt: mostRecent.stabilizedAt,
        authenticatedRequestCount: mostRecent.authenticatedRequestCount,
      };
    }
  } catch {
    return null;
  }
}
