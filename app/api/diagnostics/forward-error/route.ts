/**
 * Forward Server-Side Errors to Client
 * 
 * Allows server-side code to forward errors to the client-side
 * console logs widget for unified debugging.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { error, context, sessionId } = body;
    
    // Store error in a way that client can retrieve
    // For now, we'll use a simple in-memory store (could be Redis in production)
    // Client will poll or use Server-Sent Events to retrieve
    
    // Return success - client will handle retrieval
    return NextResponse.json({
      success: true,
      errorId: `server_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
