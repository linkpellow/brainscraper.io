/**
 * Settings Usage API Route
 * 
 * GET /api/settings/usage - Get current usage statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUsageStats } from '@/utils/scrapeUsageTracker';
import { loadSettings } from '@/utils/settingsConfig';

/**
 * GET /api/settings/usage
 * Get current usage statistics
 */
export async function GET() {
  try {
    const settings = loadSettings();
    
    const stats = await getUsageStats(
      {
        linkedin: settings.scrapeLimits.linkedin.daily,
        facebook: settings.scrapeLimits.facebook.daily,
      },
      {
        linkedin: settings.scrapeLimits.linkedin.monthly,
        facebook: settings.scrapeLimits.facebook.monthly,
      }
    );

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('[SETTINGS_USAGE_API] Failed to get usage stats:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get usage statistics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

