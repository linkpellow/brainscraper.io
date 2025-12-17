'use client';

import { useState, useEffect, useRef } from 'react';
import { Download, ArrowUpDown, ArrowUp, ArrowDown, Loader2, Zap, X, CheckCircle2, AlertCircle, Search, Copy, Check, Smartphone, Phone, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { LeadSummary, leadSummariesToCSV, formatPhoneNumber } from '@/utils/extractLeadSummary';
import AppLayout from '../components/AppLayout';

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

type SortField = 'name' | 'state' | 'city' | 'zipcode' | 'age' | 'searchFilter' | 'none';
type SortDirection = 'asc' | 'desc';

type EnrichmentLog = {
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
};

export default function EnrichedLeadsPage() {
  const [leads, setLeads] = useState<LeadSummary[]>([]);
  const [sortField, setSortField] = useState<SortField>('none');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [ageMin, setAgeMin] = useState<number | ''>('');
  const [ageMax, setAgeMax] = useState<number | ''>(64);
  const [mobileOnly, setMobileOnly] = useState<boolean>(false);
  const [filterDNC, setFilterDNC] = useState<boolean>(false);
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
  const [isScrubbingDNC, setIsScrubbingDNC] = useState(false);
  const [dncScrubProgress, setDncScrubProgress] = useState({ current: 0, total: 0 });
  const [dncError, setDncError] = useState<string | null>(null);
  const [enrichingFields, setEnrichingFields] = useState<Set<string>>(new Set());
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = (message: string, type: EnrichmentLog['type'] = 'info') => {
    setEnrichmentLogs(prev => [...prev, { timestamp: new Date(), message, type }]);
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  useEffect(() => {
    // Explicitly reset modal state on mount to prevent auto-triggering
    setShowProgressModal(false);
    setLoadingSaved(false);
    setEnrichmentProgress(0);
    setEnrichmentLogs([]);
    
    // Load enriched leads from localStorage and API
    const loadLeads = async () => {
      try {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        
        // Try localStorage first (preserve user's current view)
        const stored = localStorage.getItem('enrichedLeads');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              // Check if localStorage data has actual content
              const hasData = parsed.some((lead: any) => 
                (lead.name && lead.name.trim()) || 
                (lead.phone && lead.phone.trim()) || 
                (lead.email && lead.email.trim())
              );
              if (hasData) {
                // Add today's date to all leads that don't have dateScraped
                const leadsWithDate = parsed.map((lead: LeadSummary) => ({
                  ...lead,
                  dateScraped: lead.dateScraped || today
                }));
                setLeads(leadsWithDate);
                // Update localStorage with dates added
                localStorage.setItem('enrichedLeads', JSON.stringify(leadsWithDate));
                setLoading(false);
                console.log(`✅ Loaded ${leadsWithDate.length} leads from localStorage`);
                return;
              }
            }
          } catch (e) {
            console.log('Error parsing localStorage data, will reload from API');
          }
        }
        
        // If no valid localStorage data, load from API
        try {
          const response = await fetch(`/api/load-enriched-results?t=${Date.now()}`);
          if (response.ok) {
            const result = await response.json();
            if (result.success && Array.isArray(result.leads) && result.leads.length > 0) {
              // Add today's date to all leads that don't have dateScraped
              const leadsWithDate = result.leads.map((lead: LeadSummary) => ({
                ...lead,
                dateScraped: lead.dateScraped || today
              }));
              setLeads(leadsWithDate);
              // Update localStorage with fresh data and dates
              localStorage.setItem('enrichedLeads', JSON.stringify(leadsWithDate));
              console.log(`✅ Loaded ${leadsWithDate.length} leads from ${result.source} results`);
              setLoading(false);
              return;
            }
          }
        } catch (apiError) {
          console.log('Could not load from API:', apiError);
        }
        
        setLeads([]);
      } catch (error) {
        console.error('Failed to load enriched leads:', error);
      } finally {
        setLoading(false);
      }
    };

    loadLeads();

    // Listen for new enriched leads from storage events (other tabs)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'enrichedLeads') {
        try {
          const parsed = e.newValue ? JSON.parse(e.newValue) : [];
          const today = new Date().toISOString().split('T')[0];
          // Add today's date to all leads that don't have dateScraped
          const leadsWithDate = Array.isArray(parsed) 
            ? parsed.map((lead: LeadSummary) => ({
                ...lead,
                dateScraped: lead.dateScraped || today
              }))
            : [];
          setLeads(leadsWithDate);
        } catch (error) {
          console.error('Failed to parse enriched leads:', error);
        }
      }
    };

    // Listen for custom event (same window updates)
    const handleCustomStorage = () => {
      loadLeads();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('enrichedLeadsUpdated', handleCustomStorage);
    
    // Poll for updates (fallback for same-window updates)
    const interval = setInterval(loadLeads, 2000);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('enrichedLeadsUpdated', handleCustomStorage);
      clearInterval(interval);
    };
  }, []); // Empty dependency array - only run on mount

  // Auto-scrub DNC status in background after leads are loaded
  useEffect(() => {
    if (leads.length === 0 || isScrubbingDNC) return;
    
    // Check if any leads need DNC scrubbing (don't have DNC status or have UNKNOWN)
    const leadsToScrub = leads.filter((lead: LeadSummary) => {
      const phone = lead.phone?.replace(/\D/g, '');
      return phone && phone.length >= 10 && (!lead.dncStatus || lead.dncStatus === 'UNKNOWN');
    });
    
    if (leadsToScrub.length === 0) return;
    
    // Wait a bit before starting to avoid blocking initial load
    const dncTimeout = setTimeout(async () => {
      console.log('\n🔍 [FRONTEND DNC] ============================================');
      console.log(`🔍 [FRONTEND DNC] Starting background DNC scrubbing`);
      console.log(`🔍 [FRONTEND DNC] Found ${leadsToScrub.length} leads that need DNC checking`);
      console.log('🔍 [FRONTEND DNC] ============================================\n');
      
      setIsScrubbingDNC(true);
      setDncScrubProgress({ current: 0, total: leadsToScrub.length });
      
      const startTime = Date.now();
      
      try {
        // Scrub in batches
        const batchSize = 20;
        const dncResults = new Map<string, string>();
        const totalBatches = Math.ceil(leadsToScrub.length / batchSize);
        
        console.log(`📦 [FRONTEND DNC] Processing ${leadsToScrub.length} leads in ${totalBatches} batch(es)\n`);
        
        for (let i = 0; i < leadsToScrub.length; i += batchSize) {
          const batchNum = Math.floor(i / batchSize) + 1;
          const batch = leadsToScrub.slice(i, i + batchSize);
          const phoneNumbers = batch.map((lead: LeadSummary) => lead.phone?.replace(/\D/g, '')).filter(Boolean);
          
          console.log(`📤 [FRONTEND DNC] Sending batch ${batchNum}/${totalBatches} (${phoneNumbers.length} numbers) to API...`);
          
          try {
            const batchStart = Date.now();
            const response = await fetch('/api/usha/scrub-batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phoneNumbers }),
            });
            
            const batchTime = Date.now() - batchStart;
            
            if (response.ok) {
              const result = await response.json();
              if (result.success && result.results) {
                const batchDncCount = result.dncCount || 0;
                const batchOkCount = result.okCount || 0;
                
                console.log(`📥 [FRONTEND DNC] Batch ${batchNum} received: ${batchOkCount} OK, ${batchDncCount} DNC (${batchTime}ms)`);
                
                result.results.forEach((r: any) => {
                  dncResults.set(r.phone, r.status === 'DNC' ? 'YES' : r.status === 'OK' ? 'NO' : 'UNKNOWN');
                });
                setDncError(null); // Clear any previous errors
              }
            } else {
              const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
              const errorMessage = errorData.error || response.statusText;
              console.error(`❌ [FRONTEND DNC] Batch ${batchNum} failed:`, errorMessage);
              
              // Check if it's a token error
              if (errorMessage.includes('USHA JWT token') || errorMessage.includes('token is required')) {
                setDncError('USHA JWT token not configured. Please add USHA_JWT_TOKEN to your .env.local file and restart the server.');
                console.error('\n⚠️  [FRONTEND DNC] ============================================');
                console.error('⚠️  [FRONTEND DNC] CONFIGURATION ERROR:');
                console.error('⚠️  [FRONTEND DNC] USHA_JWT_TOKEN is missing from .env.local');
                console.error('⚠️  [FRONTEND DNC]');
                console.error('⚠️  [FRONTEND DNC] To fix:');
                console.error('⚠️  [FRONTEND DNC] 1. Create/edit .env.local in project root');
                console.error('⚠️  [FRONTEND DNC] 2. Add: USHA_JWT_TOKEN=your_token_here');
                console.error('⚠️  [FRONTEND DNC] 3. Restart your Next.js server');
                console.error('⚠️  [FRONTEND DNC] ============================================\n');
                break; // Stop processing more batches
              }
            }
          } catch (error) {
            console.error(`❌ [FRONTEND DNC] Batch ${batchNum} exception:`, error);
          }
          
          const progress = Math.min(i + batchSize, leadsToScrub.length);
          setDncScrubProgress({ current: progress, total: leadsToScrub.length });
          console.log(`📊 [FRONTEND DNC] Progress: ${progress}/${leadsToScrub.length} (${Math.round((progress/leadsToScrub.length)*100)}%)\n`);
          
          // Small delay between batches
          if (i + batchSize < leadsToScrub.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
        
        // Update leads with DNC status
        if (dncResults.size > 0) {
          const totalTime = Date.now() - startTime;
          const dncCount = Array.from(dncResults.values()).filter(v => v === 'YES').length;
          const okCount = Array.from(dncResults.values()).filter(v => v === 'NO').length;
          
          console.log(`🔄 [FRONTEND DNC] Updating ${dncResults.size} leads with DNC status...`);
          
          setLeads(prevLeads => {
            const updatedLeads = prevLeads.map((lead: LeadSummary) => {
              const phone = lead.phone?.replace(/\D/g, '');
              if (phone && dncResults.has(phone)) {
                return { ...lead, dncStatus: dncResults.get(phone) || 'UNKNOWN' };
              }
              return lead;
            });
            
            localStorage.setItem('enrichedLeads', JSON.stringify(updatedLeads));
            
            console.log('✅ [FRONTEND DNC] ============================================');
            console.log(`✅ [FRONTEND DNC] DNC Scrubbing Complete!`);
            console.log(`✅ [FRONTEND DNC] Updated: ${dncResults.size} leads`);
            console.log(`✅ [FRONTEND DNC] Results: ${okCount} OK, ${dncCount} DNC`);
            console.log(`✅ [FRONTEND DNC] Total Time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
            console.log('✅ [FRONTEND DNC] ============================================\n');
            
            return updatedLeads;
          });
        } else {
          console.warn('⚠️  [FRONTEND DNC] No DNC results received from API\n');
        }
      } catch (error) {
        const totalTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ [FRONTEND DNC] ============================================');
        console.error('❌ [FRONTEND DNC] Fatal Error:', errorMessage);
        console.error(`❌ [FRONTEND DNC] Time before error: ${totalTime}ms`);
        console.error('❌ [FRONTEND DNC] ============================================\n');
        setDncError(`DNC scrubbing failed: ${errorMessage}`);
      } finally {
        setIsScrubbingDNC(false);
        setDncScrubProgress({ current: 0, total: 0 });
      }
    }, 2000);
    
    return () => clearTimeout(dncTimeout);
  }, [leads.length, isScrubbingDNC]); // Run when leads change or scrubbing completes

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

  const getSortedLeads = (): LeadSummary[] => {
    // Apply filters first
    let filteredLeads = leads;
    
    // Search filter (by name)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filteredLeads = filteredLeads.filter((lead) => {
        const name = (lead.name || '').toLowerCase();
        return name.includes(query);
      });
    }
    
    // Age range filter
    if (ageMin !== '' || ageMax !== '') {
      filteredLeads = filteredLeads.filter((lead) => {
        if (!lead.dobOrAge) return false;
        const age = parseInt(lead.dobOrAge);
        if (isNaN(age)) return false;
        
        const min = ageMin !== '' ? Number(ageMin) : 0;
        const max = ageMax !== '' ? Number(ageMax) : 999;
        
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
        // Filter out leads where dncStatus is "YES" (Do Not Call)
        return lead.dncStatus !== 'YES';
      });
    }

    if (sortField === 'none') return filteredLeads;

    return [...filteredLeads].sort((a, b) => {
      let aValue: string | number = '';
      let bValue: string | number = '';

      switch (sortField) {
        case 'name':
          aValue = (a.name || '').toLowerCase();
          bValue = (b.name || '').toLowerCase();
          break;
        case 'state':
          aValue = (a.state || '').toLowerCase();
          bValue = (b.state || '').toLowerCase();
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
          // Extract numeric age from dobOrAge
          const aAge = parseInt(a.dobOrAge) || 0;
          const bAge = parseInt(b.dobOrAge) || 0;
          aValue = aAge;
          bValue = bAge;
          break;
        case 'searchFilter':
          aValue = (a.searchFilter || '').toLowerCase();
          bValue = (b.searchFilter || '').toLowerCase();
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
  };

  const handleExportCSV = () => {
    const csv = leadSummariesToCSV(getSortedLeads());
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enriched_leads_all_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4 text-slate-400" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-4 h-4 text-blue-400" />
    ) : (
      <ArrowDown className="w-4 h-4 text-blue-400" />
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
  const canEnrichField = (lead: LeadSummary, field: 'phone' | 'email'): boolean => {
    // Field must be empty
    const fieldValue = field === 'phone' ? lead.phone : lead.email;
    if (fieldValue && fieldValue !== 'N/A' && fieldValue.trim() !== '') {
      return false;
    }

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
  const handleEnrichField = async (lead: LeadSummary, field: 'phone' | 'email', index: number) => {
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
            linkedinUrl: lead.linkedinUrl,
          },
          field,
        }),
      });

      const result = await response.json();

      if (result.success && result.value) {
        // Update the lead in state
        const updatedLead: LeadSummary = {
          ...lead,
          [field]: result.value,
          // Also update bonus field if provided
          ...(result.bonus && field === 'phone' ? { email: result.bonus } : {}),
          ...(result.bonus && field === 'email' ? { phone: result.bonus } : {}),
        };

        setLeads(prevLeads => {
          const updated = [...prevLeads];
          // Find the lead by name (most reliable identifier)
          const leadIndex = updated.findIndex(l => l.name === lead.name);
          
          if (leadIndex >= 0) {
            updated[leadIndex] = updatedLead;
          }
          
          // Update localStorage
          localStorage.setItem('enrichedLeads', JSON.stringify(updated));
          
          return updated;
        });

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
          };

          await fetch('/api/save-enriched-lead', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              enrichedRow,
              leadSummary: updatedLead,
            }),
          });
        } catch (saveError) {
          console.error('Failed to save enriched lead to disk:', saveError);
          // Don't fail the enrichment if save fails
        }
      } else {
        console.error('Enrichment failed:', result.error);
        // Could show a toast/notification here
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

  const CopyableCell = ({ value, fieldId, className = '', hoverColor = 'hover:bg-gradient-to-r hover:from-blue-500/10 hover:to-purple-500/10', truncate = true }: { 
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
          <span className={`transition-all duration-300 group-hover:text-blue-400 ${truncate ? 'truncate block max-w-full' : ''}`}>{displayValue}</span>
          {canCopy && (
            <span className="opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-110 flex-shrink-0">
              {isCopied ? (
                <Check className="w-3 h-3 text-emerald-400 drop-shadow-lg" />
              ) : (
                <Copy className="w-3 h-3 text-blue-400 drop-shadow-lg" />
              )}
            </span>
          )}
        </span>
        {canCopy && (
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-purple-500/0 to-pink-500/0 group-hover:from-blue-500/5 group-hover:via-purple-500/5 group-hover:to-pink-500/5 rounded-lg transition-all duration-500 -z-0" />
        )}
      </td>
    );
  };

  /**
   * Enrichable cell component for phone and email fields
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
    field: 'phone' | 'email';
    className?: string;
    truncate?: boolean;
  }) => {
    const displayValue = value || 'N/A';
    const isEmpty = !value || value === 'N/A' || value.trim() === '';
    const canEnrich = canEnrichField(lead, field);
    const isEnriching = enrichingFields.has(`${field}-${index}`);
    const canCopy = value && value !== 'N/A';
    const isCopied = copiedField === fieldId;

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
              <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
              <span className="text-xs text-blue-400">Enriching...</span>
            </>
          ) : (
            <>
              <span className={`transition-all duration-300 ${canCopy ? 'group-hover:text-blue-400' : ''} ${truncate ? 'truncate block max-w-full' : ''}`}>
                {field === 'phone' ? formatPhoneNumber(displayValue) : displayValue}
              </span>
              {isEmpty && canEnrich && (
                <span className="opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-110 flex-shrink-0">
                  <Sparkles className="w-3 h-3 text-purple-400 drop-shadow-lg" />
                </span>
              )}
              {canCopy && (
                <span className="opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-110 flex-shrink-0">
                  {isCopied ? (
                    <Check className="w-3 h-3 text-emerald-400 drop-shadow-lg" />
                  ) : (
                    <Copy className="w-3 h-3 text-blue-400 drop-shadow-lg" />
                  )}
                </span>
              )}
            </>
          )}
        </span>
        {(canCopy || (isEmpty && canEnrich)) && (
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-purple-500/0 to-pink-500/0 group-hover:from-blue-500/5 group-hover:via-purple-500/5 group-hover:to-pink-500/5 rounded-lg transition-all duration-500 -z-0" />
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
                            
      localStorage.setItem('enrichedLeads', JSON.stringify(leadsWithDate));
                    window.dispatchEvent(new Event('enrichedLeadsUpdated'));
      setLeads(leadsWithDate);
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
                              
                    localStorage.setItem('enrichedLeads', JSON.stringify(combinedWithDate));
                        window.dispatchEvent(new Event('enrichedLeadsUpdated'));
                    setLeads(combinedWithDate);
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

  const sortedLeads = getSortedLeads();

  return (
    <AppLayout>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent tracking-tight drop-shadow-lg">
              Enriched Leads
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 sm:mt-2 font-medium font-data">
              {searchQuery || ageMin !== '' || ageMax !== '' || mobileOnly || filterDNC ? (
                <>
                  {getSortedLeads().length} of {leads.length} leads
                  {searchQuery && ` (search: "${searchQuery}")`}
                  {(ageMin !== '' || ageMax !== '') && ` (age: ${ageMin !== '' ? ageMin : '0'}-${ageMax !== '' ? ageMax : '99+'})`}
                  {mobileOnly && ' (mobile only)'}
                  {filterDNC && ' (DNC filtered)'}
                </>
              ) : (
                <>
                  {leads.length} total enriched leads
                  {isScrubbingDNC && ` • Scrubbing DNC: ${dncScrubProgress.current}/${dncScrubProgress.total}`}
                </>
              )}
            </p>
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
              disabled={leads.length === 0}
              className="px-3 sm:px-4 py-1.5 sm:py-2 btn-inactive rounded-lg text-slate-200 hover:text-white text-xs sm:text-sm font-medium flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Export CSV</span>
              <span className="sm:hidden">CSV</span>
            </button>
          </div>
        </div>

        {/* DNC Error Banner */}
        {dncError && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-red-400 font-semibold mb-1">DNC Scrubbing Configuration Error</h3>
                <p className="text-red-300 text-sm mb-2">{dncError}</p>
                <button
                  onClick={() => setDncError(null)}
                  className="text-red-400 hover:text-red-300 text-xs underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        {leads.length > 0 && (
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative panel-inactive rounded-xl">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400 group-hover:text-blue-400 transition-colors" />
                <input
                  type="text"
                  placeholder="Search by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-12 py-3 bg-transparent text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 rounded-xl transition-all duration-300 font-data"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-red-400 transition-colors hover:scale-110"
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
                className="w-12 sm:w-14 px-1.5 py-0.5 bg-slate-700/50 border border-slate-600 rounded text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
              />
              <span className="text-slate-400 text-xs">-</span>
              <input
                type="number"
                placeholder="Max"
                value={ageMax}
                onChange={(e) => setAgeMax(e.target.value === '' ? '' : parseInt(e.target.value) || '')}
                min="0"
                max="120"
                className="w-12 sm:w-14 px-1.5 py-0.5 bg-slate-700/50 border border-slate-600 rounded text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
              />
              {(ageMin !== '' || ageMax !== '') && (
                <button
                  onClick={() => {
                    setAgeMin('');
                    setAgeMax('');
                  }}
                  className="ml-1 text-slate-400 hover:text-red-400 transition-colors"
                  title="Clear age filter"
                >
                  <X className="w-3 h-3 sm:w-4 sm:h-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => setMobileOnly(!mobileOnly)}
              className={`flex items-center justify-center px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-lg border transition-all duration-300 hover:scale-110 ${
                mobileOnly
                  ? 'border-purple-500/80 bg-purple-500/20 text-purple-300 shadow-lg shadow-purple-500/50 ring-2 ring-purple-500/50'
                  : 'btn-inactive text-slate-400'
              }`}
              title={mobileOnly ? 'Show all leads' : 'Show mobile only'}
            >
              <Smartphone className={`w-4 h-4 sm:w-5 sm:h-5 ${mobileOnly ? 'text-purple-300' : 'text-slate-400'}`} />
            </button>
            <label className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold btn-inactive text-slate-200 cursor-pointer font-data">
              <input
                type="checkbox"
                checked={filterDNC}
                onChange={(e) => setFilterDNC(e.target.checked)}
                className="w-3 h-3 sm:w-4 sm:h-4 text-red-500 bg-slate-700 border-slate-600 rounded focus:ring-2 focus:ring-red-500 cursor-pointer accent-red-500"
              />
              <span className="hidden sm:inline text-xs">Filter DNC</span>
              <span className="sm:hidden text-xs">No DNC</span>
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
              onClick={() => handleSort('state')}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold state-transition border flex items-center gap-1 sm:gap-2 font-data ${
                sortField === 'state'
                  ? 'btn-active text-white border-transparent'
                  : 'btn-inactive text-slate-200'
              }`}
            >
              State {getSortIcon('state')}
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
        {loading ? (
          <div className="px-6 py-12 panel-inactive rounded-2xl text-center">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-4" />
            <p className="text-slate-300 font-medium">Loading enriched leads...</p>
          </div>
        ) : leads.length === 0 ? (
          <div className="px-6 py-12 panel-inactive rounded-2xl text-center space-y-4">
            <p className="text-slate-300 font-semibold text-lg">No enriched leads found.</p>
            <div className="text-left bg-slate-900/60 backdrop-blur-sm p-6 rounded-xl border border-slate-700/50 max-w-2xl mx-auto shadow-lg">
              <p className="text-sm font-semibold text-slate-200 mb-3 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">To see enriched leads here:</p>
              <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside">
                <li>Go to the <Link href="/" className="text-blue-400 hover:text-purple-400 hover:underline transition-colors">Lead Generation page</Link></li>
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
                    <th className="px-2 py-2 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider" style={{ width: '13%' }}>Name</th>
                    <th className="px-2 py-2 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider" style={{ width: '10%' }}>Phone</th>
                    <th className="px-2 py-2 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider" style={{ width: '17%' }}>Email</th>
                    <th className="px-2 py-2 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider" style={{ width: '9%' }}>City</th>
                    <th className="px-2 py-2 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider" style={{ width: '5%' }}>State</th>
                    <th className="px-2 py-2 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider" style={{ width: '7%' }}>Zipcode</th>
                    <th className="px-2 py-2 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider" style={{ width: '5%' }}>Age</th>
                    <th className="px-2 py-2 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider" style={{ width: '8%' }}>Line Type</th>
                    <th className="px-2 py-2 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider" style={{ width: '9%' }}>Carrier</th>
                    <th className="px-2 py-2 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider" style={{ width: '9%' }}>Date Scraped</th>
                    <th className="px-2 py-2 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider" style={{ width: '5%' }}>DNC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                {sortedLeads.map((lead, index) => {
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
                    ? 'text-blue-400 font-semibold drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' 
                    : lead.lineType && lead.lineType !== 'N/A'
                    ? 'text-red-400 font-semibold drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]'
                    : 'text-slate-400';

                  return (
                    <tr 
                      key={index} 
                      className="group relative table-row-inactive"
                      style={{ animationDelay: `${index * 20}ms` }}
                    >
                      <td 
                        className="px-2 py-2 text-slate-100 font-semibold relative z-10 cursor-pointer transition-all duration-300 ease-out hover:scale-[1.02] hover:text-blue-400 group/name"
                        onClick={() => lead.name && copyToClipboard(lead.name, `name-${index}`)}
                        title={lead.name ? (lead.name.length > 30 ? lead.name : 'Click to copy') : ''}
                      >
                        <span className="flex items-center gap-1 relative z-10 min-w-0">
                          <span className="transition-all duration-300 group-hover/name:text-blue-400 truncate block max-w-full">{lead.name || 'N/A'}</span>
                          {lead.name && (
                            <span className="opacity-0 group-hover/name:opacity-100 transition-all duration-300 transform group-hover/name:scale-110 flex-shrink-0">
                              {copiedField === `name-${index}` ? (
                                <Check className="w-3 h-3 text-blue-400 drop-shadow-lg" />
                              ) : (
                                <Copy className="w-3 h-3 text-blue-400 drop-shadow-lg" />
                              )}
                            </span>
                          )}
                        </span>
                        {lead.name && (
                          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-purple-500/0 to-pink-500/0 group-hover/name:from-blue-500/5 group-hover/name:via-purple-500/5 group-hover/name:to-pink-500/5 rounded-lg transition-all duration-500 -z-0" />
                        )}
                      </td>
                      <EnrichableCell
                        value={lead.phone || ''}
                        fieldId={`phone-${index}`}
                        lead={lead}
                        index={index}
                        field="phone"
                        className="text-slate-100 whitespace-nowrap relative z-10"
                        truncate={false}
                      />
                      <EnrichableCell
                        value={lead.email || ''}
                        fieldId={`email-${index}`}
                        lead={lead}
                        index={index}
                        field="email"
                        className="text-slate-300 relative z-10"
                        truncate={true}
                      />
                      <CopyableCell 
                        value={lead.city || ''} 
                        fieldId={`city-${index}`}
                        className="text-slate-300 relative z-10"
                        truncate={true}
                      />
                      <CopyableCell 
                        value={getStateAbbreviation(lead.state)} 
                        fieldId={`state-${index}`}
                        className="text-slate-300 relative z-10"
                        truncate={false}
                      />
                      <CopyableCell 
                        value={lead.zipcode || ''} 
                        fieldId={`zipcode-${index}`}
                        className="text-slate-300 relative z-10"
                        truncate={false}
                      />
                      <td className="px-2 py-2 text-slate-300 relative z-10 cursor-pointer transition-all duration-300 ease-out hover:scale-[1.02] hover:text-blue-400 group/age">
                        <span className="flex items-center gap-1 relative z-10">
                          <span className="transition-all duration-300 group-hover/age:text-blue-400 text-xs">{age || 'N/A'}</span>
                          {age && (
                            <span className="opacity-0 group-hover/age:opacity-100 transition-all duration-300 transform group-hover/age:scale-110 flex-shrink-0" onClick={() => copyToClipboard(age, `age-${index}`)}>
                              {copiedField === `age-${index}` ? (
                                <Check className="w-3 h-3 text-blue-400 drop-shadow-lg" />
                              ) : (
                                <Copy className="w-3 h-3 text-blue-400 drop-shadow-lg" />
                              )}
                            </span>
                          )}
                        </span>
                        {age && (
                          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-purple-500/0 to-pink-500/0 group-hover/age:from-blue-500/5 group-hover/age:via-purple-500/5 group-hover/age:to-pink-500/5 rounded-lg transition-all duration-500 -z-0" />
                        )}
                      </td>
                      <td 
                        className={`px-2 py-2 ${lineTypeColor} cursor-pointer transition-all duration-300 ease-out group/line relative z-10 hover:scale-[1.05] hover:drop-shadow-lg`}
                        onClick={() => lead.lineType && lead.lineType !== 'N/A' && copyToClipboard(lead.lineType, `lineType-${index}`)}
                        title={lead.lineType && lead.lineType !== 'N/A' ? 'Click to copy' : ''}
                      >
                        <span className="flex items-center gap-1 relative z-10 min-w-0">
                          {lead.lineType && lead.lineType.toLowerCase() === 'mobile' ? (
                            <Smartphone className="w-3 h-3 text-blue-400 flex-shrink-0" />
                          ) : lead.lineType && (lead.lineType.toLowerCase().includes('fixed') || lead.lineType.toLowerCase().includes('landline')) ? (
                            <Phone className="w-3 h-3 text-red-400 flex-shrink-0" />
                          ) : null}
                          <span className="truncate block max-w-full text-xs">{lead.lineType || 'N/A'}</span>
                          {lead.lineType && lead.lineType !== 'N/A' && (
                            <span className="opacity-0 group-hover/line:opacity-100 transition-all duration-300 transform group-hover/line:scale-110 flex-shrink-0">
                              {copiedField === `lineType-${index}` ? (
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
                        fieldId={`carrier-${index}`}
                        className="text-slate-300 relative z-10"
                        truncate={true}
                      />
                      <CopyableCell 
                        value={lead.dateScraped ? formatDate(lead.dateScraped) : ''} 
                        fieldId={`dateScraped-${index}`}
                        className="text-slate-300 relative z-10"
                        truncate={false}
                      />
                      <td className="px-2 py-2 text-slate-300 relative z-10">
                        {isScrubbingDNC && (!lead.dncStatus || lead.dncStatus === 'UNKNOWN') ? (
                          <span className="badge badge-info">...</span>
                        ) : lead.dncStatus === 'YES' ? (
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
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
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
                    <div className="text-lg font-bold text-blue-400">{enrichmentStats.withPhone}</div>
                  </div>
                  <div className="panel-inactive p-3 rounded-lg">
                    <div className="text-xs text-slate-400 mb-1">With Email</div>
                    <div className="text-lg font-bold text-blue-400">{enrichmentStats.withEmail}</div>
                  </div>
                  <div className="panel-inactive p-3 rounded-lg">
                    <div className="text-xs text-slate-400 mb-1">With Zipcode</div>
                    <div className="text-lg font-bold text-blue-400">{enrichmentStats.withZipcode}</div>
                  </div>
                  <div className="panel-inactive p-3 rounded-lg">
                    <div className="text-xs text-slate-400 mb-1">Processed</div>
                    <div className="text-lg font-bold text-slate-200">{enrichmentStats.processed}</div>
                  </div>
                  {enrichmentStats.errors > 0 && (
                    <div className="status-error p-3 rounded-lg">
                      <div className="text-xs text-red-400 mb-1">Errors</div>
                      <div className="text-lg font-bold text-red-400">{enrichmentStats.errors}</div>
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
                          log.type === 'error' ? 'text-red-600' :
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
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-all"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </AppLayout>
  );
}
