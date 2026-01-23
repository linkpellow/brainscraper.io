/**
 * API route: Get auth worker token
 * GET /api/auth-worker/token?sessionId=xxx&apiKey=xxx
 * GET /api/auth-worker/token?domain=xxx&apiKey=xxx
 * 
 * Returns current valid access token + auth metadata for a session
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromServer, listSessionsFromServer } from '../../../auth-workers/utils/authWorkerServerStorage';
import { getValidToken } from '../../../auth-workers/utils/tokenRefreshService';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('sessionId');
    const domain = searchParams.get('domain');
    const apiKey = searchParams.get('apiKey');

    if (!apiKey) {
      return NextResponse.json(
        { error: 'apiKey parameter is required' },
        { status: 401 }
      );
    }

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
      return NextResponse.json(
        { error: 'Either sessionId or domain parameter is required' },
        { status: 400 }
      );
    }

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Verify API key
    if (!session.apiKey || session.apiKey !== apiKey) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    // Get valid token (auto-refreshes if needed)
    const tokenResult = await getValidToken(session.sessionId);
    if (!tokenResult || !tokenResult.token) {
      return NextResponse.json(
        { error: 'No access token available for this session' },
        { status: 404 }
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
    });

  } catch (error: any) {
    console.error('[AuthWorker] Token endpoint error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get token' },
      { status: 500 }
    );
  }
}
