/**
 * Health Check API
 * 
 * Returns system health status for diagnostics
 */

import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const health = {
      timestamp: Date.now(),
      wsBridge: {
        connected: false, // Would check actual WS connection
        status: 'unknown',
      },
      authWorker: {
        running: false, // Would check actual auth worker status
        status: 'unknown',
      },
    };
    
    return NextResponse.json(health);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
