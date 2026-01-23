/**
 * Server Errors API
 * 
 * Returns server-side errors for client-side diagnostic system
 */

import { NextResponse } from 'next/server';

// Simple in-memory store (in production, use Redis or database)
const serverErrors: Array<{
  id: string;
  timestamp: number;
  error: any;
  context?: any;
}> = [];

/**
 * Store a server error
 */
export function storeServerError(error: any, context?: any) {
  serverErrors.push({
    id: `server_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    error: error instanceof Error ? {
      message: error.message,
      name: error.name,
      stack: error.stack,
    } : error,
    context,
  });
  
  // Keep only last 100 errors
  if (serverErrors.length > 100) {
    serverErrors.shift();
  }
}

/**
 * Get server errors
 */
export async function GET() {
  try {
    // Return errors that haven't been seen yet (older than 1 second)
    // This prevents duplicate reporting
    const now = Date.now();
    const recentErrors = serverErrors.filter(e => now - e.timestamp < 60000); // Last minute
    
    return NextResponse.json({
      errors: recentErrors,
      count: recentErrors.length,
    });
  } catch (error) {
    return NextResponse.json(
      { 
        errors: [],
        count: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
