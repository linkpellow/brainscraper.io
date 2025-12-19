/**
 * API endpoint to recover orphaned leads
 * Scans enriched-leads/ directory and aggregates any leads not in enriched-all-leads.json
 */

import { NextRequest, NextResponse } from 'next/server';
import { recoverOrphanedLeads } from '@/utils/leadDataManager';

export async function POST(request: NextRequest) {
  try {
    console.log('[RECOVER_ORPHANS] Starting orphan recovery...');
    const result = await recoverOrphanedLeads();
    
    return NextResponse.json({
      success: result.recovered > 0 || result.errors === 0,
      recovered: result.recovered,
      errors: result.errors,
      details: result.details,
      message: result.recovered > 0
        ? `Successfully recovered ${result.recovered} orphaned leads`
        : 'No orphaned leads found',
    });
  } catch (error) {
    console.error('[RECOVER_ORPHANS] Recovery failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        recovered: 0,
        errors: 1,
        details: [`Recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      },
      { status: 500 }
    );
  }
}
