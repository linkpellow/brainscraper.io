/**
 * API route: Get auth worker token
 * GET /api/auth-worker/token?sessionId=xxx
 * GET /api/auth-worker/token?domain=xxx
 * GET /api/auth-worker/token?sessionId=xxx&apiKey=xxx (optional - auto-generated if missing)
 * 
 * Returns current valid access token + auth metadata for a session
 * - Auto-refreshes token if expires within 30 minutes
 * - Auto-generates API key if session doesn't have one
 * - Always returns a valid, fresh token
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromServer, listSessionsFromServer, saveSessionToServer } from '../../../auth-workers/utils/authWorkerServerStorage';
import { getValidToken } from '../../../auth-workers/utils/tokenRefreshService';
import type { PersistedAuthWorkerState } from '../../../auth-workers/utils/authWorkerPersistence';

// CORS headers helper - allows requests from any origin
function getCorsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  return NextResponse.json({}, { headers: getCorsHeaders(origin) });
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('sessionId');
    const domain = searchParams.get('domain');
    const apiKey = searchParams.get('apiKey');
    // Note: apiKey is optional - if not provided, one will be auto-generated

    let session = null;

    // Get session by sessionId or domain (from server-side storage)
    if (sessionId) {
      session = getSessionFromServer(sessionId);
    } else if (domain) {
      // Get most recent session for domain
      const sessions = listSessionsFromServer();
      const domainSessions = sessions
        .filter(s => s.targetDomain === domain)
        .sort((a, b) => b.stabilizedAt - a.stabilizedAt);
      
      if (domainSessions.length > 0) {
        session = getSessionFromServer(domainSessions[0].sessionId);
      }
    } else {
      const origin = request.headers.get('origin');
      return NextResponse.json(
        { error: 'Either sessionId or domain parameter is required' },
        { status: 400, headers: getCorsHeaders(origin) }
      );
    }

    if (!session) {
      const origin = request.headers.get('origin');
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404, headers: getCorsHeaders(origin) }
      );
    }

    // Auto-generate API key if session doesn't have one
    let apiKeyGenerated = false;
    if (!session.apiKey) {
      // Generate a random 32-character hex string
      const array = new Uint8Array(16);
      crypto.getRandomValues(array);
      const newApiKey = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
      
      // Update session with API key
      const updatedSession: PersistedAuthWorkerState = {
        ...session,
        apiKey: newApiKey,
      };
      
      // Save to server storage
      await saveSessionToServer(updatedSession);
      session = updatedSession;
      apiKeyGenerated = true;
      
      console.log('[AuthWorker] Auto-generated API key for session:', session.sessionId);
    }

    // Verify API key (if provided, must match; if not provided, use the auto-generated one)
    if (apiKey && session.apiKey !== apiKey) {
      const origin = request.headers.get('origin');
      return NextResponse.json(
        { 
          error: 'Invalid API key',
          hint: 'If you don\'t have an API key, omit the apiKey parameter and one will be auto-generated. The generated key will be returned in the response.',
        },
        { status: 401, headers: getCorsHeaders(origin) }
      );
    }

    // Get valid token (auto-refreshes if needed)
    const tokenResult = await getValidToken(session.sessionId);
    if (!tokenResult || !tokenResult.token) {
      const origin = request.headers.get('origin');
      return NextResponse.json(
        { error: 'No access token available for this session' },
        { status: 404, headers: getCorsHeaders(origin) }
      );
    }

    const accessToken = tokenResult.token;
    const wasRefreshed = tokenResult.wasRefreshed;

    // Reload session to get updated expiration info after potential refresh
    const updatedSession = getSessionFromServer(session.sessionId);
    if (updatedSession) {
      session = updatedSession;
    }

    // Calculate expiration info
    let expiresIn: number | undefined;
    let expiresAt: number | undefined;
    
    try {
      if (session.step2.response) {
        const response = typeof session.step2.response === 'string' 
          ? JSON.parse(session.step2.response) 
          : session.step2.response;
        expiresIn = response?.expires_in || response?.expiresIn;
      }
    } catch {
      // Response parsing failed
    }

    if (expiresIn) {
      const verifiedAt = session.step2.verificationStatus.verifiedAt;
      if (verifiedAt) {
        expiresAt = verifiedAt + (expiresIn * 1000);
        expiresIn = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      }
    }

    // Return token + auth metadata
    const origin = request.headers.get('origin');
    return NextResponse.json({
      success: true,
      token: accessToken,
      tokenType: 'Bearer',
      expiresIn: expiresIn || null,
      expiresAt: expiresAt || null,
      domain: session.targetDomain,
      sessionId: session.sessionId,
      authenticatedEndpoints: session.authenticatedEndpoints,
      capturedAt: new Date(session.stabilizedAt).toISOString(),
      wasRefreshed: wasRefreshed || false, // Indicates if token was auto-refreshed
      apiKey: session.apiKey || undefined, // Return API key (useful if auto-generated)
      apiKeyGenerated: apiKeyGenerated, // Indicates if API key was just generated
    }, { headers: getCorsHeaders(origin) });

  } catch (error: any) {
    console.error('[AuthWorker] Token endpoint error:', error);
    const origin = request.headers.get('origin');
    return NextResponse.json(
      { error: error.message || 'Failed to get token' },
      { status: 500, headers: getCorsHeaders(origin) }
    );
  }
}
