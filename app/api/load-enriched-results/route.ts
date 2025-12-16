import { NextRequest, NextResponse } from 'next/server';
import { getDataFilePath, safeReadFile, ensureDataDirectory } from '@/utils/dataDirectory';

/**
 * API endpoint to load enriched results from saved files
 * Returns partial results if available, so UI can display data immediately
 */

export async function GET(request: NextRequest) {
  try {
    ensureDataDirectory();
    
    // Try to load final results first (check multiple possible files)
    const possibleFiles = [
      { filename: 'enriched-322-leads.json', source: 'final' },
      { filename: 'enriched-322-leads-partial.json', source: 'partial' },
      { filename: 're-enriched-leads.json', source: 're-enriched' },
      { filename: 'enriched-all-leads.json', source: 'all-leads' },
    ];
    
    let leads: any[] = [];
    let source = 'none';
    
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
    
    // Try each file in priority order
    for (const { filename, source: fileSource } of possibleFiles) {
      if (leads.length > 0) break; // Already found data
      
      const filePath = getDataFilePath(filename);
      const content = safeReadFile(filePath);
      
      if (content) {
        try {
          const data = JSON.parse(content);
          const candidateLeads = Array.isArray(data) ? data : (data.leads || []);
          if (hasData(candidateLeads)) {
            leads = candidateLeads;
            source = fileSource;
            break;
          }
        } catch (error) {
          console.error(`Error parsing ${filename}:`, error);
        }
      }
    }
    
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
