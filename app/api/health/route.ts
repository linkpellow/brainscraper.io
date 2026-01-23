/**
 * Health Check Endpoint
 * 
 * Returns system health status for dependency monitoring
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    // Basic health checks
    const health = {
      database: 'ok', // Placeholder - add actual DB check if needed
      signalStream: 'connected', // Placeholder - could check WebSocket server status
      disk: 'ok', // Placeholder - could check disk space
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(health, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Health check failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
