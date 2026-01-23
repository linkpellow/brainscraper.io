/**
 * Enrich existing auth worker session with credentials from HAR
 * 
 * This fixes the root cause: existing sessions created before HAR extraction
 * are missing client_id and other OAuth credentials needed for token refresh.
 */

import type { ArtifactBundle, OAuthCredentials, TokenData } from './harToAuthWorker';
import { extractOAuthCredentials } from './harToAuthWorker';
import type { PersistedAuthWorkerState } from '../../utils/authWorkerPersistence';

/**
 * Enrich an existing auth worker session with OAuth credentials from HAR
 * 
 * ROOT CAUSE FIX: This allows old sessions (created before HAR extraction)
 * to be automatically fixed by uploading a HAR file with the OAuth flow.
 */
export async function enrichSessionFromHAR(
  sessionId: string,
  bundle: ArtifactBundle
): Promise<{ enriched: boolean; missingFields: string[]; addedFields: string[] }> {
  // Dynamic import to avoid bundling server-only code in client
  const { getSessionFromServer, enrichSessionOnServer } = await import('../../utils/authWorkerServerStorage');
  
  const session = getSessionFromServer(sessionId);
  if (!session) {
    return { enriched: false, missingFields: [], addedFields: [] };
  }

  const { credentials, tokenEndpoint, tokenData } = extractOAuthCredentials(bundle.events);
  
  if (!tokenEndpoint || !tokenData?.access_token) {
    return { enriched: false, missingFields: [], addedFields: [] };
  }

  const extractedVars = session.step2.extractedVars as Record<string, string>;
  const missingFields: string[] = [];
  const addedFields: string[] = [];
  let needsUpdate = false;

  // Check and add client_id
  if (!extractedVars.client_id && !extractedVars.clientId) {
    if (credentials.client_id || credentials.clientId) {
      extractedVars.client_id = credentials.client_id || credentials.clientId!;
      addedFields.push('client_id');
      needsUpdate = true;
    } else {
      missingFields.push('client_id');
    }
  }

  // Check and add client_secret
  if (!extractedVars.client_secret && !extractedVars.clientSecret) {
    if (credentials.client_secret || credentials.clientSecret) {
      extractedVars.client_secret = credentials.client_secret || credentials.clientSecret!;
      addedFields.push('client_secret');
      needsUpdate = true;
    }
  }

  // Check and add scope
  if (!extractedVars.scope && credentials.scope) {
    extractedVars.scope = credentials.scope;
    addedFields.push('scope');
    needsUpdate = true;
  }

  // Check and add refresh_url
  if (!extractedVars.refresh_url && tokenEndpoint) {
    const refreshUrl = tokenEndpoint.url || `${tokenEndpoint.host}${tokenEndpoint.path}`;
    extractedVars.refresh_url = refreshUrl;
    addedFields.push('refresh_url');
    needsUpdate = true;
  }

  // Update tokens if newer ones are available
  if (tokenData.access_token && tokenData.access_token !== extractedVars.access_token) {
    extractedVars.access_token = tokenData.access_token;
    addedFields.push('access_token (updated)');
    needsUpdate = true;
  }

  if (tokenData.refresh_token && tokenData.refresh_token !== extractedVars.refresh_token) {
    extractedVars.refresh_token = tokenData.refresh_token;
    addedFields.push('refresh_token (updated)');
    needsUpdate = true;
  }

  // Update session if we found new credentials
  if (needsUpdate) {
    // Build the enriched vars object (only new/updated fields)
    const enrichedVars: Record<string, string> = {};
    for (const field of addedFields) {
      if (field.includes('client_id')) {
        enrichedVars.client_id = extractedVars.client_id || extractedVars.clientId || '';
      } else if (field.includes('client_secret')) {
        enrichedVars.client_secret = extractedVars.client_secret || extractedVars.clientSecret || '';
      } else if (field.includes('scope')) {
        enrichedVars.scope = extractedVars.scope || '';
      } else if (field.includes('refresh_url')) {
        enrichedVars.refresh_url = extractedVars.refresh_url || '';
      } else if (field.includes('access_token')) {
        enrichedVars.access_token = extractedVars.access_token || '';
      } else if (field.includes('refresh_token')) {
        enrichedVars.refresh_token = extractedVars.refresh_token || '';
      }
    }
    
    // Enrich session on server (this persists all the new credentials)
    await enrichSessionOnServer(sessionId, enrichedVars);

    console.log('[EnrichAuthWorker] ✅ Enriched session:', {
      sessionId,
      addedFields,
      missingFields,
      hadClientId: !!(session.step2.extractedVars.client_id || (session.step2.extractedVars as any).clientId),
      nowHasClientId: !!(extractedVars.client_id || extractedVars.clientId),
    });

    return { enriched: true, missingFields, addedFields };
  }

  return { enriched: false, missingFields, addedFields };
}

/**
 * Find and enrich all sessions for a given target domain
 */
export function enrichAllSessionsForDomain(
  targetDomain: string,
  bundle: ArtifactBundle
): Array<{ sessionId: string; enriched: boolean; addedFields: string[] }> {
  // This would require access to getAllSessions - for now, we'll enrich the current session
  // In a full implementation, we'd iterate through all sessions and match by targetDomain
  const results: Array<{ sessionId: string; enriched: boolean; addedFields: string[] }> = [];
  
  // For now, return empty - the caller should pass the specific sessionId
  return results;
}
