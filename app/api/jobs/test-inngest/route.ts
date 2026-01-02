/**
 * API Route to Test Inngest Connection
 * 
 * Tests if Inngest is properly configured and can send events
 */

import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/utils/inngest';

export async function POST(request: NextRequest) {
  try {
    const testEvent = {
      name: 'test/connection-check',
      data: {
        timestamp: new Date().toISOString(),
        test: true,
      },
    };

    console.log('[TEST_INNGEST] Testing Inngest connection...');
    console.log('[TEST_INNGEST] Event key present:', !!process.env.INNGEST_EVENT_KEY);
    console.log('[TEST_INNGEST] Event key value:', process.env.INNGEST_EVENT_KEY ? `${process.env.INNGEST_EVENT_KEY.substring(0, 15)}...` : 'NOT SET');
    
    try {
      const result = await inngest.send(testEvent);
      console.log('[TEST_INNGEST] ✅ Event sent successfully:', result);
      
      return NextResponse.json({
        success: true,
        message: 'Inngest connection test successful',
        eventKeyPresent: !!process.env.INNGEST_EVENT_KEY,
        eventKeyPrefix: process.env.INNGEST_EVENT_KEY ? `${process.env.INNGEST_EVENT_KEY.substring(0, 15)}...` : 'NOT SET',
        result,
      });
    } catch (error) {
      console.error('[TEST_INNGEST] ❌ Failed to send test event:', error);
      
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        eventKeyPresent: !!process.env.INNGEST_EVENT_KEY,
        eventKeyPrefix: process.env.INNGEST_EVENT_KEY ? `${process.env.INNGEST_EVENT_KEY.substring(0, 15)}...` : 'NOT SET',
        details: error instanceof Error ? error.stack : String(error),
      }, { status: 500 });
    }
  } catch (error) {
    console.error('[TEST_INNGEST] Error in test endpoint:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'Inngest test endpoint - use POST to test connection',
    eventKeyPresent: !!process.env.INNGEST_EVENT_KEY,
    eventKeyPrefix: process.env.INNGEST_EVENT_KEY ? `${process.env.INNGEST_EVENT_KEY.substring(0, 15)}...` : 'NOT SET',
    signingKeyPresent: !!process.env.INNGEST_SIGNING_KEY,
  });
}

