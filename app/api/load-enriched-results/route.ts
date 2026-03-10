import { NextRequest, NextResponse } from 'next/server';
import { getDataFilePath, safeReadFile, ensureDataDirectory } from '@/utils/dataDirectory';
import type { LeadSummary } from '@/utils/extractLeadSummary';

/**
 * API endpoint to load enriched results from saved files with server-side pagination, filtering, and sorting
 * Single source of truth: enriched-all-leads.json
 */

// State name to abbreviation mapping (shared with frontend)
const stateToAbbreviation: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC'
};

function getStateAbbreviation(state: string | undefined | null): string {
  if (!state || state === 'N/A') return 'N/A';
  
  const stateLower = state.toLowerCase().trim();
  
  // If already an abbreviation (2 letters), return as-is
  if (stateLower.length === 2 && /^[A-Z]{2}$/i.test(state)) {
    return state.toUpperCase();
  }
  
  // Try to find abbreviation
  const abbr = stateToAbbreviation[stateLower];
  if (abbr) return abbr;
  
  // If not found, return original
  return state;
}

type SortField = 'name' | 'city' | 'zipcode' | 'age' | 'income' | 'searchFilter' | 'platform' | 'none';
type SortDirection = 'asc' | 'desc';

export async function GET(request: NextRequest) {
  try {
    ensureDataDirectory();
    
    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(1000, parseInt(searchParams.get('limit') || '50', 10))); // Max 1000 per page
    const sortField = (searchParams.get('sortField') || 'none') as SortField;
    const sortDirection = (searchParams.get('sortDirection') || 'asc') as SortDirection;
    const searchQuery = searchParams.get('searchQuery') || '';
    const ageMin = searchParams.get('ageMin');
    const ageMax = searchParams.get('ageMax');
    const mobileOnly = searchParams.get('mobileOnly') === 'true';
    const filterDNC = searchParams.get('filterDNC') === 'true';
    const selectedState = searchParams.get('selectedState') || '';
    const selectedDate = searchParams.get('selectedDate') || '';
    const filterWarn = searchParams.get('filterWarn') === 'true';
    const exportAll = searchParams.get('export') === 'true'; // For CSV export - return all filtered results
    
    // Single source of truth: enriched-all-leads.json
    let leads: LeadSummary[] = [];
    let source = 'none';
    
    // Validation function: lead must have name AND phone (email-only leads are excluded)
    const isValidLead = (lead: any): boolean => {
      const name = (lead.name || '').trim();
      const phone = (lead.phone || '').trim().replace(/\D/g, ''); // Remove non-digits for validation
      // Require phone number (10+ digits) - leads with only email are excluded
      return name.length > 0 && phone.length >= 10;
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
    
    // Filter leads to only valid ones first
    let validLeads = leads.filter(isValidLead);
    
    // Calculate stats on unfiltered valid leads (for UI display)
    const stats = {
      total: validLeads.length,
      withPhone: validLeads.filter((l: any) => l.phone && l.phone.trim().length >= 10).length,
      withAge: validLeads.filter((l: any) => l.dobOrAge && l.dobOrAge.trim().length > 0).length,
      withState: validLeads.filter((l: any) => l.state && l.state.trim().length > 0).length,
      withZip: validLeads.filter((l: any) => l.zipcode && l.zipcode.trim().length > 0).length,
      complete: validLeads.filter((l: any) => {
        const hasPhone = l.phone && l.phone.trim().length >= 10;
        const hasAge = l.dobOrAge && l.dobOrAge.trim().length > 0;
        const hasState = l.state && l.state.trim().length > 0;
        const hasZip = l.zipcode && l.zipcode.trim().length > 0;
        return hasPhone && hasAge && hasState && hasZip;
      }).length,
    };
    
    // Apply filters
    let filteredLeads = validLeads;
    
    // Search filter (by name)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filteredLeads = filteredLeads.filter((lead) => {
        const name = (lead.name || '').toLowerCase();
        return name.includes(query);
      });
    }
    
    // Age range filter
    if (ageMin !== null || ageMax !== null) {
      filteredLeads = filteredLeads.filter((lead) => {
        if (!lead.dobOrAge) return false;
        const age = parseInt(lead.dobOrAge);
        if (isNaN(age)) return false;
        
        const min = ageMin !== null ? Number(ageMin) : 0;
        const max = ageMax !== null ? Number(ageMax) : 999;
        
        return age >= min && age <= max;
      });
    }
    
    // Mobile only filter
    if (mobileOnly) {
      filteredLeads = filteredLeads.filter((lead) => {
        return lead.lineType === 'mobile';
      });
    }
    
    // DNC filter (exclude DNC leads)
    if (filterDNC) {
      filteredLeads = filteredLeads.filter((lead) => {
        return lead.dncStatus !== 'YES';
      });
    }
    
    // State filter
    if (selectedState) {
      filteredLeads = filteredLeads.filter((lead) => {
        if (!lead.state) return false;
        const leadStateAbbr = getStateAbbreviation(lead.state);
        return leadStateAbbr === selectedState;
      });
    }
    
    // Date filter
    if (selectedDate) {
      filteredLeads = filteredLeads.filter((lead) => {
        if (!lead.dateScraped) return false;
        const leadDate = lead.dateScraped.split('T')[0]; // Get date part only
        return leadDate === selectedDate;
      });
    }

    // WARN leads only filter
    if (filterWarn) {
      filteredLeads = filteredLeads.filter((lead) => {
        if (lead.isWarnLead === true) return true;
        if (lead.warnCompany && String(lead.warnCompany).trim().length > 0) return true;
        return false;
      });
    }
    
    // Apply sorting
    let sortedLeads = filteredLeads;
    if (sortField !== 'none') {
      sortedLeads = [...filteredLeads].sort((a, b) => {
        let aValue: string | number = '';
        let bValue: string | number = '';
        
        switch (sortField) {
          case 'name':
            aValue = (a.name || '').toLowerCase();
            bValue = (b.name || '').toLowerCase();
            break;
          case 'city':
            aValue = (a.city || '').toLowerCase();
            bValue = (b.city || '').toLowerCase();
            break;
          case 'zipcode':
            aValue = (a.zipcode || '').toLowerCase();
            bValue = (b.zipcode || '').toLowerCase();
            break;
          case 'age':
            const aAge = parseInt(a.dobOrAge) || 0;
            const bAge = parseInt(b.dobOrAge) || 0;
            aValue = aAge;
            bValue = bAge;
            break;
          case 'income':
            aValue = a.income || 0;
            bValue = b.income || 0;
            break;
          case 'searchFilter':
            aValue = (a.searchFilter || '').toLowerCase();
            bValue = (b.searchFilter || '').toLowerCase();
            break;
          case 'platform':
            aValue = (a.platform || '').toLowerCase();
            bValue = (b.platform || '').toLowerCase();
            break;
        }
        
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          const comparison = aValue.localeCompare(bValue);
          return sortDirection === 'asc' ? comparison : -comparison;
        } else {
          const comparison = (aValue as number) - (bValue as number);
          return sortDirection === 'asc' ? comparison : -comparison;
        }
      });
    }
    
    // Pagination
    const totalFiltered = sortedLeads.length;
    const totalPages = Math.ceil(totalFiltered / limit);
    
    let paginatedLeads: LeadSummary[];
    if (exportAll) {
      // For CSV export, return all filtered results
      paginatedLeads = sortedLeads;
    } else {
      // Normal pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      paginatedLeads = sortedLeads.slice(startIndex, endIndex);
    }
    
    return NextResponse.json({
      success: true,
      leads: paginatedLeads,
      pagination: {
        page: exportAll ? 1 : page,
        limit: exportAll ? totalFiltered : limit,
        total: totalFiltered,
        totalPages: exportAll ? 1 : totalPages,
      },
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
        pagination: {
          page: 1,
          limit: 50,
          total: 0,
          totalPages: 0,
        },
        stats: {
          total: 0,
          withPhone: 0,
          withAge: 0,
          withState: 0,
          withZip: 0,
          complete: 0,
        },
      },
      { status: 500 }
    );
  }
}
