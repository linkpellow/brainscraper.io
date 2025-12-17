import { NextRequest, NextResponse } from 'next/server';
import { getDataFilePath, safeReadFile, ensureDataDirectory } from '@/utils/dataDirectory';

/**
 * API endpoint to load enriched results from saved files
 * Single source of truth: enriched-all-leads.json
 */

export async function GET(request: NextRequest) {
  try {
    ensureDataDirectory();
    
    // Single source of truth: enriched-all-leads.json
    let leads: any[] = [];
    let source = 'none';
    
    // Validation function: lead must have name AND (phone OR email)
    const isValidLead = (lead: any): boolean => {
      const name = (lead.name || '').trim();
      const phone = (lead.phone || '').trim();
      const email = (lead.email || '').trim();
      return name.length > 0 && (phone.length > 0 || email.length > 0);
    };
    
    // Helper function to check if leads have actual data (not all empty)
    const hasData = (leadsArray: any[]): boolean => {
      if (leadsArray.length === 0) return false;
      // Check if at least one lead has non-empty name, phone, or email
      return leadsArray.some((lead: any) => 
        (lead.name && lead.name.trim()) || 
        (lead.phone && lead.phone.trim()) || 
        (lead.email && lead.email.trim())
      );
    };
    
    // Load from single source of truth: enriched-all-leads.json
    const filePath = getDataFilePath('enriched-all-leads.json');
    const content = safeReadFile(filePath);
    
    if (content) {
      try {
        const data = JSON.parse(content);
        
        // Handle both array format (current) and metadata wrapper format (backward compatibility)
        let candidateLeads: any[] = [];
        if (Array.isArray(data)) {
          candidateLeads = data;
        } else if (data && typeof data === 'object' && Array.isArray(data.leads)) {
          // Legacy format with metadata wrapper
          candidateLeads = data.leads;
          console.warn('⚠️ [LOAD] Detected legacy data format with metadata wrapper, migrating...');
        } else {
          console.error('❌ [LOAD] Invalid data structure in enriched-all-leads.json');
          throw new Error('Invalid data structure: expected array or object with leads array');
        }
        
        // Validate all items are objects
        if (!candidateLeads.every(item => typeof item === 'object' && item !== null)) {
          console.error('❌ [LOAD] Data contains non-object items');
          throw new Error('Invalid data: all items must be objects');
        }
        
        if (hasData(candidateLeads)) {
          leads = candidateLeads;
          source = 'enriched-all-leads.json';
        }
      } catch (error) {
        console.error(`❌ [LOAD] Error parsing enriched-all-leads.json:`, error);
        // Return empty leads instead of crashing
        leads = [];
        source = 'error';
      }
    }
    
    // Filter leads to only valid ones before returning
    leads = leads.filter(isValidLead);
    
    // Calculate stats
    const stats = {
      total: leads.length,
      withPhone: leads.filter((l: any) => l.phone && l.phone.trim().length >= 10).length,
      withAge: leads.filter((l: any) => l.dobOrAge && l.dobOrAge.trim().length > 0).length,
      withState: leads.filter((l: any) => l.state && l.state.trim().length > 0).length,
      withZip: leads.filter((l: any) => l.zipcode && l.zipcode.trim().length > 0).length,
      complete: leads.filter((l: any) => {
        const hasPhone = l.phone && l.phone.trim().length >= 10;
        const hasAge = l.dobOrAge && l.dobOrAge.trim().length > 0;
        const hasState = l.state && l.state.trim().length > 0;
        const hasZip = l.zipcode && l.zipcode.trim().length > 0;
        return hasPhone && hasAge && hasState && hasZip;
      }).length,
    };
    
    return NextResponse.json({
      success: true,
      leads,
      source,
      stats,
      message: source === 'partial' ? 'Partial results loaded - enrichment may still be in progress' : 'Final results loaded',
    });
  } catch (error) {
    console.error('Error loading enriched results:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        leads: [],
      },
      { status: 500 }
    );
  }
}
