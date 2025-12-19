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
      // Load existing leads from enriched-all-leads.json
      const existingContent = safeReadFile(existingPath);
      if (existingContent) {
        try {
          const existingData = JSON.parse(existingContent);
          // Handle both array format and metadata wrapper format for backward compatibility
          existingLeads = Array.isArray(existingData) ? existingData : (existingData.leads || []);
          
          // Validate data structure
          if (!Array.isArray(existingLeads)) {
            console.warn('⚠️ [AGGREGATE] Existing data is not an array, resetting to empty array');
            existingLeads = [];
          }
        } catch (error) {
          console.error('❌ [AGGREGATE] Error parsing existing enriched-all-leads.json:', error);
          // Continue with empty array
          existingLeads = [];
        }
      }
    
      // Validation function: lead must have name AND phone (email-only leads are excluded)
      const isValidLead = (lead: LeadSummary): boolean => {
        const name = (lead.name || '').trim();
        const phone = (lead.phone || '').trim().replace(/\D/g, ''); // Remove non-digits for validation
        // Require phone number (10+ digits) - leads with only email are excluded
        return name.length > 0 && phone.length >= 10;
      };
      
      // Filter existing leads to only valid ones
      existingLeads = existingLeads.filter(isValidLead);
      
      // Create a deduplication map using LinkedIn URL or name+email+phone as key
      const seenKeys = new Set<string>();
      aggregatedLeads = [];
      
      // Helper to generate deduplication key
      const getLeadKey = (lead: LeadSummary): string => {
        if (lead.linkedinUrl) {
          return `linkedin:${lead.linkedinUrl}`;
        }
        const name = (lead.name || '').trim();
        const email = (lead.email || '').trim();
        const phone = (lead.phone || '').trim();
        if (name && (email || phone)) {
          return `name:${name}:${email || phone}`;
        }
        return `name:${name || 'unknown'}`;
      };
      
      // Add existing leads first
      for (const lead of existingLeads) {
        const key = getLeadKey(lead);
        if (!seenKeys.has(key) && key !== 'name:unknown') {
          seenKeys.add(key);
          aggregatedLeads.push(lead);
        }
      }
      
      // Filter new leads before processing
      validNewLeads = newLeads.filter(isValidLead);
      
      // Helper function to merge leads intelligently, preserving DNC status
      const mergeLeads = (existing: LeadSummary, incoming: LeadSummary): LeadSummary => {
        // Start with existing lead as base
        const merged = { ...existing };
        
        // Preserve DNC-related fields from existing lead if they're valid
        // Only overwrite if incoming lead has valid DNC data
        const existingHasValidDNC = existing.dncStatus && 
                                    existing.dncStatus !== 'UNKNOWN' && 
                                    existing.dncLastChecked;
        const incomingHasValidDNC = incoming.dncStatus && 
                                    incoming.dncStatus !== 'UNKNOWN' && 
                                    incoming.dncLastChecked;
        
        if (existingHasValidDNC && !incomingHasValidDNC) {
          // Preserve existing DNC data
          merged.dncStatus = existing.dncStatus;
          merged.dncReason = existing.dncReason;
          merged.canContact = existing.canContact;
          merged.dncLastChecked = existing.dncLastChecked;
        } else if (incomingHasValidDNC) {
          // Use incoming DNC data (newer or more complete)
          merged.dncStatus = incoming.dncStatus;
          merged.dncReason = incoming.dncReason;
          merged.canContact = incoming.canContact;
          merged.dncLastChecked = incoming.dncLastChecked;
        }
        
        // For all other fields, prefer incoming lead data (newer data wins)
        // But don't overwrite with empty/undefined values
        Object.keys(incoming).forEach(key => {
          const value = incoming[key as keyof LeadSummary];
          // Only update if value is not empty/undefined
          if (value !== undefined && value !== null && value !== '') {
            // Skip DNC fields if we already handled them above
            if (key !== 'dncStatus' && key !== 'dncReason' && key !== 'canContact' && key !== 'dncLastChecked') {
              (merged as any)[key] = value;
            }
          }
        });
        
        return merged;
      };
      
      // Add new leads (will merge with duplicates, preserving DNC status)
      for (const lead of validNewLeads) {
        const key = getLeadKey(lead);
        if (key === 'name:unknown') continue; // Skip invalid leads
        
        const existingIndex = aggregatedLeads.findIndex(l => getLeadKey(l) === key);
        if (existingIndex >= 0) {
          // Merge existing lead with new data, preserving DNC status
          aggregatedLeads[existingIndex] = mergeLeads(aggregatedLeads[existingIndex], lead);
        } else {
          // Add new lead
          aggregatedLeads.push(lead);
          seenKeys.add(key);
        }
      }
      
      // Save aggregated leads with consistent data structure: array of leads
      safeWriteFile(existingPath, JSON.stringify(aggregatedLeads, null, 2));
    });
    
    console.log(`✅ [AGGREGATE] Saved ${aggregatedLeads.length} leads to enriched-all-leads.json (${validNewLeads.length} new, ${newLeads.length - validNewLeads.length} invalid filtered)`);
    
    return NextResponse.json({
      success: true,
      totalLeads: aggregatedLeads.length,
      newLeadsAdded: validNewLeads.length,
      message: `Successfully aggregated ${aggregatedLeads.length} leads`,
    });
  } catch (error) {
    console.error('Error aggregating enriched leads:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
