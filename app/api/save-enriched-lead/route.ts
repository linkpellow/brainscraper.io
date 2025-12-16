import { NextRequest, NextResponse } from 'next/server';
import { saveEnrichedLeadImmediate } from '@/utils/incrementalSave';
import type { EnrichedRow } from '@/utils/enrichData';
import type { LeadSummary } from '@/utils/extractLeadSummary';

/**
 * API endpoint to save an enriched lead immediately
 * Called from client-side code when enrichment happens in browser
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { enrichedRow, leadSummary } = body as {
      enrichedRow: EnrichedRow;
      leadSummary: LeadSummary;
    };

    if (!enrichedRow || !leadSummary) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing enrichedRow or leadSummary',
        },
        { status: 400 }
      );
    }

    // Save on server (this will work since we're in an API route)
    saveEnrichedLeadImmediate(enrichedRow, leadSummary);

    return NextResponse.json({
      success: true,
      message: 'Lead saved successfully',
    });
  } catch (error) {
    console.error('Error saving enriched lead:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
