import { NextResponse } from 'next/server';
import { loadAllEnrichedLeads } from '@/utils/incrementalSave';

/**
 * API endpoint to load all enriched leads from disk
 * Returns leads saved via incremental saving during enrichment
 */
export async function GET() {
  try {
    const leads = loadAllEnrichedLeads();
    
    return NextResponse.json({
      success: true,
      leads,
      totalLeads: leads.length,
    });
  } catch (error) {
    console.error('Error loading enriched leads:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        leads: [],
        totalLeads: 0,
      },
      { status: 500 }
    );
  }
}
