/**
 * Server-side endpoint test proxy
 * 
 * Executes API endpoint tests server-side to avoid CORS restrictions.
 * Uses auth worker credentials to make authenticated requests.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromServer } from '../../../auth-workers/utils/authWorkerServerStorage';
import { getValidToken } from '../../../auth-workers/utils/tokenRefreshService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, endpointId, url, method, headers, body: requestBody, mockData } = body;

    if (!sessionId || !url || !method) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: sessionId, url, method' },
        { status: 400 }
      );
    }

    // Load session from server-side storage
    const session = getSessionFromServer(sessionId);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    // Get valid token from auth worker
    const tokenResult = await getValidToken(sessionId);
    if (!tokenResult?.token) {
      return NextResponse.json(
        { success: false, error: 'Failed to get valid token from auth worker' },
        { status: 401 }
      );
    }

    // Build request headers with actual auth
    const requestHeaders: Record<string, string> = {
      ...headers,
    };

    // Add Authorization header with actual token (override client token with fresh one)
    if (tokenResult.token) {
      requestHeaders['Authorization'] = `Bearer ${tokenResult.token}`;
    }
    
    // Cookies are already included in headers from the client (loaded from HAR data)
    // The client-side code loads cookies from HAR data into auth context and includes them

    // Build full URL with query params from mock data
    let fullUrl = url;
    if (mockData && Object.keys(mockData).length > 0) {
      const urlObj = new URL(url);
      Object.entries(mockData).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          urlObj.searchParams.set(key, String(value));
        }
      });
      fullUrl = urlObj.toString();
    }

    // Execute the request server-side (no CORS issues)
    const startTime = Date.now();
    const response = await fetch(fullUrl, {
      method,
      headers: requestHeaders,
      body: requestBody ? JSON.stringify(requestBody) : undefined,
    });

    const duration = Date.now() - startTime;
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    // Get response data
    let responseData: any;
    try {
      responseData = isJson ? await response.json() : await response.text();
    } catch (e) {
      responseData = await response.text();
    }

    // Get all response headers
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      duration,
      response: responseData,
      responseHeaders,
      request: {
        url: fullUrl,
        method,
        headers: requestHeaders,
        body: requestBody,
      },
    });
  } catch (error) {
    console.error('[TestEndpoint] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: 'server',
      },
      { status: 500 }
    );
  }
}
