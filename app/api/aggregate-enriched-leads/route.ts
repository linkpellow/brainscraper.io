import { NextRequest, NextResponse } from 'next/server';
import type { LeadSummary } from '@/utils/extractLeadSummary';
import type { EnrichedRow } from '@/utils/enrichData';

/**
 * API endpoint to aggregate enriched leads and save to enriched-all-leads.json
 * 
 * CRITICAL: This route now uses leadDataManager for all operations
 * Ensures idempotency, verification, and data integrity
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { newLeads } = body as { newLeads: LeadSummary[] };
    
    if (!Array.isArray(newLeads)) {
      return NextResponse.json(
        { success: false, error: 'newLeads must be an array' },
        { status: 400 }
      );
    }
    
    // Convert LeadSummary[] to EnrichedRow[] format for DataManager
    // The DataManager will extract LeadSummary from EnrichedRow
    const enrichedRows: EnrichedRow[] = newLeads.map((lead) => ({
      'Name': lead.name,
      'Phone': lead.phone,
      'Email': lead.email,
      'Zipcode': lead.zipcode,
      'State': lead.state,
      'City': lead.city,
      'DOB': lead.dobOrAge,
      'LinkedIn URL': lead.linkedinUrl || '',
      'Income': lead.income || '',
      'Line Type': lead.lineType || '',
      'Carrier': lead.carrier || '',
      'DNC Status': lead.dncStatus || 'UNKNOWN',
      'DNC Last Checked': lead.dncLastChecked || '',
      _enriched: {
        phone: lead.phone,
        email: lead.email,
        zipCode: lead.zipcode,
        dncStatus: lead.dncStatus,
        dncLastChecked: lead.dncLastChecked,
        lineType: lead.lineType,
        carrierName: lead.carrier,
      },
    }));
    
    // Use DataManager for aggregation (ensures verification and idempotency)
    const { aggregateLeadsWithVerification } = await import('@/utils/leadDataManager');
    const jobId = `api-aggregate-${Date.now()}`;
    const result = await aggregateLeadsWithVerification(enrichedRows, jobId);
    
    if (!result.success || !result.verified) {
      const errorMsg = result.error || 'Aggregation failed verification';
      console.error(`[AGGREGATE_API] ❌ Aggregation failed: ${errorMsg}`);
      return NextResponse.json(
        {
          success: false,
          error: errorMsg,
        },
        { status: 500 }
      );
    }
    
    console.log(`✅ [AGGREGATE_API] Aggregated ${result.newLeadsAdded} new leads (total: ${result.totalLeads}) - Verified: ${result.verified}`);
    
    return NextResponse.json({
      success: true,
      totalLeads: result.totalLeads,
      newLeadsAdded: result.newLeadsAdded,
      verified: result.verified,
      message: `Successfully aggregated ${result.totalLeads} leads`,
    });
  } catch (error) {
    console.error('[AGGREGATE_API] Error aggregating enriched leads:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
