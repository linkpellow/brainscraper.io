/**
 * API route: Refresh auth worker tokens
 * POST /api/auth-worker/refresh
 * 
 * Refreshes access tokens for auth worker sessions using refresh tokens
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromServer, updateSessionTokensOnServer } from '../../../auth-workers/utils/authWorkerServerStorage';

/**
 * Fix common Microsoft OAuth URL issues
 */
function fixMicrosoftUrl(url: string): string {
  if (url.includes('microsoftonline.com') && !url.includes('login.microsoftonline.com')) {
    url = url.replace('microsoftonline.com', 'login.microsoftonline.com');
    url = url.replace('https://microsoftonline.com', 'https://login.microsoftonline.com');
    url = url.replace('http://microsoftonline.com', 'https://login.microsoftonline.com');
  }
  return url;
}

/**
 * Construct refresh URL from session data
 */
function constructRefreshUrl(session: any, refreshEndpoint: string): string {
  // Check if refresh_url was stored from HAR (HAR-only workflow)
  const storedRefreshUrl = (session.step2.extractedVars as any).refresh_url;
  if (storedRefreshUrl) {
    return fixMicrosoftUrl(storedRefreshUrl);
  }

  // If endpoint is already a full URL, use it
  if (refreshEndpoint.startsWith('http://') || refreshEndpoint.startsWith('https://')) {
    return fixMicrosoftUrl(refreshEndpoint);
  }

  // Handle Microsoft OAuth (relative paths)
  if (session.targetDomain.includes('microsoft') || session.targetDomain.includes('microsoftonline')) {
    const tenantMatch = refreshEndpoint.match(/\/([^\/]+)\/oauth2/);
    if (tenantMatch) {
      return `https://login.microsoftonline.com/${tenantMatch[1]}/oauth2/v2.0/token`;
    }
    
    const domainTenantMatch = session.targetDomain.match(/([^\.]+)\.microsoftonline\.com/);
    if (domainTenantMatch) {
      return `https://login.microsoftonline.com/${domainTenantMatch[1]}/oauth2/v2.0/token`;
    }
    
    return 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  }

  // Default: construct from target domain
  const baseUrl = `https://${session.targetDomain}`;
  return `${baseUrl}${refreshEndpoint.startsWith('/') ? '' : '/'}${refreshEndpoint}`;
}

/**
 * Extract OAuth credentials from session
 */
function extractCredentials(session: any): { clientId?: string; clientSecret?: string; scope?: string } {
  const extractedVars = session.step2.extractedVars as Record<string, string>;
  let clientId = extractedVars.client_id || extractedVars.clientId;
  let clientSecret = extractedVars.client_secret || extractedVars.clientSecret;
  let scope = extractedVars.scope;

  // Try to extract from step2 response if not in extractedVars
  if (!clientId && session.step2.response) {
    try {
      const response = typeof session.step2.response === 'string' 
        ? JSON.parse(session.step2.response) 
        : session.step2.response;
      if (response.client_id) {
        clientId = response.client_id;
      }
    } catch {
      // Response parsing failed, ignore
    }
  }

  return { clientId, clientSecret, scope };
}

/**
 * Refresh Microsoft OAuth token
 * 
 * Microsoft OAuth v2.0 refresh token requirements:
 * - client_id is REQUIRED for public client flows
 * - client_id + client_secret are REQUIRED for confidential client flows
 * - scope should match the original scope (optional but recommended)
 * - Request must be application/x-www-form-urlencoded
 */
async function refreshMicrosoftToken(
  refreshUrl: string,
  refreshToken: string,
  refreshMethod: string,
  credentials: { clientId?: string; clientSecret?: string; scope?: string }
): Promise<Response> {
  // Build form parameters - Microsoft requires specific order and format
  const formParams = new URLSearchParams();
  
  // Required parameters (in specific order per Microsoft docs)
  formParams.append('grant_type', 'refresh_token');
  formParams.append('refresh_token', refreshToken);
  
  // client_id is REQUIRED for Microsoft OAuth refresh
  if (credentials.clientId) {
    formParams.append('client_id', credentials.clientId);
  } else {
    // Log warning but still attempt (some flows might work without it)
    console.warn('[AuthWorker] Microsoft OAuth refresh: client_id is missing - request may fail');
  }
  
  // client_secret is required for confidential clients
  if (credentials.clientSecret) {
    formParams.append('client_secret', credentials.clientSecret);
  }
  
  // scope should match original request (helps maintain permissions)
  if (credentials.scope) {
    formParams.append('scope', credentials.scope);
  }

  // Log the request for debugging (without sensitive data)
  console.log('[AuthWorker] Microsoft OAuth refresh request:', {
    url: refreshUrl,
    method: refreshMethod,
    hasClientId: !!credentials.clientId,
    hasClientSecret: !!credentials.clientSecret,
    hasScope: !!credentials.scope,
    paramCount: formParams.toString().split('&').length,
  });

  // Make the request
  const response = await fetch(refreshUrl, {
    method: refreshMethod || 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: formParams.toString(),
  });

  return response;
}

/**
 * Refresh non-Microsoft OAuth token (try JSON first, then form-encoded)
 */
async function refreshGenericToken(
  refreshUrl: string,
  refreshToken: string,
  refreshMethod: string,
  credentials: { clientId?: string; clientSecret?: string }
): Promise<Response> {
  // Try JSON first
  const refreshBody: Record<string, string> = {
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  };

  if (credentials.clientId) {
    refreshBody.client_id = credentials.clientId;
  }
  if (credentials.clientSecret) {
    refreshBody.client_secret = credentials.clientSecret;
  }

  let response = await fetch(refreshUrl, {
    method: refreshMethod,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(refreshBody),
  });

  // If JSON fails, try form-encoded
  if (!response.ok) {
    const formParams = new URLSearchParams({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    if (credentials.clientId) {
      formParams.append('client_id', credentials.clientId);
    }
    if (credentials.clientSecret) {
      formParams.append('client_secret', credentials.clientSecret);
    }

    response = await fetch(refreshUrl, {
      method: refreshMethod,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: formParams.toString(),
    });
  }

  return response;
}

/**
 * Handle refresh response and update session
 */
async function handleRefreshResponse(
  response: Response,
  sessionId: string,
  refreshToken: string,
  refreshUrl: string,
  refreshMethod: string,
  isMicrosoft: boolean,
  credentials: { clientId?: string; clientSecret?: string }
): Promise<NextResponse> {
  if (!response.ok) {
    const errorText = await response.text();
    let errorDetails: any = {};
    try {
      errorDetails = JSON.parse(errorText);
    } catch {
      errorDetails = { error: errorText };
    }

    // Microsoft-specific error handling
    if (isMicrosoft) {
      let suggestion = '';
      let needsRecreation = false;
      
      if (errorDetails.error === 'invalid_grant') {
        // AADSTS9002313 specifically means malformed request
        if (errorDetails.error_codes?.includes(9002313)) {
          if (!credentials.clientId) {
            suggestion = 'Microsoft OAuth refresh requires client_id, but it was not captured during the initial auth flow. The request is malformed without it. You need to recreate the auth worker from a HAR file that includes the OAuth token exchange request.';
            needsRecreation = true;
          } else if (!credentials.clientSecret && errorDetails.error_description?.includes('client_secret')) {
            suggestion = 'Microsoft OAuth refresh requires client_secret for confidential client flows. You may need to recreate the auth worker to capture client_secret from the original OAuth request.';
            needsRecreation = true;
          } else {
            suggestion = 'Microsoft OAuth refresh failed with invalid_grant (AADSTS9002313: malformed request). Possible causes: 1) Refresh token expired or invalid, 2) Incorrect client_id/client_secret, 3) Missing or incorrect scope parameter, 4) Request format issue. Check the original OAuth request in your HAR file.';
          }
        } else if (!credentials.clientId) {
          suggestion = 'Microsoft OAuth refresh requires client_id, but it was not captured during the initial auth flow. You need to recreate the auth worker from a HAR file that includes the OAuth token exchange request.';
          needsRecreation = true;
        } else {
          suggestion = 'Microsoft OAuth refresh failed with invalid_grant. This could mean: 1) Refresh token expired, 2) Wrong client_id, 3) Missing required parameters.';
        }
      }

      return NextResponse.json(
        {
          error: `Token refresh failed: ${response.status} ${response.statusText}`,
          details: errorText.substring(0, 500),
          url: refreshUrl,
          method: refreshMethod,
          microsoftError: errorDetails.error,
          microsoftErrorCode: errorDetails.error_codes?.[0],
          microsoftErrorDescription: errorDetails.error_description,
          suggestion: suggestion || undefined,
          needsRecreation,
        },
        { status: response.status }
      );
    }

    // Generic error handling
    return NextResponse.json(
      {
        error: `Token refresh failed: ${response.status} ${response.statusText}`,
        details: errorText.substring(0, 200),
        url: refreshUrl,
        method: refreshMethod,
      },
      { status: response.status }
    );
  }

  // Success: parse response and update session
  const data = await response.json();
  const tokenSource = data.tokenResult || data.data || data;
  const newAccessToken = tokenSource.access_token || data.access_token || data.accessToken;
  const newRefreshToken = tokenSource.refresh_token || data.refresh_token || data.refreshToken || refreshToken;
  const expiresIn = tokenSource.expires_in || data.expires_in || data.expiresIn;

  // Extract expiration time
  let expiresAt: number | undefined;
  if (expiresIn) {
    if (expiresIn > 1000000000) {
      // Unix timestamp (seconds) - convert to milliseconds
      expiresAt = expiresIn * 1000;
    } else {
      // Seconds until expiration - add to current time
      expiresAt = Date.now() + (expiresIn * 1000);
    }
  } else if (newAccessToken) {
    // Try to extract from JWT
    try {
      const parts = newAccessToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        if (payload.exp) {
          expiresAt = payload.exp * 1000;
        }
      }
    } catch {
      // JWT parsing failed
    }
  }

  // Update session with new token and expiration
  const session = getSessionFromServer(sessionId);
  if (session) {
    const updatedExtractedVars = {
      ...session.step2.extractedVars,
      access_token: newAccessToken,
    };
    
    if (newRefreshToken && newRefreshToken !== refreshToken) {
      updatedExtractedVars.refresh_token = newRefreshToken;
    }
    
    if (expiresAt) {
      updatedExtractedVars.expires_at = expiresAt.toString();
    }
    if (expiresIn) {
      updatedExtractedVars.expires_in = expiresIn.toString();
    } else if (expiresAt) {
      // Calculate expires_in from expires_at if not provided
      const expiresInSeconds = Math.floor((expiresAt - Date.now()) / 1000);
      if (expiresInSeconds > 0) {
        updatedExtractedVars.expires_in = expiresInSeconds.toString();
      }
    }

    // Update verification timestamp
    session.step2.extractedVars = updatedExtractedVars;
    session.step2.verificationStatus.verifiedAt = Date.now();
    
    // Save updated session
    const { saveSessionToServer } = require('../../../auth-workers/utils/authWorkerServerStorage');
    await saveSessionToServer(session);
  } else {
    // Fallback to updateSessionTokensOnServer if session not found
    await updateSessionTokensOnServer(sessionId, newAccessToken, newRefreshToken);
  }

  return NextResponse.json({
    success: true,
    sessionId,
    newAccessToken: newAccessToken ? `${newAccessToken.substring(0, 20)}...` : null,
    expiresIn,
    expiresAt,
  });
}

/**
 * Main POST handler
 */
export async function POST(request: NextRequest) {
  let body: any = {};

  // Parse request body
  try {
    body = await request.json();
  } catch (parseError) {
    return NextResponse.json(
      {
        error: 'Invalid JSON in request body',
        details: parseError instanceof Error ? parseError.message : String(parseError),
      },
      { status: 400 }
    );
  }

  const { sessionId } = body;
  if (!sessionId) {
    return NextResponse.json(
      { error: 'sessionId is required', receivedBody: body },
      { status: 400 }
    );
  }

  // Get session from server storage
  const session = getSessionFromServer(sessionId);
  if (!session) {
    return NextResponse.json(
      { error: 'Session not found' },
      { status: 404 }
    );
  }

  // Check if we have refresh capability
  const refreshToken = session.step2.extractedVars.refresh_token;
  const refreshUrl = session.step2.extractedVars.refresh_url;
  const accessToken = session.step2.extractedVars.access_token;

  // If no refresh_token but we have refresh_url and access_token, try Bearer token refresh
  if (!refreshToken && refreshUrl && accessToken) {
    try {
      console.log('[AuthWorker] Attempting Bearer token refresh (no refresh_token available)');
      
      const response = await fetch(refreshUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json(
          {
            error: `Bearer token refresh failed: ${response.status} ${response.statusText}`,
            details: errorText.substring(0, 500),
            url: refreshUrl,
          },
          { status: response.status }
        );
      }

      const data = await response.json();
      const tokenSource = data.tokenResult || data.data || data;
      const newAccessToken = tokenSource.access_token || data.access_token;

      if (!newAccessToken) {
        return NextResponse.json(
          { error: 'Bearer token refresh response missing access_token' },
          { status: 400 }
        );
      }

      // Extract expiration
      let expiresAt: number | undefined;
      const expiresIn = tokenSource.expires_in || data.expires_in;
      
      if (expiresIn) {
        if (expiresIn > 1000000000) {
          expiresAt = expiresIn * 1000;
        } else {
          expiresAt = Date.now() + (expiresIn * 1000);
        }
      } else {
        // Try to extract from JWT
        try {
          const parts = newAccessToken.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
            if (payload.exp) {
              expiresAt = payload.exp * 1000;
            }
          }
        } catch {
          // JWT parsing failed
        }
      }

      // Update session
      const updatedExtractedVars = {
        ...session.step2.extractedVars,
        access_token: newAccessToken,
      };

      if (expiresAt) {
        updatedExtractedVars.expires_at = expiresAt.toString();
      }
      if (expiresIn) {
        updatedExtractedVars.expires_in = expiresIn.toString();
      }

      await updateSessionTokensOnServer(
        sessionId,
        newAccessToken,
        undefined, // No new refresh token for Bearer refresh
      );

      return NextResponse.json({
        success: true,
        sessionId,
        newAccessToken: newAccessToken ? `${newAccessToken.substring(0, 20)}...` : null,
        expiresIn,
        expiresAt,
      });
    } catch (error: any) {
      console.error('[AuthWorker] Bearer token refresh error:', error);
      return NextResponse.json(
        {
          error: `Bearer token refresh failed: ${error.message || 'Unknown error'}`,
          url: refreshUrl,
        },
        { status: 500 }
      );
    }
  }

  // OAuth refresh_token flow requires refresh_token
  if (!refreshToken) {
    return NextResponse.json(
      { 
        error: 'No refresh token available for this session',
        suggestion: refreshUrl 
          ? 'This session uses Bearer token refresh. The refresh should be handled client-side.'
          : 'No refresh mechanism available. You may need to recreate the auth worker.',
      },
      { status: 400 }
    );
  }

  // Get refresh endpoint and method
  const refreshEndpoint = session.step2.endpoint;
  const refreshMethod = session.step2.method;

  // Construct refresh URL
  let fullRefreshUrl: string;
  try {
    fullRefreshUrl = fixMicrosoftUrl(constructRefreshUrl(session, refreshEndpoint));
  } catch (urlError) {
    console.error('[AuthWorker] URL construction error:', urlError);
    // Fallback to common Microsoft URL
    if (refreshEndpoint.includes('microsoftonline') || refreshEndpoint.includes('oauth2') || session.targetDomain.includes('microsoft')) {
      fullRefreshUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
    } else {
      fullRefreshUrl = `https://${session.targetDomain}${refreshEndpoint.startsWith('/') ? '' : '/'}${refreshEndpoint}`;
    }
  }

  console.log('[AuthWorker] Refresh URL constructed:', {
    originalEndpoint: refreshEndpoint,
    targetDomain: session.targetDomain,
    fullRefreshUrl,
    method: refreshMethod,
  });

  // Extract credentials
  const credentials = extractCredentials(session);
  console.log('[AuthWorker] Client credentials check:', {
    hasClientId: !!credentials.clientId,
    hasClientSecret: !!credentials.clientSecret,
    hasScope: !!credentials.scope,
    extractedVarsKeys: Object.keys(session.step2.extractedVars),
    clientIdPreview: credentials.clientId ? `${credentials.clientId.substring(0, 10)}...` : 'missing',
    sessionTargetDomain: session.targetDomain,
    refreshEndpoint: refreshEndpoint,
  });
  
  // Warn if client_id is missing for Microsoft OAuth
  const isMicrosoftOAuth = fullRefreshUrl.includes('login.microsoftonline.com') || fullRefreshUrl.includes('microsoftonline.com');
  if (isMicrosoftOAuth && !credentials.clientId) {
    console.warn('[AuthWorker] ⚠️  Microsoft OAuth refresh requires client_id, but it was not found in session. This will likely fail with AADSTS9002313.');
    console.warn('[AuthWorker] Session extractedVars:', JSON.stringify(session.step2.extractedVars, null, 2));
    console.warn('[AuthWorker] To fix: Recreate auth worker from HAR file that includes the OAuth token exchange request.');
  }

  // Attempt to refresh token
  try {
    const isMicrosoftOAuth = fullRefreshUrl.includes('login.microsoftonline.com') || fullRefreshUrl.includes('microsoftonline.com');

    let response: Response;
    if (isMicrosoftOAuth) {
      response = await refreshMicrosoftToken(fullRefreshUrl, refreshToken, refreshMethod, credentials);
    } else {
      response = await refreshGenericToken(fullRefreshUrl, refreshToken, refreshMethod, credentials);
    }

    return await handleRefreshResponse(
      response,
      sessionId,
      refreshToken,
      fullRefreshUrl,
      refreshMethod,
      isMicrosoftOAuth,
      credentials
    );
  } catch (error: any) {
    console.error('[AuthWorker] Refresh request error:', {
      message: error.message,
      stack: error.stack,
      url: fullRefreshUrl,
      method: refreshMethod,
      sessionId,
    });
    return NextResponse.json(
      {
        error: `Refresh request failed: ${error.message || 'Unknown error'}`,
        url: fullRefreshUrl,
        method: refreshMethod,
      },
      { status: 500 }
    );
  }
}
