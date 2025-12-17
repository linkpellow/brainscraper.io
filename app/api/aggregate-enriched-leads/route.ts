import { NextRequest, NextResponse } from 'next/server';
import { getDataFilePath, safeReadFile, safeWriteFile, ensureDataDirectory } from '@/utils/dataDirectory';
import type { LeadSummary } from '@/utils/extractLeadSummary';

/**
 * API endpoint to aggregate enriched leads and save to enriched-all-leads.json
 * Merges new leads with existing leads, deduplicates, and saves
 */
export async function POST(request: NextRequest) {
  try {
    ensureDataDirectory();
    
    const body = await request.json();
    const { newLeads } = body as { newLeads: LeadSummary[] };
    
    if (!Array.isArray(newLeads)) {
      return NextResponse.json(
        { success: false, error: 'newLeads must be an array' },
        { status: 400 }
      );
    }
    
    // Load existing leads from enriched-all-leads.json
    const existingPath = getDataFilePath('enriched-all-leads.json');
    let existingLeads: LeadSummary[] = [];
    
    const existingContent = safeReadFile(existingPath);
    if (existingContent) {
      try {
        const existingData = JSON.parse(existingContent);
        existingLeads = Array.isArray(existingData) ? existingData : (existingData.leads || []);
      } catch (error) {
        console.error('Error parsing existing enriched-all-leads.json:', error);
        // Continue with empty array
      }
    }
    
    // Validation function: lead must have name AND (phone OR email)
    const isValidLead = (lead: LeadSummary): boolean => {
      const name = (lead.name || '').trim();
      const phone = (lead.phone || '').trim();
      const email = (lead.email || '').trim();
      return name.length > 0 && (phone.length > 0 || email.length > 0);
    };
    
    // Filter existing leads to only valid ones
    existingLeads = existingLeads.filter(isValidLead);
    
    // Create a deduplication map using LinkedIn URL or name+email+phone as key
    const seenKeys = new Set<string>();
    const aggregatedLeads: LeadSummary[] = [];
    
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
    const validNewLeads = newLeads.filter(isValidLead);
    
    // Add new leads (will overwrite duplicates)
    for (const lead of validNewLeads) {
      const key = getLeadKey(lead);
      if (key === 'name:unknown') continue; // Skip invalid leads
      
      const existingIndex = aggregatedLeads.findIndex(l => getLeadKey(l) === key);
      if (existingIndex >= 0) {
        // Update existing lead with new data
        aggregatedLeads[existingIndex] = lead;
      } else {
        // Add new lead
        aggregatedLeads.push(lead);
        seenKeys.add(key);
      }
    }
    
    // Save aggregated leads
    const outputData = {
      metadata: {
        lastUpdated: new Date().toISOString(),
        totalLeads: aggregatedLeads.length,
        newLeadsAdded: validNewLeads.length,
        existingLeadsCount: existingLeads.length,
      },
      leads: aggregatedLeads,
    };
    
    safeWriteFile(existingPath, JSON.stringify(outputData, null, 2));
    
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
