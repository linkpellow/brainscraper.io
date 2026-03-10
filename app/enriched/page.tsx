'use client';

import { useState, useEffect, useRef } from 'react';
import { Download, ArrowUpDown, ArrowUp, ArrowDown, Loader2, Zap, X, CheckCircle2, AlertCircle, Search, Copy, Check, Smartphone, Phone, Sparkles, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import Link from 'next/link';
import { LeadSummary, leadSummariesToCSV, formatPhoneNumber } from '@/utils/extractLeadSummary';
import AppLayout from '../components/AppLayout';
import DatePickerModal from '../components/DatePickerModal';

// State name to abbreviation mapping
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

// All 50 US state abbreviations (alphabetically sorted)
const allStateAbbreviations = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

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
  
  // If not found, return original (might be a non-US state or invalid)
  return state;
}

type SortField = 'name' | 'city' | 'zipcode' | 'age' | 'income' | 'searchFilter' | 'platform' | 'none';
type SortDirection = 'asc' | 'desc';

type EnrichmentLog = {
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
};

export default function EnrichedLeadsPage() {
  // Server-side pagination state
  const [paginatedLeads, setPaginatedLeads] = useState<LeadSummary[]>([]);
  const [totalLeads, setTotalLeads] = useState<number>(0); // Total filtered leads
  const [totalUnfilteredLeads, setTotalUnfilteredLeads] = useState<number>(0); // Total unfiltered leads (for stats)
  const [paginationMeta, setPaginationMeta] = useState<{
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  
  const [sortField, setSortField] = useState<SortField>('none');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [ageMin, setAgeMin] = useState<number | ''>('');
  const [ageMax, setAgeMax] = useState<number | ''>(64);
  const [mobileOnly, setMobileOnly] = useState<boolean>(false);
  const [filterDNC, setFilterDNC] = useState<boolean>(false);
  const [filterWarn, setFilterWarn] = useState<boolean>(false);
  const [selectedState, setSelectedState] = useState<string>(''); // State filter: empty = all states
  const [selectedDate, setSelectedDate] = useState<string>(''); // Date filter: empty = all dates
  const [showDatePicker, setShowDatePicker] = useState(false); // Calendar modal visibility
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState(0);
  const [enrichmentLogs, setEnrichmentLogs] = useState<EnrichmentLog[]>([]);
  const [enrichmentStats, setEnrichmentStats] = useState<{
    totalLeads: number;
    processed: number;
    withPhone: number;
    withEmail: number;
    withZipcode: number;
    errors: number;
  } | null>(null);
  const [currentLead, setCurrentLead] = useState<{
    name: string;
    step: string;
    details: any;
  } | null>(null);
  const [autoReenrichStarted, setAutoReenrichStarted] = useState(false);
  const [enrichingFields, setEnrichingFields] = useState<Set<string>>(new Set());
  const [enrichmentErrors, setEnrichmentErrors] = useState<Map<string, string>>(new Map());
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const fetchAbortControllerRef = useRef<AbortController | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const addLog = (message: string, type: EnrichmentLog['type'] = 'info') => {
    setEnrichmentLogs(prev => [...prev, { timestamp: new Date(), message, type }]);
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  // Fetch paginated leads from API
  const fetchPaginatedLeads = async (abortSignal?: AbortSignal) => {
    setIsLoadingPage(true);
    
    try {
      // Build query parameters
      const params = new URLSearchParams();
      params.set('page', currentPage.toString());
      params.set('limit', rowsPerPage.toString());
      if (sortField !== 'none') {
        params.set('sortField', sortField);
        params.set('sortDirection', sortDirection);
      }
      if (searchQuery.trim()) {
        params.set('searchQuery', searchQuery.trim());
      }
      if (ageMin !== '') {
        params.set('ageMin', ageMin.toString());
      }
      if (ageMax !== '') {
        params.set('ageMax', ageMax.toString());
      }
      if (mobileOnly) {
        params.set('mobileOnly', 'true');
      }
      if (filterDNC) {
        params.set('filterDNC', 'true');
      }
      if (filterWarn) {
        params.set('filterWarn', 'true');
      }
      if (selectedState) {
        params.set('selectedState', selectedState);
      }
      if (selectedDate) {
        params.set('selectedDate', selectedDate);
      }
      
      const response = await fetch(`/api/load-enriched-results?${params.toString()}&t=${Date.now()}`, {
        signal: abortSignal,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        // Add today's date to leads that don't have dateScraped
        const today = new Date().toISOString().split('T')[0];
        const leadsWithDate = result.leads.map((lead: LeadSummary) => ({
          ...lead,
          dateScraped: lead.dateScraped || today,
          dncStatus: lead.dncStatus || 'UNKNOWN',
        }));
        
        setPaginatedLeads(leadsWithDate);
        setTotalLeads(result.pagination.total);
        setTotalUnfilteredLeads(result.stats.total);
        setPaginationMeta(result.pagination);
        setLoading(false);
      } else {
        throw new Error(result.error || 'Failed to load leads');
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[ENRICHED_PAGE] Request aborted');
        return;
      }
      console.error('Failed to fetch paginated leads:', error);
      setPaginatedLeads([]);
      setTotalLeads(0);
      setTotalUnfilteredLeads(0);
      setPaginationMeta({ page: 1, limit: rowsPerPage, total: 0, totalPages: 0 });
      setLoading(false);
    } finally {
      setIsLoadingPage(false);
    }
  };


  // Initial load on mount
  useEffect(() => {
    setShowProgressModal(false);
    setLoadingSaved(false);
    setEnrichmentProgress(0);
    setEnrichmentLogs([]);
    
    // Cancel any in-flight request
    if (fetchAbortControllerRef.current) {
      fetchAbortControllerRef.current.abort();
    }
    fetchAbortControllerRef.current = new AbortController();
    fetchPaginatedLeads(fetchAbortControllerRef.current.signal);
    
    return () => {
      if (fetchAbortControllerRef.current) {
        fetchAbortControllerRef.current.abort();
      }
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []); // Only run on mount

  // Fetch when page, rowsPerPage, sort changes (immediate)
  useEffect(() => {
    // Cancel any in-flight request
    if (fetchAbortControllerRef.current) {
      fetchAbortControllerRef.current.abort();
    }
    fetchAbortControllerRef.current = new AbortController();
    fetchPaginatedLeads(fetchAbortControllerRef.current.signal);
  }, [currentPage, rowsPerPage, sortField, sortDirection]); // Immediate for page/sort changes

  // Debounced fetch for filter changes (resets to page 1)
  useEffect(() => {
    // Reset to page 1 when filters change
    if (currentPage !== 1) {
      setCurrentPage(1);
      return; // Will trigger page change effect
    }
    
    // Debounce the fetch
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      // Cancel any in-flight request
      if (fetchAbortControllerRef.current) {
        fetchAbortControllerRef.current.abort();
      }
      fetchAbortControllerRef.current = new AbortController();
      fetchPaginatedLeads(fetchAbortControllerRef.current.signal);
    }, 300); // 300ms debounce
    
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [searchQuery, ageMin, ageMax, mobileOnly, filterDNC, filterWarn, selectedState, selectedDate, currentPage]);

  // DISABLED: Auto re-enrichment - removed to prevent automatic API calls
  // Enrichment should only happen when user explicitly clicks "Enrich" or "Re-enrich Existing Leads"
  // useEffect(() => {
  //   ... auto-enrichment code removed ...
  // }, [loading, leads, autoReenrichStarted]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleExportCSV = async () => {
    try {
      // Fetch all filtered results (without pagination) for export
      const params = new URLSearchParams();
      params.set('export', 'true'); // Special flag to get all filtered results
      params.set('limit', '10000'); // Large limit to get all results
      if (sortField !== 'none') {
        params.set('sortField', sortField);
        params.set('sortDirection', sortDirection);
      }
      if (searchQuery.trim()) {
        params.set('searchQuery', searchQuery.trim());
      }
      if (ageMin !== '') {
        params.set('ageMin', ageMin.toString());
      }
      if (ageMax !== '') {
        params.set('ageMax', ageMax.toString());
      }
      if (mobileOnly) {
        params.set('mobileOnly', 'true');
      }
      if (filterDNC) {
        params.set('filterDNC', 'true');
      }
      if (filterWarn) {
        params.set('filterWarn', 'true');
      }
      if (selectedState) {
        params.set('selectedState', selectedState);
      }
      if (selectedDate) {
        params.set('selectedDate', selectedDate);
      }
      
      const response = await fetch(`/api/load-enriched-results?${params.toString()}&t=${Date.now()}`);
      if (!response.ok) {
        throw new Error(`Export failed: ${response.status}`);
      }
      
      const result = await response.json();
      if (result.success && Array.isArray(result.leads)) {
        const csv = leadSummariesToCSV(result.leads);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `enriched_leads_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        throw new Error('No leads to export');
      }
    } catch (error) {
      console.error('Failed to export CSV:', error);
      alert('Failed to export CSV. Please try again.');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4 text-slate-400" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-4 h-4 text-white" />
    ) : (
      <ArrowDown className="w-4 h-4 text-white" />
    );
  };

  const copyToClipboard = async (text: string, fieldId: string) => {
    if (!text || text === 'N/A') return;
    
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return 'N/A';
    
    try {
      // Try parsing ISO date string (YYYY-MM-DD)
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        // If invalid, try to format as-is if it's already in a readable format
        return dateString;
      }
      
      // Format as MM/DD/YYYY
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const year = date.getFullYear();
      
      return `${month}/${day}/${year}`;
    } catch {
      return dateString;
    }
  };

  /**
   * Check if a field can be enriched
   */
  const canEnrichField = (lead: LeadSummary, field: 'phone' | 'email' | 'zipcode' | 'income'): boolean => {
    // Field must be empty
    const fieldValue = field === 'phone' ? lead.phone : field === 'email' ? lead.email : field === 'zipcode' ? lead.zipcode : lead.income;
    
    // Check if field already has a value
    if (field === 'income') {
      // Income is a number - check if it exists and is > 0
      if (typeof fieldValue === 'number' && fieldValue > 0) {
        return false; // Income already has a value
      }
    } else {
      // Other fields are strings - check if they exist and are not empty
      if (fieldValue && typeof fieldValue === 'string' && fieldValue !== 'N/A' && fieldValue.trim() !== '') {
        return false;
      }
    }

    // Income enrichment needs city+state OR zipcode
    if (field === 'income') {
      return !!((lead.city && lead.state) || lead.zipcode);
    }

    // Zipcode enrichment only needs city + state (free, local lookup)
    if (field === 'zipcode') {
      return !!(lead.city && lead.state);
    }

    // Phone/email enrichment requirements
    // Must have name (first + last)
    if (!lead.name || lead.name.trim() === '') {
      return false;
    }
    const nameParts = lead.name.trim().split(/\s+/);
    if (nameParts.length < 2) {
      return false;
    }

    // Must have either:
    // 1. Domain (extracted from email if available)
    // 2. City/State (for skip-tracing)
    const hasDomain = !!(lead.email && lead.email.includes('@'));
    const hasLocation = !!((lead.city && lead.state) || lead.state);

    return hasDomain || hasLocation;
  };

  /**
   * Handle single field enrichment
   */
  const handleEnrichField = async (lead: LeadSummary, field: 'phone' | 'email' | 'zipcode' | 'income', index: number) => {
    const fieldKey = `${field}-${index}`;
    
    // Check if already enriching
    if (enrichingFields.has(fieldKey)) {
      return;
    }

    // Check if enrichment is possible
    if (!canEnrichField(lead, field)) {
      return;
    }

    setEnrichingFields(prev => new Set(prev).add(fieldKey));
    
    // Clear any previous error for this field
    setEnrichmentErrors(prev => {
      const next = new Map(prev);
      next.delete(fieldKey);
      return next;
    });

    try {
      const response = await fetch('/api/enrich-single-field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            lead: {
              name: lead.name,
              phone: lead.phone,
              email: lead.email,
              city: lead.city,
              state: lead.state,
              zipcode: lead.zipcode,
              linkedinUrl: lead.linkedinUrl,
            },
          field,
        }),
      });

      const result = await response.json();

      if (result.success && result.value) {
        // Update the lead in state
        // Handle income separately to ensure proper type and React re-render
        const updatedLead: LeadSummary = {
          ...lead,
          ...(field === 'income' 
            ? { income: typeof result.value === 'number' ? result.value : lead.income }
            : { [field]: result.value }
          ),
          // Also update bonus field if provided
          ...(result.bonus && field === 'phone' ? { email: result.bonus } : {}),
          ...(result.bonus && field === 'email' ? { phone: result.bonus } : {}),
        };

        // Debug logging for income updates
        if (field === 'income') {
          console.log(`[ENRICH_FIELD] Income updated for "${lead.name}":`, {
            oldIncome: lead.income,
            newIncome: updatedLead.income,
            resultValue: result.value,
            resultValueType: typeof result.value,
          });
        }

        // Save updated lead to server and refetch current page
        try {
          const saveResponse = await fetch('/api/aggregate-enriched-leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newLeads: [updatedLead] }),
          });

          const saveResult = await saveResponse.json();
          if (saveResult.success) {
            if (fetchAbortControllerRef.current) {
              fetchAbortControllerRef.current.abort();
            }
            fetchAbortControllerRef.current = new AbortController();
            fetchPaginatedLeads(fetchAbortControllerRef.current.signal);
          }
        } catch (error) {
          console.error('Failed to save enriched field:', error);
        }

        // Save to disk via API
        try {
          // Convert LeadSummary to EnrichedRow format for saving
          const enrichedRow: Record<string, string | number> = {
            'Name': updatedLead.name,
            'Phone': updatedLead.phone || '',
            'Email': updatedLead.email || '',
            'City': updatedLead.city || '',
            'State': updatedLead.state || '',
            'Zipcode': updatedLead.zipcode || '',
            'DOB': updatedLead.dobOrAge || '',
            'LinkedIn URL': updatedLead.linkedinUrl || '',
            // Preserve other fields if they exist
            ...(updatedLead.lineType ? { 'Line Type': updatedLead.lineType } : {}),
            ...(updatedLead.carrier ? { 'Carrier': updatedLead.carrier } : {}),
            ...(updatedLead.income ? { 'Income': updatedLead.income } : {}),
          };

          // Save via save-enriched-lead endpoint
          await fetch('/api/save-enriched-lead', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              enrichedRow,
              leadSummary: updatedLead,
            }),
          });

          // Also save via aggregate endpoint to ensure it's in the main database
          await fetch('/api/aggregate-enriched-leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              newLeads: [updatedLead],
            }),
          });
        } catch (saveError) {
          console.error('Failed to save enriched lead to disk:', saveError);
          // Don't fail the enrichment if save fails
        }
      } else {
        console.error('Enrichment failed:', result.error);
        // Store error message for display
        setEnrichmentErrors(prev => {
          const next = new Map(prev);
          next.set(fieldKey, result.error || 'Enrichment failed');
          return next;
        });
      }
    } catch (error) {
      console.error('Error enriching field:', error);
    } finally {
      setEnrichingFields(prev => {
        const next = new Set(prev);
        next.delete(fieldKey);
        return next;
      });
    }
  };

  const CopyableCell = ({ value, fieldId, className = '', hoverColor = 'hover:bg-white/10', truncate = true }: { 
    value: string; 
    fieldId: string; 
    className?: string;
    hoverColor?: string;
    truncate?: boolean;
  }) => {
    const displayValue = value || 'N/A';
    const isCopied = copiedField === fieldId;
    const canCopy = value && value !== 'N/A';
    
    return (
      <td 
        className={`px-2 py-2 ${className} ${canCopy ? 'cursor-pointer transition-all duration-300 ease-out ' + hoverColor + ' hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/20' : ''} relative group`}
        onClick={() => canCopy && copyToClipboard(value, fieldId)}
        title={canCopy ? (value.length > 50 ? value : 'Click to copy') : ''}
      >
        <span className="flex items-center gap-1 relative z-10 min-w-0">
          <span className={`transition-all duration-300 group-hover:text-white ${truncate ? 'truncate block max-w-full' : ''}`}>{displayValue}</span>
          {canCopy && (
            <span className="opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-110 flex-shrink-0">
              {isCopied ? (
                <Check className="w-3 h-3 text-emerald-400 drop-shadow-lg" />
              ) : (
                <Copy className="w-3 h-3 text-white drop-shadow-lg" />
              )}
            </span>
          )}
        </span>
        {canCopy && (
          <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 rounded-lg transition-all duration-500 -z-0" />
        )}
      </td>
    );
  };

  /**
   * Enrichable income cell component
   */
  const EnrichableIncomeCell = ({ 
    value, 
    fieldId, 
    lead, 
    index,
    className = '' 
  }: { 
    value: number | undefined; 
    fieldId: string;
    lead: LeadSummary;
    index: number;
    className?: string;
  }) => {
    const displayValue = value ? `$${Math.round(value / 1000)}k` : 'N/A';
    const isEmpty = !value || value === 0;
    const canEnrich = canEnrichField(lead, 'income');
    const isEnriching = enrichingFields.has(`income-${index}`);
    const canCopy = value && value > 0;
    const isCopied = copiedField === fieldId;
    const errorMessage = enrichmentErrors.get(`income-${index}`);

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isEmpty && canEnrich && !isEnriching) {
        handleEnrichField(lead, 'income', index);
      } else if (canCopy) {
        copyToClipboard(displayValue, fieldId);
      }
    };

    return (
      <td 
        className={`px-2 py-2 ${className} ${canCopy || (isEmpty && canEnrich) ? 'cursor-pointer transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/20' : ''} relative group`}
        onClick={handleClick}
        title={
          isEnriching 
            ? 'Enriching...' 
            : isEmpty && canEnrich 
            ? 'Click to enrich' 
            : canCopy 
            ? 'Click to copy' 
            : ''
        }
      >
        <span className="flex items-center gap-1 relative z-10 min-w-0">
          {isEnriching ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-white" />
              <span className="text-xs text-white">Enriching...</span>
            </>
          ) : errorMessage ? (
            <>
              <AlertCircle className="w-3 h-3 text-gray-300 flex-shrink-0" />
              <span className="text-xs text-gray-300 truncate max-w-[200px]" title={errorMessage}>
                {errorMessage.length > 30 ? `${errorMessage.substring(0, 30)}...` : errorMessage}
              </span>
            </>
          ) : (
            <>
              <span className={`transition-all duration-300 ${canCopy ? 'group-hover:text-white' : isEmpty && canEnrich ? 'group-hover:text-white' : ''}`}>
                {isEmpty && canEnrich ? (
                  <span className="flex items-center gap-1">
                    <span>{displayValue}</span>
                    <span className="opacity-0 group-hover:opacity-100 transition-all duration-300 text-xs text-blue-400">enrich</span>
                  </span>
                ) : (
                  displayValue
                )}
              </span>
              {isEmpty && canEnrich && (
                <span className="opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-110 flex-shrink-0">
                  <Sparkles className="w-3 h-3 text-white drop-shadow-lg" />
                </span>
              )}
              {canCopy && (
                <span className="opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-110 flex-shrink-0">
                  {isCopied ? (
                    <Check className="w-3 h-3 text-emerald-400 drop-shadow-lg" />
                  ) : (
                    <Copy className="w-3 h-3 text-white drop-shadow-lg" />
                  )}
                </span>
              )}
            </>
          )}
        </span>
        {(canCopy || (isEmpty && canEnrich)) && (
          <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 rounded-lg transition-all duration-500 -z-0" />
        )}
      </td>
    );
  };

  /**
   * Enrichable cell component for phone, email, and zipcode fields
   */
  const EnrichableCell = ({ 
    value, 
    fieldId, 
    lead, 
    index,
    field,
    className = '', 
    truncate = true 
  }: { 
    value: string; 
    fieldId: string;
    lead: LeadSummary;
    index: number;
    field: 'phone' | 'email' | 'zipcode';
    className?: string;
    truncate?: boolean;
  }) => {
    const displayValue = value || 'N/A';
    const isEmpty = !value || value === 'N/A' || value.trim() === '';
    const canEnrich = canEnrichField(lead, field);
    const isEnriching = enrichingFields.has(`${field}-${index}`);
    const canCopy = value && value !== 'N/A';
    const isCopied = copiedField === fieldId;
    const errorMessage = enrichmentErrors.get(`${field}-${index}`);

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isEmpty && canEnrich && !isEnriching) {
        handleEnrichField(lead, field, index);
      } else if (canCopy) {
        copyToClipboard(value, fieldId);
      }
    };

    return (
      <td 
        className={`px-2 py-2 ${className} ${canCopy || (isEmpty && canEnrich) ? 'cursor-pointer transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/20' : ''} relative group`}
        onClick={handleClick}
        title={
          isEnriching 
            ? 'Enriching...' 
            : isEmpty && canEnrich 
            ? 'Click to enrich' 
            : canCopy 
            ? (value.length > 50 ? value : 'Click to copy') 
            : ''
        }
      >
        <span className="flex items-center gap-1 relative z-10 min-w-0">
          {isEnriching ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-white" />
              <span className="text-xs text-white">Enriching...</span>
            </>
          ) : errorMessage ? (
            <>
              <AlertCircle className="w-3 h-3 text-gray-300 flex-shrink-0" />
              <span className="text-xs text-gray-300 truncate max-w-[200px]" title={errorMessage}>
                {errorMessage.length > 30 ? `${errorMessage.substring(0, 30)}...` : errorMessage}
              </span>
            </>
          ) : (
            <>
              <span className={`transition-all duration-300 ${canCopy ? 'group-hover:text-white' : ''} ${truncate ? 'truncate block max-w-full' : ''}`}>
                {field === 'phone' ? formatPhoneNumber(displayValue) : displayValue}
              </span>
              {isEmpty && canEnrich && (
                <span className="opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-110 flex-shrink-0">
                  <Sparkles className="w-3 h-3 text-white drop-shadow-lg" />
                </span>
              )}
              {canCopy && (
                <span className="opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-110 flex-shrink-0">
                  {isCopied ? (
                    <Check className="w-3 h-3 text-emerald-400 drop-shadow-lg" />
                  ) : (
                    <Copy className="w-3 h-3 text-white drop-shadow-lg" />
                  )}
                </span>
              )}
            </>
          )}
        </span>
        {(canCopy || (isEmpty && canEnrich)) && (
          <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 rounded-lg transition-all duration-500 -z-0" />
        )}
      </td>
    );
  };

  const handleRestore = async () => {
    if (!confirm('This will replace all current leads with the restored data. Continue?')) {
      return;
    }

                setLoadingSaved(true);
                setShowProgressModal(true);
                setEnrichmentProgress(0);
                setEnrichmentLogs([]);
                setEnrichmentStats(null);
                setCurrentLead(null);
                
    addLog('🔄 Starting data restoration...', 'info');
                
                const startTime = Date.now();
                
                try {
      addLog('📤 Calling /api/restore-leads...', 'info');
      const response = await fetch('/api/restore-leads', {
        method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                  });
                  
                  if (!response.ok) {
                    const text = await response.text().catch(() => response.statusText);
                    throw new Error(`HTTP ${response.status}: ${text}`);
                  }

                  const result = await response.json();

      if (!result.success || !Array.isArray(result.leads)) {
        throw new Error(result.error || 'Restoration failed');
                  }

      const restoredLeads: LeadSummary[] = result.leads;
      
      // Add today's date to all leads that don't have dateScraped
      const today = new Date().toISOString().split('T')[0];
      const leadsWithDate = restoredLeads.map((lead: LeadSummary) => ({
        ...lead,
        dateScraped: lead.dateScraped || today
      }));

                  // Compute basic stats
      const withPhone = leadsWithDate.filter(
                    (l) => l.phone && l.phone !== 'EMPTY',
                  ).length;
      const withEmail = leadsWithDate.filter(
                    (l) => l.email && l.email !== 'EMPTY',
                  ).length;
      const withZipcode = leadsWithDate.filter(
                    (l) => l.zipcode && l.zipcode !== 'EMPTY',
                  ).length;
                            
                            setEnrichmentStats({
        totalLeads: restoredLeads.length,
        processed: restoredLeads.length,
                    withPhone,
                    withEmail,
                    withZipcode,
                              errors: 0,
                            });
                            
      try {
        const saveResponse = await fetch('/api/aggregate-enriched-leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newLeads: leadsWithDate }),
        });

        const saveResult = await saveResponse.json();
        if (saveResult.success) {
          if (fetchAbortControllerRef.current) {
            fetchAbortControllerRef.current.abort();
          }
          fetchAbortControllerRef.current = new AbortController();
          fetchPaginatedLeads(fetchAbortControllerRef.current.signal);
        }
      } catch (error) {
        console.error('Failed to save restored leads:', error);
      }
                            setCurrentLead(null);
                            
                            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      addLog(`✅ Restoration complete in ${elapsed}s!`, 'success');
      addLog(`📊 Restored ${leadsWithDate.length} leads`, 'success');
      addLog(`📞 Leads with phone: ${withPhone}`, 'info');
      addLog(`📧 Leads with email: ${withEmail}`, 'info');
      addLog(`📍 Leads with zipcode: ${withZipcode}`, 'info');
                            
                            setEnrichmentProgress(100);
                            setTimeout(() => {
                              setShowProgressModal(false);
                              setLoadingSaved(false);
                  }, 3000);
                } catch (error) {
      console.error('Error restoring leads:', error);
                  addLog(
                    `❌ Error: ${
                      error instanceof Error ? error.message : 'Unknown error'
                    }`,
                    'error',
                  );
                  setEnrichmentProgress(100);
                  setTimeout(() => {
                    setShowProgressModal(false);
                  setLoadingSaved(false);
                  }, 2000);
                }
  };

  const handleEnrich = async () => {
                    setLoadingSaved(true);
                  setShowProgressModal(true);
                  setEnrichmentProgress(0);
                  setEnrichmentLogs([]);
                  setEnrichmentStats(null);
                  setCurrentLead(null);
                  
                addLog('🚀 Starting enrichment process...', 'info');
                  
                  const startTime = Date.now();
                  
                  try {
                  addLog('📤 Calling /api/migrate-saved-leads...', 'info');
                  const response = await fetch('/api/migrate-saved-leads', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                      });
                    
                    if (!response.ok) {
                    const text = await response.text().catch(() => response.statusText);
                        throw new Error(`HTTP ${response.status}: ${text}`);
                    }
                    
                      const result = await response.json();

                      if (!result.success || !Array.isArray(result.enrichedLeads)) {
                    throw new Error(result.error || 'Enrichment failed');
                      }

                  const newLeads: LeadSummary[] = result.enrichedLeads;
                  
                  // Add today's date to all new leads that don't have dateScraped
                  const todayForNewLeads = new Date().toISOString().split('T')[0];
                  const newLeadsWithDate = newLeads.map((lead: LeadSummary) => ({
                    ...lead,
                    dateScraped: lead.dateScraped || todayForNewLeads
                  }));

                  // Merge with any existing leads in localStorage
                    const existingLeads = localStorage.getItem('enrichedLeads');
                  const existing: LeadSummary[] = existingLeads ? JSON.parse(existingLeads) : [];
                    const existingKeys = new Set(
                    existing
                      .map((l) => l.phone || l.email || l.name)
                      .filter(Boolean),
                    );
                    
                  const uniqueNewLeads = newLeads.filter((lead) => {
                      const key = lead.phone || lead.email || lead.name;
                      return key && !existingKeys.has(key);
                    });
                    
                  const combined = [...existing, ...uniqueNewLeads];
                  
                  // Add today's date to all leads that don't have dateScraped
                  const todayForCombined = new Date().toISOString().split('T')[0];
                  const combinedWithDate = combined.map((lead: LeadSummary) => ({
                    ...lead,
                    dateScraped: lead.dateScraped || todayForCombined
                  }));

                      // Compute basic stats
                  const withPhone = combinedWithDate.filter(
                        (l) => l.phone && l.phone !== 'EMPTY',
                      ).length;
                  const withEmail = combinedWithDate.filter(
                        (l) => l.email && l.email !== 'EMPTY',
                      ).length;
                  const withZipcode = combinedWithDate.filter(
                        (l) => l.zipcode && l.zipcode !== 'EMPTY',
                      ).length;
                              
                              setEnrichmentStats({
                              totalLeads: combinedWithDate.length,
                    processed: newLeads.length,
                        withPhone,
                        withEmail,
                        withZipcode,
                                errors: 0,
                              });
                              
                    try {
                      const saveResponse = await fetch('/api/aggregate-enriched-leads', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ newLeads: combinedWithDate }),
                      });

                      const saveResult = await saveResponse.json();
                      if (saveResult.success) {
                        if (fetchAbortControllerRef.current) {
                          fetchAbortControllerRef.current.abort();
                        }
                        fetchAbortControllerRef.current = new AbortController();
                        fetchPaginatedLeads(fetchAbortControllerRef.current.signal);
                      }
                    } catch (error) {
                      console.error('Failed to save enriched leads:', error);
                    }
                              setCurrentLead(null);
                              
                              const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                            addLog(`✅ Enrichment complete in ${elapsed}s!`, 'success');
                  addLog(
                    `📈 Added ${uniqueNewLeads.length} new enriched leads`,
                    'success',
                  );
                            addLog(`📊 Total leads: ${combined.length}`, 'success');

                              setEnrichmentProgress(100);
                              setTimeout(() => {
                                setShowProgressModal(false);
                                setLoadingSaved(false);
                      }, 3000);
                    } catch (error) {
                  console.error('Error enriching leads:', error);
                      addLog(
                        `❌ Error: ${
                          error instanceof Error ? error.message : 'Unknown error'
                        }`,
                        'error',
                      );
                    setEnrichmentProgress(100);
                    setTimeout(() => {
                      setShowProgressModal(false);
                      setLoadingSaved(false);
                    }, 2000);
                    }
  };

  // Get unique dates from all leads (for date filter dropdown)
  // Note: This requires a separate API call or we can use a cached list
  // For now, we'll fetch all dates on mount and cache them
  const [uniqueDates, setUniqueDates] = useState<string[]>([]);
  
  useEffect(() => {
    // Fetch unique dates for filter dropdown
    const fetchUniqueDates = async () => {
      try {
        const response = await fetch(`/api/load-enriched-results?limit=10000&t=${Date.now()}`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && Array.isArray(result.leads)) {
            const dates = new Set<string>();
            result.leads.forEach((lead: LeadSummary) => {
              if (lead.dateScraped) {
                const dateStr = lead.dateScraped.split('T')[0];
                dates.add(dateStr);
              }
            });
            setUniqueDates(Array.from(dates).sort().reverse());
          }
        }
      } catch (error) {
        console.error('Failed to fetch unique dates:', error);
      }
    };
    fetchUniqueDates();
  }, []);
  
  // Use server pagination metadata
  const totalPages = paginationMeta.totalPages;
  const startIndex = (paginationMeta.page - 1) * paginationMeta.limit;
  const endIndex = Math.min(startIndex + paginationMeta.limit, paginationMeta.total);

  return (
    <AppLayout>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight drop-shadow-lg" style={{ color: '#ff5757' }}>
              Enriched Leads
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 sm:mt-2 font-medium font-data">
              {searchQuery || ageMin !== '' || ageMax !== '' || mobileOnly || filterDNC || filterWarn || selectedState || selectedDate ? (
                <>
                  {totalLeads} of {totalUnfilteredLeads} leads
                  {totalPages > 1 && ` (Page ${currentPage}/${totalPages})`}
                  {searchQuery && ` (search: "${searchQuery}")`}
                  {(ageMin !== '' || ageMax !== '') && ` (age: ${ageMin !== '' ? ageMin : '0'}-${ageMax !== '' ? ageMax : '99+'})`}
                  {selectedState && ` (state: ${selectedState})`}
                  {selectedDate && (() => {
                    const date = new Date(selectedDate + 'T00:00:00');
                    return ` (date: ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`;
                  })()}
                  {mobileOnly && ' (mobile only)'}
                  {filterDNC && ' (DNC filtered)'}
                  {filterWarn && ' (WARN leads only)'}
                </>
              ) : (
                <>
                  {totalUnfilteredLeads} total enriched leads
                  {totalPages > 1 && ` • Page ${currentPage}/${totalPages}`}
                </>
              )}
            </p>
            {paginatedLeads.length > 0 && (() => {
              const linkedin = paginatedLeads.filter(l => l.platform === 'linkedin').length;
              const facebook = paginatedLeads.filter(l => l.platform === 'facebook').length;
              const instagram = paginatedLeads.filter(l => l.platform === 'instagram').length;
              if (linkedin === 0 && facebook === 0 && instagram === 0) return null;
              const parts = [];
              if (linkedin > 0) parts.push(`${linkedin} LinkedIn`);
              if (facebook > 0) parts.push(`${facebook} Facebook`);
              if (instagram > 0) parts.push(`${instagram} Instagram`);
              return (
                <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 font-data">
                  This page: {parts.join(' • ')}
                </p>
              );
            })()}
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={handleEnrich}
              disabled={loadingSaved}
              className="px-3 sm:px-4 py-1.5 sm:py-2 bg-minimalist-accent hover:bg-minimalist-accent-hover rounded-lg text-white text-xs sm:text-sm font-medium transition-all flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingSaved ? (
                <>
                  <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin" />
                  <span className="hidden sm:inline">Enriching...</span>
                  <span className="sm:hidden">...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Enrich</span>
                  <span className="sm:hidden">⚡</span>
                </>
            )}
            </button>
            <button
              onClick={handleExportCSV}
              disabled={totalLeads === 0}
              className="px-3 sm:px-4 py-1.5 sm:py-2 btn-inactive rounded-lg text-slate-200 hover:text-white text-xs sm:text-sm font-medium flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Export CSV</span>
              <span className="sm:hidden">CSV</span>
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        {totalUnfilteredLeads > 0 && (
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative group">
              <div className="absolute inset-0 bg-white/20 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <div className="relative panel-inactive rounded-xl">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400 group-hover:text-white transition-colors pointer-events-none z-10" />
                <input
                  type="text"
                  placeholder="Search by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-12 py-3 bg-transparent text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 rounded-xl transition-all duration-300 font-data relative z-20"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-gray-300 transition-colors hover:scale-110"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
            
            {/* Filter Checkboxes and Sort Controls */}
            <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
            <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold btn-inactive text-slate-200 font-data">
              <span className="whitespace-nowrap text-xs">Age:</span>
              <input
                type="number"
                placeholder="Min"
                value={ageMin}
                onChange={(e) => setAgeMin(e.target.value === '' ? '' : parseInt(e.target.value) || '')}
                min="0"
                max="120"
                className="w-12 sm:w-14 px-1.5 py-0.5 bg-slate-700/50 border border-slate-600 rounded text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50"
              />
              <span className="text-slate-400 text-xs">-</span>
              <input
                type="number"
                placeholder="Max"
                value={ageMax}
                onChange={(e) => setAgeMax(e.target.value === '' ? '' : parseInt(e.target.value) || '')}
                min="0"
                max="120"
                className="w-12 sm:w-14 px-1.5 py-0.5 bg-slate-700/50 border border-slate-600 rounded text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50"
              />
              {(ageMin !== '' || ageMax !== '') && (
                <button
                  onClick={() => {
                    setAgeMin('');
                    setAgeMax('');
                  }}
                  className="ml-1 text-slate-400 hover:text-gray-300 transition-colors"
                  title="Clear age filter"
                >
                  <X className="w-3 h-3 sm:w-4 sm:h-4" />
                </button>
              )}
            </div>
            {/* State Filter Dropdown */}
            <div className="relative">
              <select
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold border transition-all font-data appearance-none cursor-pointer ${
                  selectedState
                    ? 'border-white/80 bg-white/20 text-white shadow-lg shadow-white/50 ring-2 ring-white/50'
                    : 'btn-inactive text-slate-200 border-slate-600'
                }`}
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23cbd5e1' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.5rem center',
                  paddingRight: '2rem',
                  minWidth: '80px'
                }}
              >
                <option value="">All States</option>
                {allStateAbbreviations.map((abbr) => (
                  <option key={abbr} value={abbr} className="bg-slate-800 text-slate-200">
                    {abbr}
                  </option>
                ))}
              </select>
              {selectedState && (
                <button
                  onClick={() => setSelectedState('')}
                  className="absolute right-6 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-gray-300 transition-colors"
                  title="Clear state filter"
                >
                  <X className="w-3 h-3 sm:w-4 sm:h-4" />
                </button>
              )}
            </div>
            {/* Date Scraped Filter - Calendar Button */}
            <div className="relative">
              <button
                onClick={() => setShowDatePicker(true)}
                className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold border transition-all font-data flex items-center gap-1.5 sm:gap-2 ${
                  selectedDate
                    ? 'border-white/80 bg-white/20 text-white shadow-lg shadow-white/50 ring-2 ring-white/50'
                    : 'btn-inactive text-slate-200 border-slate-600'
                }`}
                title={selectedDate ? 'Change date filter' : 'Select date filter'}
              >
                <Calendar className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                <span className="whitespace-nowrap">
                  {selectedDate
                    ? (() => {
                        const date = new Date(selectedDate + 'T00:00:00');
                        return date.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        });
                      })()
                    : 'All Dates'}
                </span>
              </button>
              {selectedDate && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedDate('');
                  }}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-gray-300 transition-colors p-0.5"
                  title="Clear date filter"
                >
                  <X className="w-3 h-3 sm:w-4 sm:h-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => setMobileOnly(!mobileOnly)}
              className={`flex items-center justify-center px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-lg border transition-all duration-300 hover:scale-110 ${
                mobileOnly
                  ? 'border-white/80 bg-white/20 text-white shadow-lg shadow-white/50 ring-2 ring-white/50'
                  : 'btn-inactive text-slate-400'
              }`}
              title={mobileOnly ? 'Show all leads' : 'Show mobile only'}
            >
              <Smartphone className={`w-4 h-4 sm:w-5 sm:h-5 ${mobileOnly ? 'text-white' : 'text-slate-400'}`} />
            </button>
            <label className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold btn-inactive text-slate-200 cursor-pointer font-data">
              <input
                type="checkbox"
                checked={filterDNC}
                onChange={(e) => setFilterDNC(e.target.checked)}
                className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 bg-slate-700 border-slate-600 rounded focus:ring-2 focus:ring-white/50 cursor-pointer accent-gray-400"
              />
              <span className="hidden sm:inline text-xs">Filter DNC</span>
              <span className="sm:hidden text-xs">No DNC</span>
            </label>
            <label className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold btn-inactive text-slate-200 cursor-pointer font-data">
              <input
                type="checkbox"
                checked={filterWarn}
                onChange={(e) => setFilterWarn(e.target.checked)}
                className="w-3 h-3 sm:w-4 sm:h-4 text-white bg-slate-700 border-slate-600 rounded focus:ring-2 focus:ring-white/50 cursor-pointer accent-white"
              />
              <span className="hidden sm:inline text-xs">WARN Only</span>
              <span className="sm:hidden text-xs">WARN</span>
            </label>
            <button
              onClick={() => handleSort('name')}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold state-transition border flex items-center gap-1 sm:gap-2 font-data ${
                sortField === 'name'
                  ? 'btn-active text-white border-transparent'
                  : 'btn-inactive text-slate-200'
              }`}
            >
              Name {getSortIcon('name')}
            </button>
            <button
              onClick={() => handleSort('platform')}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold state-transition border flex items-center gap-1 sm:gap-2 font-data ${
                sortField === 'platform'
                  ? 'btn-active text-white border-transparent'
                  : 'btn-inactive text-slate-200'
              }`}
            >
              <span className="hidden sm:inline">Source</span>
              <span className="sm:hidden">Src</span> {getSortIcon('platform')}
            </button>
            <button
              onClick={() => handleSort('city')}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold state-transition border flex items-center gap-1 sm:gap-2 font-data ${
                sortField === 'city'
                  ? 'btn-active text-white border-transparent'
                  : 'btn-inactive text-slate-200'
              }`}
            >
              City {getSortIcon('city')}
            </button>
            <button
              onClick={() => handleSort('zipcode')}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold state-transition border flex items-center gap-1 sm:gap-2 font-data ${
                sortField === 'zipcode'
                  ? 'btn-active text-white border-transparent'
                  : 'btn-inactive text-slate-200'
              }`}
            >
              <span className="hidden sm:inline">Zipcode</span>
              <span className="sm:hidden">Zip</span> {getSortIcon('zipcode')}
            </button>
            <button
              onClick={() => handleSort('age')}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold state-transition border flex items-center gap-1 sm:gap-2 font-data ${
                sortField === 'age'
                  ? 'btn-active text-white border-transparent'
                  : 'btn-inactive text-slate-200'
              }`}
            >
              Age {getSortIcon('age')}
            </button>
            <button
              onClick={() => handleSort('income')}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold state-transition border flex items-center gap-1 sm:gap-2 font-data ${
                sortField === 'income'
                  ? 'btn-active text-white border-transparent'
                  : 'btn-inactive text-slate-200'
              }`}
            >
              Income {getSortIcon('income')}
            </button>
            <button
              onClick={() => handleSort('searchFilter')}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold state-transition border flex items-center gap-1 sm:gap-2 font-data ${
                sortField === 'searchFilter'
                  ? 'btn-active text-white border-transparent'
                  : 'btn-inactive text-slate-200'
              }`}
            >
              <span className="hidden sm:inline">Search Filter</span>
              <span className="sm:hidden">Filter</span> {getSortIcon('searchFilter')}
            </button>
            <button
              onClick={() => setSortField('none')}
              className="flex items-center justify-center px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold state-transition btn-inactive text-slate-200 font-data"
              title="Clear sort"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            </div>
          </div>
        )}

        {/* Leads Table */}
        {loading || isLoadingPage ? (
          <div className="px-6 py-12 panel-inactive rounded-2xl text-center">
            <Loader2 className="w-8 h-8 text-white animate-spin mx-auto mb-4" />
            <p className="text-slate-300 font-medium">Loading enriched leads...</p>
          </div>
        ) : !loading && !isLoadingPage && paginatedLeads.length === 0 && totalLeads === 0 ? (
          <div className="px-6 py-12 panel-inactive rounded-2xl text-center space-y-4">
            <p className="text-slate-300 font-semibold text-lg">No enriched leads found.</p>
            <div className="text-left bg-slate-900/60 backdrop-blur-sm p-6 rounded-xl border border-slate-700/50 max-w-2xl mx-auto shadow-lg">
              <p className="text-sm font-semibold text-slate-200 mb-3 text-white">To see enriched leads here:</p>
              <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside">
                <li>Go to the <Link href="/" className="text-white hover:text-white hover:underline transition-colors">Lead Generation page</Link></li>
                <li>Search for leads using LinkedIn Sales Navigator</li>
                <li>Click "Enrich & Scrub" to enrich the leads</li>
                <li>Once enrichment completes, leads will appear here automatically</li>
              </ol>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl panel-inactive relative">
            <div className="relative z-10">
              
              <table className="w-full text-xs relative z-10 font-data" style={{ tableLayout: 'fixed', width: '100%' }}>
                <thead>
                  <tr className="table-header">
                    <th className="px-2 py-2 text-left text-white font-semibold text-[10px] uppercase tracking-wider" style={{ width: '11%' }}>Name</th>
                    <th className="px-2 py-2 text-left text-white font-semibold text-[10px] uppercase tracking-wider" style={{ width: '7%' }}>Source</th>
                    <th className="px-2 py-2 text-left text-white font-semibold text-[10px] uppercase tracking-wider" style={{ width: '10%' }}>Phone</th>
                    <th className="px-2 py-2 text-left text-white font-semibold text-[10px] uppercase tracking-wider" style={{ width: '17%' }}>Email</th>
                    <th className="px-2 py-2 text-left text-white font-semibold text-[10px] uppercase tracking-wider" style={{ width: '9%' }}>City</th>
                    <th className="px-2 py-2 text-left text-white font-semibold text-[10px] uppercase tracking-wider" style={{ width: '5%' }}>State</th>
                    <th className="px-2 py-2 text-left text-white font-semibold text-[10px] uppercase tracking-wider" style={{ width: '7%' }}>Zipcode</th>
                    <th className="px-2 py-2 text-left text-white font-semibold text-[10px] uppercase tracking-wider" style={{ width: '5%' }}>Age</th>
                    <th className="px-2 py-2 text-left text-white font-semibold text-[10px] uppercase tracking-wider" style={{ width: '8%' }}>Income</th>
                    <th className="px-2 py-2 text-left text-white font-semibold text-[10px] uppercase tracking-wider" style={{ width: '8%' }}>Line Type</th>
                    <th className="px-2 py-2 text-left text-white font-semibold text-[10px] uppercase tracking-wider" style={{ width: '9%' }}>Carrier</th>
                    <th className="px-2 py-2 text-left text-white font-semibold text-[10px] uppercase tracking-wider" style={{ width: '9%' }}>Date Scraped</th>
                    <th className="px-2 py-2 text-left text-white font-semibold text-[10px] uppercase tracking-wider" style={{ width: '5%' }}>DNC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                {paginatedLeads.map((lead, index) => {
                  const globalIndex = (paginationMeta.page - 1) * paginationMeta.limit + index;
                  // Extract age from dobOrAge
                  let age = '';
                  if (lead.dobOrAge) {
                    const dobOrAgeStr = String(lead.dobOrAge).trim();
                    if (/^\d+$/.test(dobOrAgeStr)) {
                      age = dobOrAgeStr;
                    } else {
                      try {
                        const dob = new Date(dobOrAgeStr);
                        if (!isNaN(dob.getTime())) {
                          const today = new Date();
                          let calculatedAge = today.getFullYear() - dob.getFullYear();
                          const monthDiff = today.getMonth() - dob.getMonth();
                          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
                            calculatedAge--;
                          }
                          age = calculatedAge.toString();
                        }
                      } catch {
                        // If parsing fails, leave empty
                      }
                    }
                  }

                  const lineTypeColor = lead.lineType === 'mobile' 
                    ? 'text-white font-semibold drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' 
                    : lead.lineType && lead.lineType !== 'N/A'
                    ? 'text-gray-300 font-semibold drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]'
                    : 'text-slate-400';

                  // Determine row background color based on DNC status
                  const getRowBackgroundClass = () => {
                    if (lead.dncStatus === 'YES') {
                      return 'bg-red-500/10 hover:bg-red-500/15 border-l-4 border-red-500';
                    } else if (lead.dncStatus === 'NO') {
                      return 'bg-green-500/10 hover:bg-green-500/15 border-l-4 border-green-500';
                    }
                    return 'table-row-inactive';
                  };

                  return (
                    <tr 
                      key={globalIndex} 
                      className={`group relative ${getRowBackgroundClass()}`}
                      style={{ animationDelay: `${index * 20}ms` }}
                    >
                      <td 
                        className="px-2 py-2 text-slate-100 font-semibold relative z-10 cursor-pointer transition-all duration-300 ease-out hover:scale-[1.02] hover:text-white group/name"
                        onClick={() => lead.name && copyToClipboard(lead.name, `name-${globalIndex}`)}
                        title={lead.name ? (lead.name.length > 30 ? lead.name : 'Click to copy') : ''}
                      >
                        <span className="flex items-center gap-1 relative z-10 min-w-0">
                          <span className="transition-all duration-300 group-hover/name:text-white truncate block max-w-full">{lead.name || 'N/A'}</span>
                          {lead.name && (
                            <span className="opacity-0 group-hover/name:opacity-100 transition-all duration-300 transform group-hover/name:scale-110 flex-shrink-0">
                              {copiedField === `name-${globalIndex}` ? (
                                <Check className="w-3 h-3 text-white drop-shadow-lg" />
                              ) : (
                                <Copy className="w-3 h-3 text-white drop-shadow-lg" />
                              )}
                            </span>
                          )}
                        </span>
                        {lead.name && (
                          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-purple-500/0 to-pink-500/0 group-hover/name:from-blue-500/5 group-hover/name:via-purple-500/5 group-hover/name:to-pink-500/5 rounded-lg transition-all duration-500 -z-0" />
                        )}
                      </td>
                      <td className="px-2 py-2 relative z-10">
                        <div className="flex items-center gap-1 flex-wrap">
                          {lead.platform === 'linkedin' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-white/20 text-white border border-white/30">
                              LinkedIn
                            </span>
                          ) : lead.platform === 'facebook' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-white/20 text-white border border-white/30">
                              Facebook
                            </span>
                          ) : lead.platform === 'instagram' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-white/20 text-white border border-white/30">
                              Instagram
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">-</span>
                          )}
                          {(lead.isWarnLead || (lead.warnCompany && lead.warnCompany.trim().length > 0)) && (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border"
                              style={{ backgroundColor: 'rgba(255, 87, 87, 0.18)', color: '#ff9f9f', borderColor: 'rgba(255, 87, 87, 0.45)' }}
                              title={lead.warnCompany ? `WARN: ${lead.warnCompany}` : 'WARN lead'}
                            >
                              WARN
                            </span>
                          )}
                        </div>
                      </td>
                      <EnrichableCell
                        value={lead.phone || ''}
                        fieldId={`phone-${globalIndex}`}
                        lead={lead}
                        index={globalIndex}
                        field="phone"
                        className="text-slate-100 whitespace-nowrap relative z-10"
                        truncate={false}
                      />
                      <EnrichableCell
                        value={lead.email || ''}
                        fieldId={`email-${globalIndex}`}
                        lead={lead}
                        index={globalIndex}
                        field="email"
                        className="text-slate-300 relative z-10"
                        truncate={true}
                      />
                      <CopyableCell 
                        value={lead.city || ''} 
                        fieldId={`city-${globalIndex}`}
                        className="text-slate-300 relative z-10"
                        truncate={true}
                      />
                      <CopyableCell 
                        value={getStateAbbreviation(lead.state)} 
                        fieldId={`state-${globalIndex}`}
                        className="text-slate-300 relative z-10"
                        truncate={false}
                      />
                      <EnrichableCell
                        value={lead.zipcode || ''}
                        fieldId={`zipcode-${globalIndex}`}
                        lead={lead}
                        index={globalIndex}
                        field="zipcode"
                        className="text-slate-300 relative z-10"
                        truncate={false}
                      />
                      <td className="px-2 py-2 text-slate-300 relative z-10 cursor-pointer transition-all duration-300 ease-out hover:scale-[1.02] hover:text-white group/age">
                        <span className="flex items-center gap-1 relative z-10">
                          <span className="transition-all duration-300 group-hover/age:text-white text-xs">{age || 'N/A'}</span>
                          {age && (
                            <span className="opacity-0 group-hover/age:opacity-100 transition-all duration-300 transform group-hover/age:scale-110 flex-shrink-0" onClick={() => copyToClipboard(age, `age-${globalIndex}`)}>
                              {copiedField === `age-${globalIndex}` ? (
                                <Check className="w-3 h-3 text-white drop-shadow-lg" />
                              ) : (
                                <Copy className="w-3 h-3 text-white drop-shadow-lg" />
                              )}
                            </span>
                          )}
                        </span>
                        {age && (
                          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-purple-500/0 to-pink-500/0 group-hover/age:from-blue-500/5 group-hover/age:via-purple-500/5 group-hover/age:to-pink-500/5 rounded-lg transition-all duration-500 -z-0" />
                        )}
                      </td>
                      <EnrichableIncomeCell
                        value={lead.income}
                        fieldId={`income-${globalIndex}`}
                        lead={lead}
                        index={globalIndex}
                        className="text-slate-300 relative z-10"
                      />
                      <td 
                        className={`px-2 py-2 ${lineTypeColor} cursor-pointer transition-all duration-300 ease-out group/line relative z-10 hover:scale-[1.05] hover:drop-shadow-lg`}
                        onClick={() => lead.lineType && lead.lineType !== 'N/A' && copyToClipboard(lead.lineType, `lineType-${globalIndex}`)}
                        title={lead.lineType && lead.lineType !== 'N/A' ? 'Click to copy' : ''}
                      >
                        <span className="flex items-center gap-1 relative z-10 min-w-0">
                          {lead.lineType && lead.lineType.toLowerCase() === 'mobile' ? (
                            <Smartphone className="w-3 h-3 text-white flex-shrink-0" />
                          ) : lead.lineType && (lead.lineType.toLowerCase().includes('fixed') || lead.lineType.toLowerCase().includes('landline')) ? (
                            <Phone className="w-3 h-3 text-gray-300 flex-shrink-0" />
                          ) : null}
                          <span className="truncate block max-w-full text-xs">{lead.lineType || 'N/A'}</span>
                          {lead.lineType && lead.lineType !== 'N/A' && (
                            <span className="opacity-0 group-hover/line:opacity-100 transition-all duration-300 transform group-hover/line:scale-110 flex-shrink-0">
                              {copiedField === `lineType-${globalIndex}` ? (
                                <Check className="w-3 h-3 drop-shadow-lg" />
                              ) : (
                                <Copy className="w-3 h-3 drop-shadow-lg" />
                              )}
                            </span>
                          )}
                        </span>
                      </td>
                      <CopyableCell 
                        value={lead.carrier || ''} 
                        fieldId={`carrier-${globalIndex}`}
                        className="text-slate-300 relative z-10"
                        truncate={true}
                      />
                      <CopyableCell 
                        value={lead.dateScraped ? formatDate(lead.dateScraped) : ''} 
                        fieldId={`dateScraped-${globalIndex}`}
                        className="text-slate-300 relative z-10"
                        truncate={false}
                      />
                      <td className="px-2 py-2 text-slate-300 relative z-10">
                        {lead.dncStatus === 'YES' ? (
                          <span className="badge badge-error">DNC</span>
                        ) : lead.dncStatus === 'NO' ? (
                          <span className="badge badge-success">OK</span>
                        ) : (
                          <span className="text-xs text-slate-500">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {/* Pagination Controls */}
        {!loading && paginatedLeads.length > 0 && totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-4 panel-inactive rounded-xl">
            <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-400">
              <span>Showing</span>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 bg-slate-800 border border-slate-600 rounded text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
              <span>per page</span>
              <span className="text-slate-500">•</span>
              <span>
                {startIndex + 1}-{endIndex} of {totalLeads}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1 ${
                  currentPage === 1
                    ? 'opacity-50 cursor-not-allowed btn-inactive text-slate-500'
                    : 'btn-inactive text-slate-200 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Previous</span>
              </button>
              
              <div className="flex items-center gap-1">
                {/* Page numbers */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-2 py-1 min-w-[32px] rounded text-xs sm:text-sm font-medium transition-all ${
                        currentPage === pageNum
                          ? 'bg-white/20 text-white shadow-lg shadow-white/50'
                          : 'btn-inactive text-slate-300 hover:text-white hover:bg-slate-700/50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1 ${
                  currentPage === totalPages
                    ? 'opacity-50 cursor-not-allowed btn-inactive text-slate-500'
                    : 'btn-inactive text-slate-200 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Progress Modal */}
        {showProgressModal && (
        <div className="modal-overlay">
          <div className="modal-content w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Current Lead Display */}
            {currentLead && (
              <div className="p-6 border-b border-slate-700/50 panel-inactive">
                <h3 className="text-sm font-semibold text-slate-200 mb-2">Currently Processing</h3>
                <div className="panel-inactive p-4 rounded-lg">
                  <div className="font-semibold text-slate-200 mb-2">{currentLead.name}</div>
                  <div className="text-xs text-slate-400 mb-1">Step: {currentLead.step}</div>
                  {currentLead.details && Object.keys(currentLead.details).length > 0 && (
                    <div className="mt-2 space-y-1">
                      {currentLead.details.phone && (
                        <div className="text-xs text-slate-300">📞 Phone: {formatPhoneNumber(currentLead.details.phone)}</div>
                      )}
                      {currentLead.details.email && (
                        <div className="text-xs text-slate-300">📧 Email: {currentLead.details.email}</div>
                      )}
                      {currentLead.details.zipCode && (
                        <div className="text-xs text-slate-300">📍 ZIP: {currentLead.details.zipCode}</div>
                      )}
                      {currentLead.details.lineType && (
                        <div className="text-xs text-slate-300">📱 Line Type: {currentLead.details.lineType}</div>
                      )}
                      {currentLead.details.carrier && (
                        <div className="text-xs text-slate-300">🏢 Carrier: {currentLead.details.carrier}</div>
                      )}
                      {currentLead.details.age && (
                        <div className="text-xs text-slate-300">🎂 Age: {currentLead.details.age}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-white animate-spin" />
                <h2 className="text-xl font-bold text-slate-200">Enriching Leads</h2>
              </div>
              <button
                onClick={() => {
                  if (enrichmentProgress >= 100) {
                    setShowProgressModal(false);
                    setLoadingSaved(false);
                  }
                }}
                className="text-slate-400 hover:text-slate-200 state-transition"
                disabled={enrichmentProgress < 100}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Progress Bar */}
            <div className="p-6 border-b border-slate-700/50">
                <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-200">Progress</span>
                <span className="text-sm text-slate-400">{Math.round(enrichmentProgress)}%</span>
              </div>
              <div className="w-full progress-bar-container h-2">
                <div
                  className="progress-bar-fill h-full"
                  style={{ width: `${enrichmentProgress}%` }}
                />
              </div>
            </div>

            {/* Statistics */}
            {enrichmentStats && (
              <div className="p-6 border-b border-slate-700/50">
                {enrichmentStats && (
                  <>
                <h3 className="text-sm font-semibold text-slate-200 mb-3">Statistics</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="panel-inactive p-3 rounded-lg">
                    <div className="text-xs text-slate-400 mb-1">Total Leads</div>
                    <div className="text-lg font-bold text-slate-200">{enrichmentStats.totalLeads}</div>
                  </div>
                  <div className="panel-inactive p-3 rounded-lg">
                    <div className="text-xs text-slate-400 mb-1">With Phone</div>
                    <div className="text-lg font-bold text-white">{enrichmentStats.withPhone}</div>
                  </div>
                  <div className="panel-inactive p-3 rounded-lg">
                    <div className="text-xs text-slate-400 mb-1">With Email</div>
                    <div className="text-lg font-bold text-white">{enrichmentStats.withEmail}</div>
                  </div>
                  <div className="panel-inactive p-3 rounded-lg">
                    <div className="text-xs text-slate-400 mb-1">With Zipcode</div>
                    <div className="text-lg font-bold text-white">{enrichmentStats.withZipcode}</div>
                  </div>
                  <div className="panel-inactive p-3 rounded-lg">
                    <div className="text-xs text-slate-400 mb-1">Processed</div>
                    <div className="text-lg font-bold text-slate-200">{enrichmentStats.processed}</div>
                  </div>
                  {enrichmentStats.errors > 0 && (
                    <div className="status-error p-3 rounded-lg">
                      <div className="text-xs text-gray-300 mb-1">Errors</div>
                      <div className="text-lg font-bold text-gray-300">{enrichmentStats.errors}</div>
                    </div>
                  )}
                </div>
                  </>
                )}
              </div>
            )}

            {/* Logs */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="px-6 py-3 border-b border-slate-700/50">
                <h3 className="text-sm font-semibold text-slate-200">Logs</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-6 panel-inactive">
                <div className="space-y-2 font-mono text-xs">
                  {enrichmentLogs.length === 0 ? (
                    <div className="text-gray-500">Waiting for logs...</div>
                  ) : (
                    enrichmentLogs.map((log, index) => (
                      <div
                        key={index}
                        className={`flex items-start gap-2 ${
                          log.type === 'error' ? 'text-gray-400' :
                          log.type === 'success' ? 'text-green-600' :
                          log.type === 'warning' ? 'text-yellow-600' :
                          'text-gray-700'
                        }`}
                      >
                        <span className="text-gray-400 flex-shrink-0">
                          {log.timestamp.toLocaleTimeString()}
                        </span>
                        <span className="flex-shrink-0">
                          {log.type === 'success' && <CheckCircle2 className="w-3 h-3" />}
                          {log.type === 'error' && <AlertCircle className="w-3 h-3" />}
                          {log.type === 'warning' && <AlertCircle className="w-3 h-3" />}
                          {log.type === 'info' && <span className="w-3 h-3 inline-block">•</span>}
                        </span>
                        <span className="flex-1 break-words">{log.message}</span>
                      </div>
                    ))
                  )}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>

            {/* Footer */}
            {enrichmentProgress >= 100 && (
              <div className="p-6 border-t border-slate-700/50">
                <button
                  onClick={() => {
                    setShowProgressModal(false);
                    setLoadingSaved(false);
                  }}
                  className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-white font-medium transition-all"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
        )}

        {/* Date Picker Modal */}
        <DatePickerModal
          isOpen={showDatePicker}
          selectedDate={selectedDate || null}
          onDateSelect={(date) => setSelectedDate(date || '')}
          onClose={() => setShowDatePicker(false)}
          availableDates={uniqueDates}
        />
      </div>
    </AppLayout>
  );
}
