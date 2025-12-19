'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Rocket, Users, Building2, Link2, ClipboardList, Eye, Zap, 
  CheckCircle, XCircle, Loader2, Download, DollarSign, Play,
  Search, Filter, FileDown, ArrowRight, Linkedin, Facebook, Sparkles, X
} from 'lucide-react';
import { ParsedData } from '@/utils/parseFile';
import { enrichData, EnrichedData, EnrichedRow, EnrichmentProgress } from '@/utils/enrichData';
import { extractLeadSummary, leadSummariesToCSV, LeadSummary } from '@/utils/extractLeadSummary';
import { DNCResult } from './USHAScrubber';
import LeadListViewer from './LeadListViewer';
import FacebookLeadGenerator from './FacebookLeadGenerator';
import type { LeadListItem, SourceDetails } from '@/types/leadList';

interface LeadResult {
  [key: string]: unknown;
}

interface APIProgress {
  apiName: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  progress: number;
    total: number;
  dataFields: string[];
  error?: string;
}

interface ScrapingProgress {
  currentPage: number;
  totalPages: number;
  leadsCollected: number;
  estimatedTotal: number;
  status: 'idle' | 'discovering-location' | 'fetching' | 'filtering' | 'completed' | 'error';
  currentOperation: string;
  startTime?: number;
  leadsPerSecond: number;
  estimatedTimeRemaining: number;
  leadsThisPage: number;
  averageLeadsPerPage: number;
  elapsedTime: number;
}

type WorkflowStep = 'search' | 'results' | 'enriching' | 'complete';
type TabType = 'linkedin' | 'facebook';

/**
 * Normalizes a name by removing credentials and suffixes after commas
 * Example: "Mona Baset, MBA, MA, CHCIO, CDH-E" -> "Mona Baset"
 */
function normalizeName(name: string): string {
  if (!name) return '';
  
  // Split by comma and take the first part (the actual name)
  const namePart = name.split(',')[0].trim();
  
  // Remove any trailing periods that might be from abbreviations
  return namePart.replace(/\.$/, '').trim();
}

/**
 * Extracts structured source details from LinkedIn search parameters
 */
function extractLinkedInSourceDetails(searchParams: Record<string, unknown>, lead?: any): SourceDetails {
  const sourceDetails: SourceDetails = {};
  
  // Extract job title/occupation
  if (lead?.currentPosition?.title || lead?.title || lead?.job_title || lead?.headline) {
    sourceDetails.jobTitle = lead.currentPosition?.title || lead.title || lead.job_title || lead.headline;
  } else if (searchParams.jobTitle || searchParams.title) {
    sourceDetails.jobTitle = String(searchParams.jobTitle || searchParams.title);
  }
  
  // Extract location
  if (lead?.geoRegion || lead?.location) {
    sourceDetails.location = lead.geoRegion || lead.location;
  } else if (searchParams.location) {
    sourceDetails.location = String(searchParams.location);
  }
  
  // Check for self-employed filter (company headcount = 'A')
  if (searchParams.companyHeadcount === 'A' || 
      (Array.isArray(searchParams.companyHeadcount) && searchParams.companyHeadcount.includes('A'))) {
    sourceDetails.isSelfEmployed = true;
  }
  
  // Check for job change filter (years in filter)
  if (searchParams.yearsIn) {
    const yearsIn = Array.isArray(searchParams.yearsIn) ? searchParams.yearsIn : [searchParams.yearsIn];
    const hasJobChange = yearsIn.some((y: any) => 
      String(y).toLowerCase().includes('changed') || 
      String(y).toLowerCase().includes('new')
    );
    if (hasJobChange) {
      sourceDetails.changedJobs = true;
    }
  }
  
  // Extract company size
  if (searchParams.companyHeadcount) {
    const headcount = searchParams.companyHeadcount;
    if (Array.isArray(headcount)) {
      sourceDetails.companySize = headcount.join(', ');
    } else {
      sourceDetails.companySize = String(headcount);
    }
  }
  
  // Use jobTitle as occupation if available
  if (sourceDetails.jobTitle) {
    sourceDetails.occupation = sourceDetails.jobTitle;
  }
  
  // Remove undefined values
  Object.keys(sourceDetails).forEach(key => {
    if (sourceDetails[key as keyof SourceDetails] === undefined) {
      delete sourceDetails[key as keyof SourceDetails];
    }
  });
  
  return sourceDetails;
}

export default function LinkedInLeadGenerator() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('linkedin');
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>('search');
  const [searchType, setSearchType] = useState<'person' | 'company' | 'person_via_url'>('person');
  const [searchParams, setSearchParams] = useState<Record<string, unknown>>({});
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<LeadResult[] | null>(null);
  const [retryAfterExpiration, setRetryAfterExpiration] = useState<number | null>(null); // Timestamp when retry is allowed
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Check for imported leads from enriched page on mount
  useEffect(() => {
    try {
      const importedLeadsStr = sessionStorage.getItem('importedLeads');
      if (importedLeadsStr) {
        const importedLeads = JSON.parse(importedLeadsStr);
        if (Array.isArray(importedLeads) && importedLeads.length > 0) {
          // Convert imported leads to LeadListItem format and add to leadList
          const newLeads: LeadListItem[] = importedLeads.map((lead: any, idx: number) => {
            const rawFullName = lead.fullName || lead.name || lead.full_name || 
              (lead.firstName || lead.first_name ? 
                `${lead.firstName || lead.first_name} ${lead.lastName || lead.last_name || ''}`.trim() : 
                'Unknown');
            const fullName = normalizeName(rawFullName);
            const nameParts = fullName.split(' ');
            const location = lead.geoRegion || lead.location || '';
      const locationParts = location.split(',').map((s: string) => s.trim());
      
            // Generate search filter from saved params
            const searchFilter = lead._searchParams ? 
              Object.entries(lead._searchParams)
                .filter(([k, v]) => v && k !== 'rapidApiKey' && k !== 'RAPIDAPI_KEY' && k !== 'endpoint')
                .map(([k, v]) => `${k}: ${v}`)
                .join(' | ') : 
              'From Saved Results';
            
      // Extract source details from saved search params
      const savedSourceDetails = lead._searchParams ? extractLinkedInSourceDetails(lead._searchParams, lead) : undefined;
      const sourceParts: string[] = ['LinkedIn'];
      if (savedSourceDetails?.location) sourceParts.push(savedSourceDetails.location);
      if (savedSourceDetails?.jobTitle) sourceParts.push(savedSourceDetails.jobTitle);
      const sourceString = sourceParts.length > 1 ? sourceParts.join(' - ') : searchFilter;
            
      return {
        id: `${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
        name: fullName,
              firstName: nameParts[0] || lead.first_name || '',
              lastName: nameParts.slice(1).join(' ') || lead.last_name || '',
              title: lead.currentPosition?.title || lead.title || lead.job_title || lead.headline || '',
              company: lead.currentPosition?.companyName || lead.company || lead.company_name || '',
        location,
        linkedinUrl: lead.navigationUrl || lead.linkedin_url || lead.profile_url || lead.url || '',
              phone: lead.phone || lead.phone_number || undefined,
        email: lead.email || undefined,
              city: lead.city || locationParts[0] || undefined,
              state: lead.state || locationParts[1] || undefined,
              zipCode: lead.zipCode || lead.zip_code || locationParts[2] || undefined,
        dateOfBirth: undefined,
        age: undefined,
        income: undefined,
        dncStatus: undefined,
        dncReason: undefined,
        canContact: undefined,
              addedAt: lead._sourceTimestamp || new Date().toISOString(),
              source: sourceString,
        platform: 'linkedin' as const,
        sourceDetails: savedSourceDetails && Object.keys(savedSourceDetails).length > 0 ? savedSourceDetails : undefined,
        enriched: false,
        dncChecked: false,
      };
    });

          // Add to leadList
          setLeadList(prev => {
            const existingUrls = new Set(prev.map(l => l.linkedinUrl).filter(Boolean));
    const uniqueNewLeads = newLeads.filter(lead => {
      if (lead.linkedinUrl && existingUrls.has(lead.linkedinUrl)) return false;
      return true;
    });
            return [...prev, ...uniqueNewLeads];
          });

          // Clear sessionStorage
          sessionStorage.removeItem('importedLeads');
          
          alert(`Imported ${newLeads.length} leads from saved results! They are now in your lead list. Click "Enrich All" to enrich them.`);
        }
      }
    } catch (error) {
      console.error('Error importing leads:', error);
    }
  }, []);
  const [paginationInfo, setPaginationInfo] = useState<{
    total: number;
    count: number;
    start: number;
    hasMore: boolean;
  } | null>(null);
  
  const [scrapingProgress, setScrapingProgress] = useState<ScrapingProgress>({
    currentPage: 0,
    totalPages: 0,
    leadsCollected: 0,
    estimatedTotal: 0,
    status: 'idle',
    currentOperation: '',
    leadsPerSecond: 0,
    estimatedTimeRemaining: 0,
    leadsThisPage: 0,
    averageLeadsPerPage: 0,
    elapsedTime: 0
  });
  
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichedData, setEnrichedData] = useState<EnrichedData | null>(null);
  const [enrichmentProgress, setEnrichmentProgress] = useState({ current: 0, total: 0 });
  const [detailedProgress, setDetailedProgress] = useState<EnrichmentProgress | null>(null);
  const [enrichmentErrors, setEnrichmentErrors] = useState<Array<{ lead: string; error: string; timestamp: number }>>([]);
  const [apiProgress, setApiProgress] = useState<APIProgress[]>([]);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [dncResults, setDncResults] = useState<DNCResult[]>([]);
  const [ushaToken, setUshaToken] = useState<string>('');
  const [jobLogID, setJobLogID] = useState<string | null>(null);
  const [leadSummaries, setLeadSummaries] = useState<LeadSummary[]>([]);
  const [sortField, setSortField] = useState<'state' | 'income' | 'none'>('none');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [enableDNCScrub, setEnableDNCScrub] = useState<boolean>(false);
  const [locationDiscoveryStatus, setLocationDiscoveryStatus] = useState<string | null>(null);
  const [fetchAllPages, setFetchAllPages] = useState<boolean>(true);
  const [maxPagesToFetch, setMaxPagesToFetch] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [leadList, setLeadList] = useState<LeadListItem[]>([]);
  const [showLeadList, setShowLeadList] = useState<boolean>(false);

  // Update elapsed time every second when searching
  useEffect(() => {
    if (!isSearching || !scrapingProgress.startTime) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - (scrapingProgress.startTime || Date.now())) / 1000);
      const leadsPerSecond = elapsed > 0 ? scrapingProgress.leadsCollected / elapsed : 0;
      const remainingLeads = Math.max(0, scrapingProgress.estimatedTotal - scrapingProgress.leadsCollected);
      const estimatedTimeRemaining = leadsPerSecond > 0 ? Math.floor(remainingLeads / leadsPerSecond) : 0;

      setScrapingProgress(prev => ({
        ...prev,
        elapsedTime: elapsed,
        leadsPerSecond: leadsPerSecond,
        estimatedTimeRemaining: estimatedTimeRemaining
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [isSearching, scrapingProgress.startTime, scrapingProgress.leadsCollected, scrapingProgress.estimatedTotal]);

  // Countdown timer for rate limits and account freezes
  useEffect(() => {
    if (!retryAfterExpiration) {
      setCountdownSeconds(0);
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((retryAfterExpiration - now) / 1000));
      setCountdownSeconds(remaining);

      if (remaining === 0) {
        setRetryAfterExpiration(null);
        setError(null); // Clear error when countdown expires
      }
    };

    // Update immediately
    updateCountdown();

    // Update every second
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [retryAfterExpiration]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000); // Auto-dismiss after 5 seconds
  };

  const initializeAPIProgress = () => {
    const apis: APIProgress[] = [
      { apiName: 'LinkedIn Sales Navigator', status: 'pending', progress: 0, total: 0, dataFields: ['Name', 'Title', 'Company', 'Location', 'LinkedIn URL'] },
      { apiName: 'Skip Tracing v1', status: 'pending', progress: 0, total: 0, dataFields: ['Email', 'Phone', 'Address'] },
      { apiName: 'Skip Tracing v2', status: 'pending', progress: 0, total: 0, dataFields: ['Address', 'Property Data'] },
      { apiName: 'Income by Zip', status: 'pending', progress: 0, total: 0, dataFields: ['Income'] },
      { apiName: 'Website Extractor', status: 'pending', progress: 0, total: 0, dataFields: ['Email', 'Social Links'] },
      { apiName: 'Website Contacts', status: 'pending', progress: 0, total: 0, dataFields: ['Contacts'] },
      { apiName: 'LinkedIn Profile', status: 'pending', progress: 0, total: 0, dataFields: ['Profile Data'] },
      { apiName: 'Fresh LinkedIn', status: 'pending', progress: 0, total: 0, dataFields: ['Detailed Profile'] },
      { apiName: 'Facebook Profile', status: 'pending', progress: 0, total: 0, dataFields: ['Photos'] },
    ];
    setApiProgress(apis);
  };

  const updateAPIProgress = (apiName: string, updates: Partial<APIProgress>) => {
    setApiProgress(prev => prev.map(api => 
      api.apiName === apiName ? { ...api, ...updates } : api
    ));
  };

  const addToLeadList = () => {
    if (!results || results.length === 0) {
      alert('No results to add');
      return;
    }

    const newLeads: LeadListItem[] = results.map((lead: any, idx) => {
      // Extract name - check camelCase first (API format), then snake_case, then construct
      const rawFullName = lead.fullName || lead.name || lead.full_name || 
        (lead.firstName || lead.first_name ? 
          `${lead.firstName || lead.first_name} ${lead.lastName || lead.last_name || ''}`.trim() : 
          'Unknown');
      // Normalize name to remove credentials (e.g., "Mona Baset, MBA, MA" -> "Mona Baset")
      const fullName = normalizeName(rawFullName);
      const nameParts = fullName.split(' ');
      const location = lead.geoRegion || lead.location || '';
      const locationParts = location.split(',').map((s: string) => s.trim());
      
      const sourceDetails = extractLinkedInSourceDetails(searchParams, lead);
      const sourceParts: string[] = ['LinkedIn'];
      if (sourceDetails.location) sourceParts.push(sourceDetails.location);
      if (sourceDetails.jobTitle) sourceParts.push(sourceDetails.jobTitle);
      const sourceString = sourceParts.join(' - ');
      
      return {
        id: `${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
        name: fullName,
        firstName: nameParts[0] || lead.first_name || '',
        lastName: nameParts.slice(1).join(' ') || lead.last_name || '',
        title: lead.title || lead.job_title || lead.headline || lead.currentPosition?.title || '',
        company: lead.company || lead.company_name || lead.currentPosition?.companyName || '',
        location,
        linkedinUrl: lead.navigationUrl || lead.linkedin_url || lead.profile_url || lead.url || '',
        phone: undefined,
        email: lead.email || undefined,
        city: locationParts[0] || undefined,
        state: locationParts[1] || undefined,
        zipCode: undefined,
        dateOfBirth: undefined,
        age: undefined,
        income: undefined,
        dncStatus: undefined,
        dncReason: undefined,
        canContact: undefined,
        addedAt: new Date().toISOString(),
        source: sourceString || `LinkedIn: ${searchParams.location || 'All'}`,
        platform: 'linkedin' as const,
        sourceDetails: Object.keys(sourceDetails).length > 0 ? sourceDetails : undefined,
        enriched: false,
        dncChecked: false,
      };
    });

    const existingUrls = new Set(leadList.map(l => l.linkedinUrl).filter(Boolean));
    const uniqueNewLeads = newLeads.filter(lead => {
      if (lead.linkedinUrl && existingUrls.has(lead.linkedinUrl)) return false;
      return true;
    });

    setLeadList(prev => [...prev, ...uniqueNewLeads]);
    alert(`Added ${uniqueNewLeads.length} new leads! (${newLeads.length - uniqueNewLeads.length} duplicates skipped)`);
  };

  const removeFromLeadList = (id: string) => {
    setLeadList(prev => prev.filter(lead => lead.id !== id));
  };

  const clearLeadList = () => {
    if (confirm(`Clear all ${leadList.length} leads?`)) {
      setLeadList([]);
    }
  };

  const testEnrichmentSingleLead = async () => {
    if (leadList.length === 0) {
      alert('No leads in the list to test. Add at least one lead first.');
      return;
    }

    const testLead = leadList[0];
    console.log('🧪 [TEST_ENRICH] Testing enrichment with single lead:', testLead.name);

    if (!confirm(`Test enrichment with "${testLead.name}"?\n\nThis will make real API calls but only for this one lead.`)) {
      return;
    }

    setIsEnriching(true);
    setError(null);
    setEnrichedData(null);
    setDncResults([]);
    setLeadSummaries([]);
    setWorkflowStep('enriching');
    initializeAPIProgress();

    try {
      // Convert single lead to ParsedData format
      const headers = ['Name', 'Title', 'Company', 'Location', 'LinkedIn URL', 'Email', 'Phone', 'First Name', 'Last Name', 'City', 'State', 'Zip', 'Platform', 'Source Details', 'Search Filter'];
      const location = testLead.location || '';
      const locationParts = location.split(',').map((s: string) => s.trim());
      const sourceDetailsStr = testLead.sourceDetails ? JSON.stringify(testLead.sourceDetails) : '';
      
      const row = {
        'Name': testLead.name || '',
        'Title': testLead.title || '',
        'Company': testLead.company || '',
        'Location': location,
        'LinkedIn URL': testLead.linkedinUrl || '',
        'Email': testLead.email || '',
        'Phone': testLead.phone || '',
        'First Name': testLead.firstName || '',
        'Last Name': testLead.lastName || '',
        'City': testLead.city || locationParts[0] || '',
        'State': testLead.state || locationParts[1] || '',
        'Zip': testLead.zipCode || locationParts[2] || '',
        'Platform': testLead.platform || 'linkedin',
        'Source Details': sourceDetailsStr,
        'Search Filter': testLead.source || 'Test Lead',
      };

      const parsedData = {
        headers,
        rows: [row],
        rowCount: 1,
        columnCount: headers.length,
      };

      console.log('🧪 [TEST_ENRICH] Converted test lead to parsed data:', {
        rowCount: parsedData.rowCount,
        hasEmail: !!row['Email'],
        hasPhone: !!row['Phone'],
        hasName: !!row['Name'],
      });

      updateAPIProgress('LinkedIn Sales Navigator', { status: 'completed', progress: 1, total: 1 });

      console.log('🧪 [TEST_ENRICH] Calling enrichData...');
      const enriched = await enrichData(parsedData, (current, total) => {
        console.log(`🧪 [TEST_ENRICH] Progress: ${current}/${total} (${Math.round((current/total)*100)}%)`);
        setEnrichmentProgress({ current, total });
        updateAPIProgress('Skip Tracing v1', { status: 'running', progress: current, total });
      });

      console.log('🧪 [TEST_ENRICH] ✅ Enrichment completed');
      setApiProgress(prev => prev.map(api => ({
        ...api,
        status: api.status === 'running' ? 'completed' : api.status,
        progress: api.status === 'running' ? api.total : api.progress
      })));

      setEnrichedData(enriched);

      // Extract lead summary
      const summary: LeadSummary = extractLeadSummary(enriched.rows[0], enriched.rows[0]._enriched);
      setLeadSummaries([summary]);

      // Show results in alert
      const results = [
        `Name: ${summary.name || 'N/A'}`,
        `Phone: ${summary.phone || 'N/A'} ${summary.phone ? '✅' : '❌'}`,
        `Email: ${summary.email || 'N/A'} ${summary.email ? '✅' : '❌'}`,
        `Zipcode: ${summary.zipcode || 'N/A'} ${summary.zipcode ? '✅' : '❌'}`,
        `Age/DOB: ${summary.dobOrAge || 'N/A'} ${summary.dobOrAge ? '✅' : '❌'}`,
        `Line Type: ${summary.lineType || 'N/A'} ${summary.lineType ? '✅' : '❌'}`,
        `Carrier: ${summary.carrier || 'N/A'} ${summary.carrier ? '✅' : '❌'}`,
      ].join('\n');

      alert(`🧪 Test Enrichment Results:\n\n${results}\n\n✅ Check browser console for detailed logs.`);

      // Save to localStorage for viewing on enriched page
      try {
        const existingLeads = localStorage.getItem('enrichedLeads');
        const existing = existingLeads ? JSON.parse(existingLeads) : [];
        const combined = [...existing, summary];
        localStorage.setItem('enrichedLeads', JSON.stringify(combined));
        console.log('🧪 [TEST_ENRICH] Saved test result to localStorage');
        window.dispatchEvent(new Event('enrichedLeadsUpdated'));
      } catch (error) {
        console.error('🧪 [TEST_ENRICH] Failed to save to localStorage:', error);
      }

      setWorkflowStep('complete');
      console.log('🧪 [TEST_ENRICH] ✅ Test complete');
    } catch (err) {
      console.error('🧪 [TEST_ENRICH] ❌ Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to test enrichment');
      setApiProgress(prev => prev.map(api => 
        api.status === 'running' ? { ...api, status: 'error' } : api
      ));
    } finally {
      setIsEnriching(false);
    }
  };

  const enrichAllLeadsFromList = async () => {
    if (leadList.length === 0) {
      alert('No leads in the list to enrich. Add leads first.');
      return;
    }

    if (!confirm(`Enrich all ${leadList.length} leads from your list? This may take a while.`)) {
      return;
    }

    console.log('✨ [ENRICH_LIST] Starting enrichment of leadList leads');
    setIsEnriching(true);
    setError(null);
    setEnrichedData(null);
    setDncResults([]);
    setLeadSummaries([]);
    setWorkflowStep('enriching');
    initializeAPIProgress();

    try {
      // Convert leadList items to ParsedData format
      const headers = ['Name', 'Title', 'Company', 'Location', 'LinkedIn URL', 'Email', 'Phone', 'First Name', 'Last Name', 'City', 'State', 'Zip', 'Platform', 'Source Details', 'Search Filter'];
      const rows = leadList.map((lead) => {
        const location = lead.location || '';
        const locationParts = location.split(',').map((s: string) => s.trim());
        
        // Serialize sourceDetails to JSON string for storage
        const sourceDetailsStr = lead.sourceDetails ? JSON.stringify(lead.sourceDetails) : '';
        
        return {
          'Name': lead.name || '',
          'Title': lead.title || '',
          'Company': lead.company || '',
          'Location': location,
          'LinkedIn URL': lead.linkedinUrl || '',
          'Email': lead.email || '',
          'Phone': lead.phone || '',
          'First Name': lead.firstName || '',
          'Last Name': lead.lastName || '',
          'City': lead.city || locationParts[0] || '',
          'State': lead.state || locationParts[1] || '',
          'Zip': lead.zipCode || locationParts[2] || '',
          'Platform': lead.platform || '',
          'Source Details': sourceDetailsStr,
          'Search Filter': lead.source || 'From Lead List',
        };
      });

    const parsedData = {
      headers,
      rows,
        rowCount: rows.length,
        columnCount: headers.length,
      };

      console.log('✨ [ENRICH_LIST] Converted leadList to parsed data:', {
        rowCount: parsedData.rowCount,
        headers: parsedData.headers,
      });

      updateAPIProgress('LinkedIn Sales Navigator', { status: 'completed', progress: leadList.length, total: leadList.length });

      console.log('✨ [ENRICH_LIST] Calling enrichData...');
      const enriched = await enrichData(parsedData, (current, total) => {
        console.log(`✨ [ENRICH_LIST] Progress: ${current}/${total} (${Math.round((current/total)*100)}%)`);
        setEnrichmentProgress({ current, total });
        const phase = Math.floor((current / total) * 9);
        if (phase >= 1) updateAPIProgress('Skip Tracing v1', { status: 'running', progress: current, total });
        if (phase >= 2) updateAPIProgress('Skip Tracing v2', { status: 'running', progress: current, total });
        if (phase >= 3) updateAPIProgress('Income by Zip', { status: 'running', progress: current, total });
        if (phase >= 4) updateAPIProgress('Website Extractor', { status: 'running', progress: current, total });
        if (phase >= 5) updateAPIProgress('Website Contacts', { status: 'running', progress: current, total });
        if (phase >= 6) updateAPIProgress('LinkedIn Profile', { status: 'running', progress: current, total });
        if (phase >= 7) updateAPIProgress('Fresh LinkedIn', { status: 'running', progress: current, total });
        if (phase >= 8) updateAPIProgress('Facebook Profile', { status: 'running', progress: current, total });
      });

      console.log('✨ [ENRICH_LIST] ✅ Enrichment completed');
      setApiProgress(prev => prev.map(api => ({
        ...api,
        status: api.status === 'running' ? 'completed' : api.status,
        progress: api.status === 'running' ? api.total : api.progress
      })));

      setEnrichedData(enriched);

      // Extract lead summaries
      // Extract summaries and filter out email-only leads (require phone)
      const allSummaries: LeadSummary[] = enriched.rows.map((row: EnrichedRow) => extractLeadSummary(row, row._enriched));
      const summaries = allSummaries.filter((lead: LeadSummary) => {
        const phone = (lead.phone || '').trim().replace(/\D/g, '');
        const hasValidPhone = phone.length >= 10;
        if (!hasValidPhone) {
          console.log(`🚫 [ENRICH_LIST] Filtering out lead "${lead.name}" - no valid phone number (email-only leads excluded)`);
        }
        return hasValidPhone;
      });
      console.log(`✨ [ENRICH_LIST] Filtered to ${summaries.length} leads with phone (removed ${allSummaries.length - summaries.length} email-only leads)`);
      setLeadSummaries(summaries);

      // Save enriched leads to localStorage for the enriched leads page
      try {
        const existingLeads = localStorage.getItem('enrichedLeads');
        const existing = existingLeads ? JSON.parse(existingLeads) : [];
        const combined = [...existing, ...summaries];
        localStorage.setItem('enrichedLeads', JSON.stringify(combined));
        console.log('✨ [ENRICH_LIST] Saved enriched leads to localStorage:', combined.length);
        
        // Dispatch custom event to notify other components
        window.dispatchEvent(new Event('enrichedLeadsUpdated'));
      } catch (error) {
        console.error('✨ [ENRICH_LIST] Failed to save enriched leads to localStorage:', error);
      }

      // Aggregate and save enriched leads to server (enriched-all-leads.json)
      try {
        console.log('✨ [ENRICH_LIST] Aggregating enriched leads to server...');
        const aggregateResponse = await fetch('/api/aggregate-enriched-leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newLeads: summaries }),
        });
        
        if (aggregateResponse.ok) {
          const aggregateData = await aggregateResponse.json();
          const totalLeads = aggregateData.totalLeads || summaries.length;
          const newLeadsAdded = aggregateData.newLeadsAdded || summaries.length;
          console.log('✨ [ENRICH_LIST] ✅ Aggregated and saved leads to server:', {
            totalLeads,
            newLeadsAdded,
            message: aggregateData.message
          });

          // Show toast notification
          showToast(`${newLeadsAdded} enriched lead${newLeadsAdded === 1 ? '' : 's'} added to brainscraper database`, 'success');
          
          // Redirect to enriched leads page
          router.push('/enriched');
        } else {
          const errorText = await aggregateResponse.text();
          console.error('✨ [ENRICH_LIST] ❌ Failed to aggregate leads on server:', errorText);
          showToast('Failed to save enriched leads to database', 'error');
        }
      } catch (aggregateError) {
        console.error('✨ [ENRICH_LIST] ❌ Error aggregating leads:', aggregateError);
        showToast('Error saving enriched leads to database', 'error');
        // Don't fail the enrichment if aggregation fails, but log it
      }

      // Update leadList to mark leads as enriched
      setLeadList(prev => prev.map(lead => ({ ...lead, enriched: true })));

      // Route enriched leads to configured destination
      try {
        const response = await fetch('/api/settings');
        const data = await response.json();
        if (data.success && data.settings) {
          const destination = data.settings.output?.defaultDestination || 'csv';
          if (destination === 'webhook' && data.settings.output?.webhookUrl) {
            // Webhook routing is handled by backend during enrichment
            // This is just for synchronous enrichment completion
            console.log('[ENRICH_LIST] Leads will be routed to webhook if configured');
          }
        }
      } catch (routingError) {
        console.warn('[ENRICH_LIST] Failed to check output routing:', routingError);
      }

      // Don't set workflowStep to 'complete' - we're redirecting to /enriched instead
      console.log('✨ [ENRICH_LIST] ✅ Successfully completed enrichment and redirected');
    } catch (err) {
      console.error('✨ [ENRICH_LIST] ❌ Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to enrich leads');
      setApiProgress(prev => prev.map(api => 
        api.status === 'running' ? { ...api, status: 'error' } : api
      ));
    } finally {
      setIsEnriching(false);
    }
  };

  const exportLeadList = () => {
    if (leadList.length === 0) {
      alert('No leads to export');
      return;
    }

    const headers = ['Name', 'First Name', 'Last Name', 'Phone', 'Email', 'Date of Birth', 'Age', 'City', 'State', 'Zip Code', 'Income', 'DNC Status', 'Can Contact', 'Title', 'Company', 'LinkedIn URL', 'Added At', 'Source', 'Enriched', 'DNC Checked'];
    const rows = leadList.map(lead => [
      lead.name, lead.firstName || '', lead.lastName || '', lead.phone || '', lead.email || '',
      lead.dateOfBirth || '', lead.age || '', lead.city || '', lead.state || '', lead.zipCode || '',
      lead.income || '', lead.dncStatus || '', lead.canContact !== undefined ? (lead.canContact ? 'Yes' : 'No') : '',
      lead.title || '', lead.company || '', lead.linkedinUrl || '', lead.addedAt, lead.source,
      lead.enriched ? 'Yes' : 'No', lead.dncChecked ? 'Yes' : 'No'
    ]);

    const csv = [headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lead-list-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Format countdown seconds to MM:SS or HH:MM:SS
  const formatCountdown = (seconds: number): string => {
    if (seconds <= 0) return '0:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  };

  const handleSearch = async () => {
    // Prevent concurrent searches - if already searching, ignore new request
    if (isSearching) {
      console.warn('🔍 [SEARCH] ⚠️ Search already in progress, ignoring duplicate request');
      return;
    }
    
    // Check if still in countdown period
    if (retryAfterExpiration && Date.now() < retryAfterExpiration) {
      const remaining = Math.ceil((retryAfterExpiration - Date.now()) / 1000);
      console.warn(`🔍 [SEARCH] ⚠️ Still in cooldown period, ${remaining} seconds remaining`);
      return;
    }
    
    console.log('🔍 [SEARCH] Starting handleSearch');
    console.log('🔍 [SEARCH] Search params:', JSON.stringify(searchParams, null, 2));
    console.log('🔍 [SEARCH] Search type:', searchType);
    console.log('🔍 [SEARCH] Fetch all pages:', fetchAllPages);
    
    setIsSearching(true);
    setError(null);
    setResults(null);
    setRetryAfterExpiration(null); // Clear any previous retry expiration
    setWorkflowStep('search');
    setScrapingProgress({
      currentPage: 0,
      totalPages: 0,
      leadsCollected: 0,
      estimatedTotal: 0,
      status: 'fetching',
      currentOperation: 'Initializing search...',
      leadsPerSecond: 0,
      estimatedTimeRemaining: 0,
      leadsThisPage: 0,
      averageLeadsPerPage: 0,
      elapsedTime: 0
    });

    try {
      if (searchParams.location) {
        console.log('🔍 [SEARCH] Location provided:', searchParams.location);
        setScrapingProgress(prev => ({
          ...prev,
          status: 'discovering-location',
          currentOperation: `Discovering location ID for: ${searchParams.location}`
        }));
      }

      if (fetchAllPages) {
        console.log('🔍 [SEARCH] Using fetchAllPagesSequentially');
        await fetchAllPagesSequentially();
        return;
      }
      
      console.log('🔍 [SEARCH] Using single page fetch');
      
      let endpoint: string;
      let requestBody: Record<string, unknown>;

      if (searchType === 'person_via_url') {
        endpoint = 'premium_search_person_via_url';
        if (!searchParams.url || typeof searchParams.url !== 'string') {
          throw new Error('URL parameter is required');
        }
        requestBody = { endpoint, url: searchParams.url };
      } else {
        endpoint = searchType === 'person' ? 'premium_search_person' : 'premium_search_company';
        const params: Record<string, unknown> = { ...searchParams };
        if (!params.page) params.page = 1;
        // Set limit to 100 per page if not specified (API defaults to 25, but we want more)
        if (!params.limit) params.limit = 100;
        requestBody = { endpoint, ...params };
        console.log('🔍 [SEARCH] Built request body:', JSON.stringify(requestBody, null, 2));
      }

      const startTime = Date.now();
      setScrapingProgress(prev => ({
        ...prev,
        status: 'fetching',
        currentOperation: 'Fetching leads from LinkedIn...',
        startTime: startTime,
        leadsPerSecond: 0,
        estimatedTimeRemaining: 0,
        leadsThisPage: 0,
        averageLeadsPerPage: 0,
        elapsedTime: 0
      }));

      console.log('🔍 [SEARCH] Making API request to /api/linkedin-sales-navigator');
      console.log('🔍 [SEARCH] Request body:', JSON.stringify(requestBody, null, 2));

      const response = await fetch('/api/linkedin-sales-navigator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      console.log('🔍 [SEARCH] API response status:', response.status);
      console.log('🔍 [SEARCH] API response ok:', response.ok);

      const result = await response.json();
      console.log('🔍 [SEARCH] API response result keys:', Object.keys(result));
      console.log('🔍 [SEARCH] API response result:', JSON.stringify(result, null, 2).substring(0, 1000));

      if (!response.ok) {
        console.error('🔍 [SEARCH] ❌ API response not ok');
        console.error('🔍 [SEARCH] Response status:', response.status);
        console.error('🔍 [SEARCH] Response result:', JSON.stringify(result, null, 2));
        
        if (response.status === 429 || result.isRateLimit) {
          const retryAfter = result.retryAfter || 60;
          console.error('🔍 [SEARCH] Rate limit exceeded, retry after:', retryAfter);
          setError(`Rate limit exceeded. Please wait ${retryAfter} seconds.`);
          // Set retry expiration time for countdown
          setRetryAfterExpiration(Date.now() + (retryAfter * 1000));
          setScrapingProgress(prev => ({ ...prev, status: 'error', currentOperation: 'Rate limited' }));
          return;
        }
        
        // Check for account freeze in error message
        const errorMsg = result.message || result.error || 'Failed to process request';
        if (errorMsg.toLowerCase().includes('frozen') || errorMsg.toLowerCase().includes('60 mins')) {
          const freezeMatch = errorMsg.match(/(\d+)\s*(mins?|minutes?|hours?)/i);
          const freezeDuration = freezeMatch ? parseInt(freezeMatch[1], 10) * 60 : 3600; // Convert to seconds
          const freezeDurationMinutes = Math.ceil(freezeDuration / 60);
          
          // Log freeze with timestamps
          const freezeStartTime = new Date();
          const freezeExpirationTime = new Date(Date.now() + (freezeDuration * 1000));
          console.error(`🔍 [SEARCH] 🔴 ACCOUNT FROZEN - DETAILED LOG`);
          console.error(`   Freeze Start: ${freezeStartTime.toISOString()}`);
          console.error(`   Freeze Duration: ${freezeDurationMinutes} minutes (${freezeDuration} seconds)`);
          console.error(`   Freeze Expires: ${freezeExpirationTime.toISOString()}`);
          console.error(`   Time Until Expiry: ${freezeDurationMinutes} minutes`);
          console.error(`   Message: ${errorMsg}`);
          
          setError(errorMsg);
          // Set retry expiration time for countdown
          setRetryAfterExpiration(Date.now() + (freezeDuration * 1000));
          setScrapingProgress(prev => ({ ...prev, status: 'error', currentOperation: 'Account frozen' }));
          return;
        }
        
        // Generic error handling
        console.error('🔍 [SEARCH] Setting error:', errorMsg);
        setError(errorMsg);
        setScrapingProgress(prev => ({ ...prev, status: 'error', currentOperation: 'Error occurred' }));
        return;
      }

      if (result.data) {
        console.log('🔍 [SEARCH] Result has data property');
        console.log('🔍 [SEARCH] Result.data type:', typeof result.data);
        console.log('🔍 [SEARCH] Result.data is array:', Array.isArray(result.data));
        console.log('🔍 [SEARCH] Result.data keys:', result.data && typeof result.data === 'object' ? Object.keys(result.data) : 'N/A');
        
        let rawResults: any[] = [];
        let paginationInfo: any = null;
        
        if (result.data.response?.data && Array.isArray(result.data.response.data)) {
          console.log('🔍 [SEARCH] Found results in result.data.response.data');
          rawResults = result.data.response.data;
          paginationInfo = result.data.response.pagination || result.pagination;
          console.log('🔍 [SEARCH] Raw results count:', rawResults.length);
          console.log('🔍 [SEARCH] Pagination info:', JSON.stringify(paginationInfo, null, 2));
        } else if (result.data.data && Array.isArray(result.data.data)) {
          console.log('🔍 [SEARCH] Found results in result.data.data');
          rawResults = result.data.data;
          paginationInfo = result.data.pagination || result.pagination;
          console.log('🔍 [SEARCH] Raw results count:', rawResults.length);
          console.log('🔍 [SEARCH] Pagination info:', JSON.stringify(paginationInfo, null, 2));
        } else if (Array.isArray(result.data)) {
          console.log('🔍 [SEARCH] Found results in result.data (direct array)');
          rawResults = result.data;
          paginationInfo = result.pagination;
          console.log('🔍 [SEARCH] Raw results count:', rawResults.length);
          console.log('🔍 [SEARCH] Pagination info:', JSON.stringify(paginationInfo, null, 2));
        } else {
          console.log('🔍 [SEARCH] ⚠️ No results found in expected locations');
          console.log('🔍 [SEARCH] Result.data structure:', JSON.stringify(result.data, null, 2).substring(0, 500));
        }

        console.log('🔍 [SEARCH] Processing results...');
        console.log('🔍 [SEARCH] Raw results count:', rawResults.length);
        console.log('🔍 [SEARCH] Has location filter:', !!searchParams.location);
        
        if (searchParams.location && rawResults.length > 0) {
          console.log('🔍 [SEARCH] Filtering results by location:', searchParams.location);
          setScrapingProgress(prev => ({
            ...prev,
            status: 'filtering',
            currentOperation: `Filtering ${rawResults.length} leads by location...`
          }));

          const { filterLeadsByLocation } = await import('@/utils/locationValidation');
          const requestedLocation = String(searchParams.location);
          const { filtered, stats } = filterLeadsByLocation(rawResults, requestedLocation);
          
          console.log('🔍 [SEARCH] Filtered results:', filtered.length, 'of', rawResults.length);
          console.log('🔍 [SEARCH] Filter stats:', stats);
          
          setResults(filtered);
          setLocationValidationStats(stats);
          setLocationDiscoveryStatus(`${stats.kept} leads match "${requestedLocation}"`);
            } else {
          console.log('🔍 [SEARCH] No location filter, setting all results');
          setResults(rawResults);
        }

        console.log('🔍 [SEARCH] Setting pagination info:', JSON.stringify(paginationInfo, null, 2));
        setPaginationInfo(paginationInfo);
        
        // Calculate final metrics for single page fetch
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const leadsPerSecond = elapsed > 0 ? rawResults.length / elapsed : 0;
        const leadsThisPage = rawResults.length;
        
        setScrapingProgress(prev => ({
          ...prev,
          status: 'completed',
          leadsCollected: rawResults.length,
          currentOperation: `Complete: ${rawResults.length} leads`,
          leadsPerSecond: leadsPerSecond,
          estimatedTimeRemaining: 0,
          leadsThisPage: leadsThisPage,
          averageLeadsPerPage: leadsThisPage,
          elapsedTime: elapsed
        }));
        // Always move to results step, even if empty
        console.log('🔍 [SEARCH] Setting workflow step to "results"');
        setWorkflowStep('results');
        console.log('🔍 [SEARCH] ✅ Successfully completed single page search');
          } else {
        console.log('🔍 [SEARCH] ⚠️ No data in result.data');
        console.log('🔍 [SEARCH] Result structure:', JSON.stringify(result, null, 2).substring(0, 500));
        // No data returned - still show results step with empty state
        setResults([]);
        setWorkflowStep('results');
        setScrapingProgress(prev => ({
          ...prev,
          status: 'completed',
          currentOperation: 'No results found'
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setScrapingProgress(prev => ({ ...prev, status: 'error', currentOperation: 'Error occurred' }));
      // Still show results step even on error, with empty results
      setResults([]);
      setWorkflowStep('results');
    } finally {
      setIsSearching(false);
    }
  };

  const fetchAllPagesSequentially = async () => {
    console.log('📄 [PAGINATION] Starting fetchAllPagesSequentially');
    console.log('📄 [PAGINATION] Max pages to fetch:', maxPagesToFetch);
    console.log('📄 [PAGINATION] Search params limit:', searchParams.limit);

    const allResults: LeadResult[] = [];
    let page = 1;
    let hasMore = true;
    const maxPages = maxPagesToFetch;
    const maxResults = parseInt(String(searchParams.limit || '2500')) || 2500;
    let consecutive429Errors = 0;
    // Calculate delay to match rate limiter: 5 requests per minute = 12 seconds between requests
    // Use 13 seconds to be conservative and account for processing time
    const rateLimitPerMinute = parseInt(process.env.RAPIDAPI_RATE_LIMIT_MAX || '5', 10);
    const calculatedDelayMs = Math.ceil((60 * 1000) / rateLimitPerMinute); // 12000ms = 12 seconds for 5/min
    const MINIMUM_DELAY_MS = Math.max(calculatedDelayMs, 13000); // Minimum 13 seconds between pages to respect rate limits
    let baseDelayMs = MINIMUM_DELAY_MS; // Use constant to prevent accidental resets
    
    // Circuit breaker: if we get too many consecutive 429s, stop early
    const CIRCUIT_BREAKER_THRESHOLD = 3; // Stop after 3 consecutive 429s

    console.log('📄 [PAGINATION] Max results target:', maxResults);
    
    const startTime = Date.now();
    setScrapingProgress({
      currentPage: 0,
      totalPages: maxPages,
      leadsCollected: 0,
      estimatedTotal: maxResults,
      status: 'fetching',
      currentOperation: 'Starting multi-page fetch...',
      startTime: startTime,
      leadsPerSecond: 0,
      estimatedTimeRemaining: 0,
      leadsThisPage: 0,
      averageLeadsPerPage: 0,
      elapsedTime: 0
    });
    
    try {
      while (hasMore && page <= maxPages && allResults.length < maxResults) {
        console.log(`📄 [PAGINATION] === Fetching page ${page} ===`);
        console.log(`📄 [PAGINATION] Has more: ${hasMore}, Page: ${page}, Max pages: ${maxPages}, Results so far: ${allResults.length}, Max results: ${maxResults}`);
        
        setCurrentPage(page);
        setScrapingProgress(prev => ({
          ...prev,
          currentPage: page,
          currentOperation: `Fetching page ${page}/${maxPages}...`
        }));
        
        // Calculate delay with exponential backoff for rate limits
        const currentDelay = baseDelayMs + (consecutive429Errors * 1000); // Add 1 second per consecutive 429
        if (page > 1) {
          console.log(`📄 [PAGINATION] Waiting ${currentDelay}ms before next page (${consecutive429Errors} consecutive 429s)...`);
          await new Promise(resolve => setTimeout(resolve, currentDelay));
        }
        
        console.log(`📄 [PAGINATION] Calling fetchSinglePage(${page})`);
        
        // Industry-standard retry with exponential backoff, jitter, and Retry-After header respect
        let pageResults: { leads: LeadResult[]; pagination: any } | null = null;
        let retryCount = 0;
        const maxRetries = 3;
        const baseBackoffMs = 2000; // 2 seconds base
        
        // Retry loop with exponential backoff + jitter (prevents thundering herd problem)
        while (retryCount <= maxRetries) {
          try {
            pageResults = await fetchSinglePage(page);
            
            // Success - reset rate limit tracking (but keep minimum delay)
            if (consecutive429Errors > 0) {
              console.log(`📄 [PAGINATION] ✅ Recovered from rate limit, resetting adaptive delays`);
              consecutive429Errors = 0;
              baseDelayMs = MINIMUM_DELAY_MS; // Reset to minimum, not 2 seconds!
            }
            break; // Success, exit retry loop
            
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Check if it's an account freeze (should stop immediately, no retries)
            const isAccountFrozen = errorMessage.includes('ACCOUNT_FROZEN:');
            
            if (isAccountFrozen) {
              // Account freeze - stop immediately, don't retry
              const match = errorMessage.match(/ACCOUNT_FROZEN:(\d+):(.+)/);
              const freezeDurationSeconds = match ? parseInt(match[1], 10) : 3600;
              const freezeMessage = match ? match[2] : errorMessage;
              const freezeDurationMinutes = Math.ceil(freezeDurationSeconds / 60);
              
              // Log freeze with timestamps
              const freezeStartTime = new Date();
              const freezeExpirationTime = new Date(Date.now() + (freezeDurationSeconds * 1000));
              console.error(`📄 [PAGINATION] 🔴 ACCOUNT FROZEN - DETAILED LOG`);
              console.error(`   Freeze Start: ${freezeStartTime.toISOString()}`);
              console.error(`   Freeze Duration: ${freezeDurationMinutes} minutes (${freezeDurationSeconds} seconds)`);
              console.error(`   Freeze Expires: ${freezeExpirationTime.toISOString()}`);
              console.error(`   Time Until Expiry: ${freezeDurationMinutes} minutes`);
              console.error(`   Message: ${freezeMessage}`);
              
              setError(freezeMessage || `Account frozen for ${freezeDurationMinutes} minutes. Please wait before trying again.`);
              // Set retry expiration time for countdown
              setRetryAfterExpiration(Date.now() + (freezeDurationSeconds * 1000));
              setScrapingProgress(prev => ({ 
                ...prev, 
                status: 'error', 
                currentOperation: `Account frozen - please wait ${freezeDurationMinutes} minutes` 
              }));
              
              // Return partial results if we have any
              if (allResults.length > 0) {
                console.log(`📄 [PAGINATION] Returning ${allResults.length} leads collected before account freeze`);
                setResults(allResults);
                setWorkflowStep('results');
              }
              return; // Exit immediately - no retries for account freezes
            }
            
            // Check if it's a rate limit error (429) - can retry with backoff
            const isRateLimit = errorMessage.includes('RATE_LIMIT:') || 
                               errorMessage.includes('429') || 
                               errorMessage.includes('Rate limit');
            
            if (isRateLimit) {
              consecutive429Errors++;
              const match = errorMessage.match(/RATE_LIMIT:(\d+):/);
              const retryAfterSeconds = match ? parseInt(match[1], 10) : 60;
              
              // Circuit breaker: if too many consecutive 429s across pages, stop early
              if (consecutive429Errors >= CIRCUIT_BREAKER_THRESHOLD) {
                console.error(`📄 [PAGINATION] 🔴 Circuit breaker triggered: ${consecutive429Errors} consecutive rate limits. Stopping pagination.`);
                setError(`Rate limit exceeded multiple times. Please wait ${retryAfterSeconds} seconds before trying again.`);
                // Set retry expiration time for countdown
                setRetryAfterExpiration(Date.now() + (retryAfterSeconds * 1000));
                setScrapingProgress(prev => ({ 
                  ...prev, 
                  status: 'error', 
                  currentOperation: `Circuit breaker: too many rate limits` 
                }));
                
                // Return partial results
                if (allResults.length > 0) {
                  console.log(`📄 [PAGINATION] Returning ${allResults.length} leads collected before circuit breaker`);
                  setResults(allResults);
                  setWorkflowStep('results');
                }
                return; // Exit gracefully
              }
              
              if (retryCount < maxRetries) {
                // Industry-standard exponential backoff with jitter
                // Formula: retryAfter + (base * 2^retryCount) + random jitter (0-25%)
                // This prevents thundering herd and respects server's Retry-After header
                const exponentialDelay = baseBackoffMs * Math.pow(2, retryCount);
                const jitter = Math.random() * exponentialDelay * 0.25; // 0-25% randomization
                const backoffDelay = Math.min(
                  retryAfterSeconds * 1000 + exponentialDelay + jitter,
                  300000 // Max 5 minutes (industry standard cap)
                );
                
                console.warn(`📄 [PAGINATION] ⚠️ Rate limit (429) on page ${page}, attempt ${retryCount + 1}/${maxRetries + 1}`);
                console.warn(`📄 [PAGINATION] Backoff: ${Math.round(backoffDelay / 1000)}s (retryAfter: ${retryAfterSeconds}s + exp: ${Math.round(exponentialDelay / 1000)}s + jitter: ${Math.round(jitter / 1000)}s)`);
                
                setScrapingProgress(prev => ({
                  ...prev,
                  currentOperation: `Rate limited - waiting ${Math.round(backoffDelay / 1000)}s before retry (${retryCount + 1}/${maxRetries})...`
                }));
                
                await new Promise(resolve => setTimeout(resolve, Math.round(backoffDelay)));
                retryCount++;
                
                // Adaptive delay increase for subsequent pages (circuit breaker pattern)
                baseDelayMs = Math.min(baseDelayMs * 1.5, 10000); // Max 10 seconds between pages
                continue; // Retry
              } else {
                // Max retries exceeded - stop gracefully with partial results
                console.error(`📄 [PAGINATION] ❌ Rate limit exceeded after ${maxRetries} retries. Stopping pagination.`);
                const finalRetryAfter = retryAfterSeconds;
                setError(`Rate limit exceeded. Please wait ${finalRetryAfter} seconds before trying again.`);
                // Set retry expiration time for countdown
                setRetryAfterExpiration(Date.now() + (finalRetryAfter * 1000));
                setScrapingProgress(prev => ({ 
                  ...prev, 
                  status: 'error', 
                  currentOperation: `Rate limited - please wait ${finalRetryAfter}s` 
                }));
                
                // Return partial results if we have any (graceful degradation)
                if (allResults.length > 0) {
                  console.log(`📄 [PAGINATION] Returning ${allResults.length} leads collected before rate limit`);
                  setResults(allResults);
                  setWorkflowStep('results');
                }
                return; // Exit function gracefully
              }
            } else {
              // Non-rate-limit error - throw immediately (don't retry non-retryable errors)
              throw error;
            }
          }
        }
        
        if (!pageResults) {
          console.log(`📄 [PAGINATION] ⚠️ Failed to fetch page ${page} after ${maxRetries} retries`);
          // Graceful degradation: return partial results if available
          if (allResults.length > 0) {
            console.log(`📄 [PAGINATION] Returning ${allResults.length} leads collected so far`);
            setResults(allResults);
            setWorkflowStep('results');
          }
          break;
        }
        
        console.log(`📄 [PAGINATION] Page ${page} results:`, pageResults ? {
          leadsCount: pageResults.leads?.length || 0,
          hasPagination: !!pageResults.pagination,
          pagination: pageResults.pagination
        } : 'null');
        
        if (!pageResults.leads || pageResults.leads.length === 0) {
          console.log(`📄 [PAGINATION] ⚠️ No results for page ${page}, stopping`);
          break;
        }
        
        allResults.push(...pageResults.leads);
        console.log(`📄 [PAGINATION] Page ${page} added ${pageResults.leads.length} leads. Total: ${allResults.length}`);
        
        // Calculate real-time metrics
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const leadsPerSecond = elapsed > 0 ? allResults.length / elapsed : 0;
        const remainingLeads = Math.max(0, maxResults - allResults.length);
        const estimatedTimeRemaining = leadsPerSecond > 0 ? Math.floor(remainingLeads / leadsPerSecond) : 0;
        const averageLeadsPerPage = page > 0 ? allResults.length / page : 0;
        const leadsThisPage = pageResults.leads.length;
        
        setScrapingProgress(prev => ({
          ...prev,
          currentPage: page,
          leadsCollected: allResults.length,
          currentOperation: `Page ${page}: ${leadsThisPage} leads (Total: ${allResults.length})`,
          leadsPerSecond: leadsPerSecond,
          estimatedTimeRemaining: estimatedTimeRemaining,
          leadsThisPage: leadsThisPage,
          averageLeadsPerPage: averageLeadsPerPage,
          elapsedTime: elapsed
        }));
        
          hasMore = pageResults.pagination?.hasMore || false;
        console.log(`📄 [PAGINATION] Has more after page ${page}: ${hasMore}`);
        console.log(`📄 [PAGINATION] Pagination info:`, JSON.stringify(pageResults.pagination, null, 2));
        
        if (allResults.length >= maxResults || !hasMore) {
          console.log(`📄 [PAGINATION] Stopping: allResults.length (${allResults.length}) >= maxResults (${maxResults}) OR !hasMore (${!hasMore})`);
          break;
        }
        page++;
      }
      
      console.log(`📄 [PAGINATION] Finished fetching. Total pages: ${page - 1}, Total results: ${allResults.length}`);
      
      console.log(`📄 [PAGINATION] Processing ${allResults.length} total results`);
      
      if (searchParams.location && allResults.length > 0) {
        console.log(`📄 [PAGINATION] Filtering results by location: ${searchParams.location}`);
        const { filterLeadsByLocation } = await import('@/utils/locationValidation');
        const { filtered, stats } = filterLeadsByLocation(allResults, String(searchParams.location));
        console.log(`📄 [PAGINATION] Filtered results: ${filtered.length} of ${allResults.length}`, stats);
        setResults(filtered);
        setLocationValidationStats(stats);
          } else {
        console.log(`📄 [PAGINATION] No location filter, setting all ${allResults.length} results`);
        setResults(allResults);
      }
      
      console.log(`📄 [PAGINATION] Setting workflow step to 'results'`);
      setScrapingProgress(prev => ({
        ...prev,
        status: 'completed',
        currentOperation: `Complete: ${allResults.length} leads`,
        leadsCollected: allResults.length
      }));
      // Always move to results step, even if empty
      setWorkflowStep('results');
      console.log(`📄 [PAGINATION] ✅ Successfully completed fetchAllPagesSequentially`);
    } catch (err) {
      console.error('📄 [PAGINATION] ❌ Error in fetchAllPagesSequentially:', err);
      console.error('📄 [PAGINATION] Error details:', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      });
      setError(err instanceof Error ? err.message : 'Unknown error');
      setScrapingProgress(prev => ({ ...prev, status: 'error', currentOperation: 'Error occurred' }));
      // Still show results step even on error, with empty results
      setResults([]);
      setWorkflowStep('results');
    } finally {
      console.log('📄 [PAGINATION] Finished fetchAllPagesSequentially, setting isSearching to false');
      setIsSearching(false);
    }
  };

  const fetchSinglePage = async (pageNumber: number): Promise<{
    leads: LeadResult[];
    pagination: any;
  } | null> => {
    console.log(`📄 [FETCH_PAGE] === Fetching page ${pageNumber} ===`);
    console.log(`📄 [FETCH_PAGE] Search type: ${searchType}`);
    console.log(`📄 [FETCH_PAGE] Search params:`, JSON.stringify(searchParams, null, 2));
    
    const endpoint = searchType === 'person' ? 'premium_search_person' : 'premium_search_company';
    const params: Record<string, unknown> = { ...searchParams, page: pageNumber };
    // Set limit to 100 per page if not specified (API defaults to 25, but we want more)
    if (!params.limit) params.limit = 100;
    const requestBody = { endpoint, ...params };
    
    console.log(`📄 [FETCH_PAGE] Request body:`, JSON.stringify(requestBody, null, 2));

    console.log(`📄 [FETCH_PAGE] Making API request...`);
    const response = await fetch('/api/linkedin-sales-navigator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    console.log(`📄 [FETCH_PAGE] Response status: ${response.status}, ok: ${response.ok}`);

    const result = await response.json();
    console.log(`📄 [FETCH_PAGE] Response result keys:`, Object.keys(result));
    console.log(`📄 [FETCH_PAGE] Response result (first 500 chars):`, JSON.stringify(result, null, 2).substring(0, 500));

    // Check for errors in response body (even if HTTP status is 200)
    // RapidAPI sometimes returns 200 OK with success: false in the body
    if (result.success === false || (result.data && typeof result.data === 'object' && result.data.success === false)) {
      const errorMessage = result.message || result.error || result.data?.message || result.data?.error || 'API request failed';
      
      // Detect account freeze separately (should NOT retry - it's a 60-minute block)
      const isAccountFrozen = errorMessage.toLowerCase().includes('frozen') || 
                             errorMessage.toLowerCase().includes('60 mins') ||
                             errorMessage.toLowerCase().includes('account system');
      
      // Regular rate limits (can retry with backoff)
      const isRateLimit = result.isRateLimit || 
                         errorMessage.toLowerCase().includes('rate limit') ||
                         errorMessage.toLowerCase().includes('429');
      
      console.error(`📄 [FETCH_PAGE] ❌ API returned error in response body:`, errorMessage);
      
      if (isAccountFrozen) {
        // Account freeze - stop immediately, don't retry
        const freezeMatch = errorMessage.match(/(\d+)\s*(mins?|minutes?|hours?)/i);
        const freezeDuration = freezeMatch ? parseInt(freezeMatch[1], 10) * 60 : 3600; // Convert to seconds
        const freezeDurationMinutes = Math.ceil(freezeDuration / 60);
        
        // Log freeze with timestamps
        const freezeStartTime = new Date();
        const freezeExpirationTime = new Date(Date.now() + (freezeDuration * 1000));
        console.error(`📄 [FETCH_PAGE] 🔴 ACCOUNT FROZEN - DETAILED LOG`);
        console.error(`   Freeze Start: ${freezeStartTime.toISOString()}`);
        console.error(`   Freeze Duration: ${freezeDurationMinutes} minutes (${freezeDuration} seconds)`);
        console.error(`   Freeze Expires: ${freezeExpirationTime.toISOString()}`);
        console.error(`   Time Until Expiry: ${freezeDurationMinutes} minutes`);
        console.error(`   Message: ${errorMessage}`);
        
        throw new Error(`ACCOUNT_FROZEN:${freezeDuration}:${errorMessage}`);
      } else if (isRateLimit) {
        // Regular rate limit - can retry with backoff
        const retryAfter = result.retryAfter || result.details?.retryAfter || 60;
        console.error(`📄 [FETCH_PAGE] Rate limit detected, retry after: ${retryAfter}s`);
        throw new Error(`RATE_LIMIT:${retryAfter}:${errorMessage}`);
      }
      
      throw new Error(errorMessage);
    }

    if (!response.ok) {
      console.error(`📄 [FETCH_PAGE] ❌ API error:`, result);
      
      const errorMessage = result.message || result.error || result.details?.message || result.details?.error || 'Failed to fetch page';
      
      // Check for account freeze first (should stop immediately, no retries)
      const isAccountFrozen = errorMessage.toLowerCase().includes('frozen') || 
                             errorMessage.toLowerCase().includes('60 mins') ||
                             errorMessage.toLowerCase().includes('account system');
      
      if (isAccountFrozen) {
        const freezeMatch = errorMessage.match(/(\d+)\s*(mins?|minutes?|hours?)/i);
        const freezeDuration = freezeMatch ? parseInt(freezeMatch[1], 10) * 60 : 3600; // Convert to seconds
        const freezeDurationMinutes = Math.ceil(freezeDuration / 60);
        
        // Log freeze with timestamps
        const freezeStartTime = new Date();
        const freezeExpirationTime = new Date(Date.now() + (freezeDuration * 1000));
        console.error(`📄 [FETCH_PAGE] 🔴 ACCOUNT FROZEN - DETAILED LOG`);
        console.error(`   Freeze Start: ${freezeStartTime.toISOString()}`);
        console.error(`   Freeze Duration: ${freezeDurationMinutes} minutes (${freezeDuration} seconds)`);
        console.error(`   Freeze Expires: ${freezeExpirationTime.toISOString()}`);
        console.error(`   Time Until Expiry: ${freezeDurationMinutes} minutes`);
        console.error(`   Message: ${errorMessage}`);
        
        throw new Error(`ACCOUNT_FROZEN:${freezeDuration}:${errorMessage}`);
      }
      
      // Check for 429 rate limit in multiple places:
      // 1. HTTP status code (429)
      // 2. Error message text
      // 3. Error details object
      // 4. RapidAPI error field
      const isRateLimit = 
        response.status === 429 || 
        response.status === 403 && (result.error?.includes('429') || result.rapidApiError?.includes('429')) || // 403 can contain 429 in error
        result.error?.includes('429') || 
        result.message?.includes('429') || 
        result.rapidApiError?.includes('429') ||
        result.details?.error?.includes('429') ||
        result.details?.rapidApiError?.includes('429');
      
      if (isRateLimit) {
        const retryAfter = result.retryAfter || result.details?.retryAfter || 60;
        console.error(`📄 [FETCH_PAGE] Rate limit detected (429), retry after: ${retryAfter}s`);
        throw new Error(`RATE_LIMIT:${retryAfter}:Rate limit exceeded`);
      }
      
      throw new Error(errorMessage);
    }

    let rawResults: LeadResult[] = [];
    let paginationInfo: any = null;

    console.log(`📄 [FETCH_PAGE] Parsing response data...`);
    console.log(`📄 [FETCH_PAGE] result.data exists:`, !!result.data);
    console.log(`📄 [FETCH_PAGE] result.data type:`, typeof result.data);
    console.log(`📄 [FETCH_PAGE] result.data is array:`, Array.isArray(result.data));

    if (result.data?.response?.data && Array.isArray(result.data.response.data)) {
      console.log(`📄 [FETCH_PAGE] ✅ Found results in result.data.response.data`);
      rawResults = result.data.response.data;
      paginationInfo = result.data.response.pagination || result.pagination;
      console.log(`📄 [FETCH_PAGE] Results count: ${rawResults.length}`);
      console.log(`📄 [FETCH_PAGE] Pagination info:`, JSON.stringify(paginationInfo, null, 2));
    } else if (result.data?.data && Array.isArray(result.data.data)) {
      console.log(`📄 [FETCH_PAGE] ✅ Found results in result.data.data`);
      rawResults = result.data.data;
      paginationInfo = result.data.pagination || result.pagination;
      console.log(`📄 [FETCH_PAGE] Results count: ${rawResults.length}`);
      console.log(`📄 [FETCH_PAGE] Pagination info:`, JSON.stringify(paginationInfo, null, 2));
    } else {
      console.log(`📄 [FETCH_PAGE] ⚠️ No results found in expected locations`);
      console.log(`📄 [FETCH_PAGE] result.data structure:`, JSON.stringify(result.data, null, 2).substring(0, 1000));
    }

    // Extract hasMore from pagination - check multiple possible locations
    const hasMore = paginationInfo?.hasMore !== undefined 
      ? paginationInfo.hasMore
      : paginationInfo?.total 
        ? (paginationInfo.start + paginationInfo.count) < paginationInfo.total
          : false;

    console.log(`📄 [FETCH_PAGE] Calculated hasMore: ${hasMore}`);
    console.log(`📄 [FETCH_PAGE] Pagination details:`, {
      total: paginationInfo?.total,
      count: paginationInfo?.count,
      start: paginationInfo?.start,
      hasMore: paginationInfo?.hasMore,
      calculatedHasMore: hasMore
    });
    
    const returnValue = {
      leads: rawResults,
      pagination: {
        ...paginationInfo,
        hasMore: hasMore, 
        currentPage: pageNumber,
        total: paginationInfo?.total || 0,
        count: paginationInfo?.count || rawResults.length,
        start: paginationInfo?.start || 0
      }
    };
    
    console.log(`📄 [FETCH_PAGE] Returning:`, {
      leadsCount: returnValue.leads.length,
      pagination: returnValue.pagination
    });
    
    return returnValue;
  };

  /**
   * Generates a human-readable search filter summary from searchParams
   */
  const generateSearchFilterSummary = (params: Record<string, unknown>): string => {
    const filters: string[] = [];
    
    if (params.location) filters.push(`Location: ${params.location}`);
    if (params.title_keywords) filters.push(`Title: ${params.title_keywords}`);
    if (params.current_company) filters.push(`Company: ${params.current_company}`);
    if (params.industry) filters.push(`Industry: ${params.industry}`);
    if (params.past_company) filters.push(`Past Company: ${params.past_company}`);
    if (params.company_headcount_min || params.company_headcount_max) {
      const min = params.company_headcount_min || '0';
      const max = params.company_headcount_max || '∞';
      filters.push(`Headcount: ${min}-${max}`);
    }
    if (params.years_experience_min || params.years_experience_max) {
      const min = params.years_experience_min || '0';
      const max = params.years_experience_max || '∞';
      filters.push(`Experience: ${min}-${max} years`);
    }
    if (params.school || params.university) {
      filters.push(`School: ${params.school || params.university}`);
    }
    if (params.changed_jobs_90_days === 'true' || params.changed_jobs_90_days === true) {
      filters.push('Changed Jobs (90 days)');
    }
    if (params.url) {
      filters.push('Via URL');
    }
    
    return filters.length > 0 ? filters.join(' | ') : 'No filters';
  };

  /**
   * Extracts email from LinkedIn summary text
   */
  const extractEmailFromSummary = (summary: string | undefined): string => {
    if (!summary) return '';
    // Look for email patterns in summary text
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const matches = summary.match(emailRegex);
    return matches && matches.length > 0 ? matches[0] : '';
  };

  /**
   * Extracts phone from LinkedIn summary text
   */
  const extractPhoneFromSummary = (summary: string | undefined): string => {
    if (!summary) return '';
    // Look for phone patterns: Phone: 123-456-7890, Phone: (123) 456-7890, Phone: 1234567890, etc.
    const phonePatterns = [
      /Phone:\s*([\d\s\-\(\)]+)/i,
      /Phone\s*:\s*([\d\s\-\(\)]+)/i,
      /Tel:\s*([\d\s\-\(\)]+)/i,
      /(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g,
    ];
    
    for (const pattern of phonePatterns) {
      const match = summary.match(pattern);
      if (match && match[1]) {
        // Clean up the phone number
        const cleaned = match[1].replace(/[^\d+]/g, '');
        if (cleaned.length >= 10) {
          return cleaned;
        }
      }
    }
    return '';
  };

  const convertResultsToParsedData = (leads: LeadResult[]): ParsedData => {
    console.log('🔄 [CONVERT] Converting results to parsed data');
    console.log('🔄 [CONVERT] Input leads count:', leads.length);
    console.log('🔄 [CONVERT] First lead sample:', leads[0] ? Object.keys(leads[0]) : 'no leads');
    
    // Generate search filter summary once
    const searchFilterSummary = generateSearchFilterSummary(searchParams);
    console.log('🔄 [CONVERT] Search filter summary:', searchFilterSummary);
    
    const headers = ['Name', 'Title', 'Company', 'Location', 'LinkedIn URL', 'Email', 'Phone', 'First Name', 'Last Name', 'City', 'State', 'Zip', 'Search Filter'];
    const rows = leads.map((lead: any, index: number) => {
      // Extract name - check camelCase first (API format), then snake_case, then construct
      const rawFullName = lead.fullName || lead.name || lead.full_name || 
        (lead.firstName || lead.first_name ? 
          `${lead.firstName || lead.first_name} ${lead.lastName || lead.last_name || ''}`.trim() : 
          '');
      // Normalize name to remove credentials (e.g., "Mona Baset, MBA, MA" -> "Mona Baset")
      const fullName = normalizeName(rawFullName);
      const nameParts = fullName.split(' ');
      const location = lead.geoRegion || lead.location || '';
      const locationParts = location.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
      
      // PHASE 1 FIX: Properly parse location to avoid "United States" as city
      // Format possibilities:
      // - "City, State, Country" (3 parts) → city=City, state=State
      // - "State, Country" (2 parts) → city="", state=State
      // - "Country" (1 part) → city="", state="", country=Country
      // - "City, State" (2 parts, no country) → city=City, state=State
      let city = '';
      let state = '';
      const countries = ['united states', 'usa', 'canada', 'uk', 'united kingdom', 'australia', 'germany', 'france', 'spain', 'italy', 'india', 'china', 'japan'];
      
      if (locationParts.length >= 3) {
        // "City, State, Country" format
        city = locationParts[0];
        state = locationParts[1];
        // Last part is country, ignore it
      } else if (locationParts.length === 2) {
        // Could be "City, State" or "State, Country"
        const secondPart = locationParts[1].toLowerCase();
        const isCountry = countries.some(c => secondPart.includes(c));
        if (isCountry) {
          // "State, Country" format
          city = ''; // No city
          state = locationParts[0]; // First part is state
        } else {
          // "City, State" format (no country)
          city = locationParts[0];
          state = locationParts[1];
        }
      } else if (locationParts.length === 1) {
        // Single part - could be state or country
        const singlePart = locationParts[0].toLowerCase();
        const isCountry = countries.some(c => singlePart.includes(c));
        if (isCountry) {
          // Just country, no city or state
          city = '';
          state = '';
        } else {
          // Assume it's a state
          city = '';
          state = locationParts[0];
        }
      }
      
      // VALIDATION: Never set city to country name
      const cityLower = city.toLowerCase();
      if (countries.some(c => cityLower.includes(c))) {
        console.warn(`[CONVERT] Invalid city detected: "${city}" - setting to empty`);
        city = '';
      }
      
      // Extract email and phone from summary if not already in structured fields
      const summary = lead.summary || '';
      const extractedEmail = lead.email || extractEmailFromSummary(summary);
      const extractedPhone = lead.phone || lead.phone_number || extractPhoneFromSummary(summary);
      
      console.log(`🔄 [CONVERT] Lead ${index + 1}:`, {
        name: fullName,
        location: location,
        parsedCity: city || 'NONE',
        parsedState: state || 'NONE',
        hasEmail: !!extractedEmail,
        hasPhone: !!extractedPhone,
        email: extractedEmail ? extractedEmail.substring(0, 20) + '...' : 'none',
        phone: extractedPhone ? extractedPhone.substring(0, 15) + '...' : 'none'
      });
      
      return {
        'Name': fullName,
        'Title': lead.currentPosition?.title || lead.title || lead.job_title || lead.headline || '',
        'Company': lead.currentPosition?.companyName || lead.company || lead.company_name || '',
        'Location': location,
        'LinkedIn URL': lead.navigationUrl || lead.linkedin_url || lead.profile_url || lead.url || '',
        'Email': extractedEmail,
        'Phone': extractedPhone,
        'First Name': nameParts[0] || '',
        'Last Name': nameParts.slice(1).join(' ') || '',
        'City': city,
        'State': state,
        'Zip': '',
        'Search Filter': searchFilterSummary,
      };
    });

    console.log('🔄 [CONVERT] Converted data:', {
      headers: headers.length,
      rows: rows.length,
      firstRowSample: rows[0] ? Object.keys(rows[0]) : 'no rows'
    });
    
    return { headers, rows, rowCount: rows.length, columnCount: headers.length };
  };

  const handleEnrichBackground = async () => {
    console.log('✨ [ENRICH] Starting background enrichment job');
    
    if (!results || results.length === 0) {
      setError('No leads to enrich. Please scrape leads first.');
      return;
    }

    try {
      const parsedData = convertResultsToParsedData(results);
      
      const response = await fetch('/api/jobs/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parsedData,
          metadata: {
            source: 'linkedin-scraper',
            leadCount: results.length,
          },
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setError(null);
        // Show success message
        alert(`✅ Enrichment job started! Job ID: ${data.jobId}\n\nYou can monitor progress in the Background Jobs widget in the sidebar.`);
        // Optionally redirect or show job status
      } else {
        setError(data.error || 'Failed to start enrichment job');
      }
    } catch (err) {
      console.error('Error starting background enrichment:', err);
      setError(err instanceof Error ? err.message : 'Failed to start enrichment job');
    }
  };

  const handleEnrichAndScrub = async () => {
    console.log('✨ [ENRICH] Starting handleEnrichAndScrub');
    console.log('✨ [ENRICH] Results:', results ? `${results.length} leads` : 'null');
    
    if (!results || results.length === 0) {
      console.error('✨ [ENRICH] ❌ No results to enrich');
      setError('No leads to enrich. Please scrape leads first.');
      return;
    }

    console.log('✨ [ENRICH] Setting up enrichment state...');
    setIsEnriching(true);
    setError(null);
    setEnrichedData(null);
    setDncResults([]);
    setLeadSummaries([]);
    setWorkflowStep('enriching');
    initializeAPIProgress();

    try {
      console.log('✨ [ENRICH] Converting results to parsed data...');
      const parsedData = convertResultsToParsedData(results);
      console.log('✨ [ENRICH] Parsed data:', {
        rowCount: parsedData.rowCount,
        columnCount: parsedData.columnCount,
        headers: parsedData.headers,
        firstRowSample: parsedData.rows[0] ? Object.keys(parsedData.rows[0]) : 'no rows'
      });
      
      updateAPIProgress('LinkedIn Sales Navigator', { status: 'completed', progress: results.length, total: results.length });
      
      console.log('✨ [ENRICH] Calling enrichData...');
      const enriched = await enrichData(parsedData, (current, total) => {
        console.log(`✨ [ENRICH] Progress: ${current}/${total} (${Math.round((current/total)*100)}%)`);
        setEnrichmentProgress({ current, total });
        const phase = Math.floor((current / total) * 9);
        if (phase >= 1) updateAPIProgress('Skip Tracing v1', { status: 'running', progress: current, total });
        if (phase >= 2) updateAPIProgress('Skip Tracing v2', { status: 'running', progress: current, total });
        if (phase >= 3) updateAPIProgress('Income by Zip', { status: 'running', progress: current, total });
        if (phase >= 4) updateAPIProgress('Website Extractor', { status: 'running', progress: current, total });
        if (phase >= 5) updateAPIProgress('Website Contacts', { status: 'running', progress: current, total });
        if (phase >= 6) updateAPIProgress('LinkedIn Profile', { status: 'running', progress: current, total });
        if (phase >= 7) updateAPIProgress('Fresh LinkedIn', { status: 'running', progress: current, total });
        if (phase >= 8) updateAPIProgress('Facebook Profile', { status: 'running', progress: current, total });
      }, (detailedProgress) => {
        // Real-time detailed progress tracking
        console.log(`✨ [ENRICH] ${detailedProgress.leadName} - ${detailedProgress.step}:`, detailedProgress.stepDetails);
        setDetailedProgress(detailedProgress);
        
        // Track errors
        if (detailedProgress.errors && detailedProgress.errors.length > 0) {
          console.warn(`✨ [ENRICH] Errors for ${detailedProgress.leadName}:`, detailedProgress.errors);
          setEnrichmentErrors(prev => [
            ...prev,
            ...detailedProgress.errors!.map(err => ({
              lead: detailedProgress.leadName || 'Unknown',
              error: err,
              timestamp: detailedProgress.timestamp
            }))
          ]);
        }
        
        setEnrichmentProgress({ current: detailedProgress.current, total: detailedProgress.total });
      });
      
      console.log('✨ [ENRICH] ✅ Enrichment completed');
      console.log('✨ [ENRICH] Enriched data:', {
        rowCount: enriched.rows.length,
        headers: enriched.headers,
        firstRowSample: enriched.rows[0] ? Object.keys(enriched.rows[0]).slice(0, 10) : 'no rows'
      });
      
      setApiProgress(prev => prev.map(api => ({
        ...api,
        status: api.status === 'running' ? 'completed' : api.status,
        progress: api.status === 'running' ? api.total : api.progress
      })));
      
      console.log('✨ [ENRICH] Setting enriched data...');
      setEnrichedData(enriched);
      
      console.log('✨ [ENRICH] Extracting lead summaries...');
      // Extract summaries and filter out email-only leads (require phone)
      const allSummaries: LeadSummary[] = enriched.rows.map((row: EnrichedRow) => extractLeadSummary(row, row._enriched));
      const summaries = allSummaries.filter((lead: LeadSummary) => {
        const phone = (lead.phone || '').trim().replace(/\D/g, '');
        const hasValidPhone = phone.length >= 10;
        if (!hasValidPhone) {
          console.log(`🚫 [ENRICH] Filtering out lead "${lead.name}" - no valid phone number (email-only leads excluded)`);
        }
        return hasValidPhone;
      });
      console.log(`✨ [ENRICH] Lead summaries: ${summaries.length} (filtered from ${allSummaries.length} - removed ${allSummaries.length - summaries.length} email-only leads)`);
      setLeadSummaries(summaries);
      
      // Load existing enriched leads from disk (incremental saves)
      try {
        const loadResponse = await fetch('/api/load-enriched-leads');
        if (loadResponse.ok) {
          const diskData = await loadResponse.json();
          if (diskData.success && Array.isArray(diskData.leads)) {
            console.log(`✨ [ENRICH] Loaded ${diskData.leads.length} leads from disk`);
            // Merge disk leads with newly enriched leads (avoid duplicates)
            const seenKeys = new Set<string>();
            const allSummaries: LeadSummary[] = [];
            
            // Add disk leads first (filter out email-only leads - require phone)
            for (const lead of diskData.leads) {
              const phone = (lead.phone || '').trim().replace(/\D/g, '');
              if (phone.length < 10) {
                console.log(`🚫 [ENRICH] Filtering out disk lead "${lead.name}" - no valid phone number (email-only leads excluded)`);
                continue; // Skip email-only leads
              }
              const key = lead.linkedinUrl || `${lead.name}-${lead.email}-${lead.phone}`;
              if (!seenKeys.has(key)) {
                seenKeys.add(key);
                allSummaries.push(lead);
              }
            }
            
            // Add newly enriched leads (already filtered above)
            for (const lead of summaries) {
              const key = lead.linkedinUrl || `${lead.name}-${lead.email}-${lead.phone}`;
              if (!seenKeys.has(key)) {
                seenKeys.add(key);
                allSummaries.push(lead);
              }
            }
            
            console.log(`✨ [ENRICH] Total unique leads after merge: ${allSummaries.length}`);
            setLeadSummaries(allSummaries);
            
            // Save merged leads to localStorage
            localStorage.setItem('enrichedLeads', JSON.stringify(allSummaries));
            console.log('✨ [ENRICH] Saved merged leads to localStorage:', allSummaries.length);
          }
        }
      } catch (loadError) {
        console.error('✨ [ENRICH] Failed to load leads from disk:', loadError);
      }
      
      // Also save newly enriched leads to localStorage (fallback)
      try {
        const existingLeads = localStorage.getItem('enrichedLeads');
        const existing = existingLeads ? JSON.parse(existingLeads) : [];
        const seenKeys = new Set<string>();
        const combined: LeadSummary[] = [];
        
        // Add existing leads
        for (const lead of existing) {
          const key = lead.linkedinUrl || `${lead.name}-${lead.email}-${lead.phone}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            combined.push(lead);
          }
        }
        
        // Add new summaries (filter out email-only leads - require phone)
        for (const lead of summaries) {
          // Filter: require phone number (10+ digits), exclude email-only leads
          const phone = (lead.phone || '').trim().replace(/\D/g, '');
          if (phone.length < 10) {
            console.log(`🚫 [ENRICH] Skipping lead "${lead.name}" - no valid phone number (email-only leads excluded)`);
            continue; // Skip leads without phone numbers
          }
          
          const key = lead.linkedinUrl || `${lead.name}-${lead.email}-${lead.phone}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            combined.push(lead);
          }
        }
        
        localStorage.setItem('enrichedLeads', JSON.stringify(combined));
        console.log('✨ [ENRICH] Saved enriched leads to localStorage:', combined.length);
        
        // Dispatch custom event to notify other components
        window.dispatchEvent(new Event('enrichedLeadsUpdated'));
      } catch (error) {
        console.error('✨ [ENRICH] Failed to save enriched leads to localStorage:', error);
      }
      
      // DNC Scrubbing disabled
      // if (enableDNCScrub) {
      //   updateAPIProgress('USHA DNC Scrub', { status: 'running', progress: 0, total: enriched.rows.length });
      //   await handleDNCScrub(enriched);
      //   updateAPIProgress('USHA DNC Scrub', { status: 'completed', progress: enriched.rows.length, total: enriched.rows.length });
      // }

      // CRITICAL: Aggregate and save enriched leads to server (enriched-all-leads.json)
      // This ensures leads appear on the /enriched page
      try {
        console.log('✨ [ENRICH] Aggregating enriched leads to server...');
        const aggregateResponse = await fetch('/api/aggregate-enriched-leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newLeads: summaries }),
        });

        if (aggregateResponse.ok) {
          const aggregateData = await aggregateResponse.json();
          const totalLeads = aggregateData.totalLeads || summaries.length;
          const newLeadsAdded = aggregateData.newLeadsAdded || summaries.length;

          console.log('✨ [ENRICH] ✅ Aggregated and saved leads to server:', {
            totalLeads,
            newLeadsAdded,
            message: aggregateData.message
          });

          // Show toast notification
          showToast(`${newLeadsAdded} enriched lead${newLeadsAdded === 1 ? '' : 's'} added to brainscraper database`, 'success');
          
          // Redirect to enriched leads page
          router.push('/enriched');
        } else {
          const errorText = await aggregateResponse.text();
          console.error('✨ [ENRICH] ❌ Failed to aggregate leads on server:', errorText);
          showToast('Failed to save enriched leads to database', 'error');
        }
      } catch (aggregateError) {
        console.error('✨ [ENRICH] ❌ Error aggregating leads:', aggregateError);
        showToast('Error saving enriched leads to database', 'error');
        // Don't fail the enrichment if aggregation fails, but log it
      }
      
      console.log('✨ [ENRICH] ✅ Successfully completed enrichment and redirected');
    } catch (err) {
      console.error('✨ [ENRICH] ❌ Error in handleEnrichAndScrub:', err);
      console.error('✨ [ENRICH] Error details:', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        name: err instanceof Error ? err.name : undefined
      });
      setError(err instanceof Error ? err.message : 'Failed to enrich leads');
      setApiProgress(prev => prev.map(api => 
        api.status === 'running' ? { ...api, status: 'error', error: err instanceof Error ? err.message : 'Unknown error' } : api
      ));
    } finally {
      console.log('✨ [ENRICH] Finished handleEnrichAndScrub, setting isEnriching to false');
      setIsEnriching(false);
    }
  };

  const handleScrubOnly = async () => {
    if (leadList.length === 0) {
      alert('No leads in the list to scrub. Add leads first.');
      return;
    }

    // Filter leads with phone numbers
    const leadsWithPhone = leadList.filter(lead => {
      const phone = lead.phone?.replace(/\D/g, '');
      return phone && phone.length >= 10;
    });

    if (leadsWithPhone.length === 0) {
      alert('No leads with valid phone numbers to scrub.');
      return;
    }

    if (!confirm(`Scrub DNC status for ${leadsWithPhone.length} leads with phone numbers?`)) {
      return;
    }

    console.log('🔍 [SCRUB_ONLY] Starting DNC scrub for leadList');
    setIsScrubbing(true);
    setError(null);

    try {
      const phoneNumbers = leadsWithPhone.map(lead => lead.phone?.replace(/\D/g, '')).filter(Boolean) as string[];
      
      // Scrub in batches
      const batchSize = 20;
      const dncResults = new Map<string, { status: string; isDNC: boolean }>();
      const totalBatches = Math.ceil(phoneNumbers.length / batchSize);

      let failedBatches = 0;
      let processedBatches = 0;

      for (let i = 0; i < phoneNumbers.length; i += batchSize) {
        const batchNum = Math.floor(i / batchSize) + 1;
        const batch = phoneNumbers.slice(i, i + batchSize);
        
        console.log(`📤 [SCRUB_ONLY] Sending batch ${batchNum}/${totalBatches} (${batch.length} numbers)...`);
        
        try {
          const response = await fetch('/api/usha/scrub-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumbers: batch }),
          });
          
          if (response.ok) {
            const result = await response.json();
            if (result.success && result.results && Array.isArray(result.results)) {
              result.results.forEach((r: any) => {
                // Normalize phone number for consistent matching
                const normalizedPhone = String(r.phone || '').replace(/\D/g, '');
                if (normalizedPhone && normalizedPhone.length >= 10) {
                  dncResults.set(normalizedPhone, {
                    status: r.status === 'DNC' ? 'YES' : r.status === 'OK' ? 'NO' : 'UNKNOWN',
                    isDNC: r.isDNC || r.status === 'DNC'
                  });
                }
              });
              processedBatches++;
            } else {
              console.warn(`⚠️ [SCRUB_ONLY] Batch ${batchNum} returned invalid response structure`);
              failedBatches++;
            }
          } else {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            const errorMessage = errorData.error || response.statusText;
            console.error(`❌ [SCRUB_ONLY] Batch ${batchNum} failed: ${errorMessage}`);
            failedBatches++;
            
            // Check if it's a token error - stop all batches if so
            if (errorMessage.includes('USHA JWT token') || errorMessage.includes('token is required')) {
              throw new Error(`Token error: ${errorMessage}. Please configure USHA_JWT_TOKEN.`);
            }
            // For other errors, continue processing remaining batches
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`❌ [SCRUB_ONLY] Batch ${batchNum} exception:`, errorMessage);
          failedBatches++;
          
          // Only throw if it's a token error, otherwise continue
          if (errorMessage.includes('Token error')) {
            throw error;
          }
        }
        
        // Small delay between batches
        if (i + batchSize < phoneNumbers.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      if (failedBatches > 0) {
        console.warn(`⚠️ [SCRUB_ONLY] ${failedBatches} batch(es) failed, but continuing with successful results`);
      }

      // Update leadList with DNC status
      if (dncResults.size > 0) {
        const dncCount = Array.from(dncResults.values()).filter(v => v.isDNC).length;
        const okCount = dncResults.size - dncCount;
        
        console.log(`✅ [SCRUB_ONLY] Scrub complete: ${okCount} OK, ${dncCount} DNC`);
        
        // Convert status: 'YES' -> 'Do Not Call', 'NO' -> 'Safe', 'UNKNOWN' -> 'Unknown'
        const convertDNCStatus = (status: string): 'Safe' | 'Do Not Call' | 'Unknown' => {
          if (status === 'YES') return 'Do Not Call';
          if (status === 'NO') return 'Safe';
          return 'Unknown';
        };
        
        // Update leadList with DNC status and capture updated leads for server save
        let updatedLeadsForServer: LeadSummary[] = [];
        
        setLeadList(prev => {
          const updated = prev.map(lead => {
            // Normalize phone number for consistent matching
            const phone = lead.phone?.replace(/\D/g, '');
            if (phone && phone.length >= 10 && dncResults.has(phone)) {
              const result = dncResults.get(phone)!;
              const convertedStatus: 'Safe' | 'Do Not Call' | 'Unknown' = convertDNCStatus(result.status);
              return {
                ...lead,
                dncStatus: convertedStatus,
                dncChecked: true,
              };
            }
            return lead;
          });

          // Build server payload from updated leads
          updatedLeadsForServer = updated.map(lead => {
            const phone = lead.phone?.replace(/\D/g, '');
            const baseLead: LeadSummary = {
              name: lead.name || '',
              phone: lead.phone || '',
              email: lead.email || '',
              dobOrAge: lead.dateOfBirth || lead.age?.toString() || '',
              zipcode: lead.zipCode || '',
              state: lead.state || '',
              city: lead.city || '',
              dncStatus: 'UNKNOWN',
              linkedinUrl: lead.linkedinUrl,
            };
            
            if (phone && phone.length >= 10 && dncResults.has(phone)) {
              const result = dncResults.get(phone)!;
              baseLead.dncStatus = result.status === 'YES' ? 'YES' : result.status === 'NO' ? 'NO' : 'UNKNOWN';
              baseLead.dncLastChecked = new Date().toISOString();
            }
            
            return baseLead;
          });

          return updated;
        });

        try {
          const response = await fetch('/api/aggregate-enriched-leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newLeads: updatedLeadsForServer }),
          });
          
          if (response.ok) {
            console.log('✅ [SCRUB_ONLY] Saved DNC status to server');
          } else {
            console.error('❌ [SCRUB_ONLY] Server save failed:', response.statusText);
          }
        } catch (error) {
          console.error('❌ [SCRUB_ONLY] Failed to save to server:', error);
        }

        const resultMessage = failedBatches > 0 
          ? `DNC scrub complete!\n${okCount} OK, ${dncCount} DNC\n⚠️ ${failedBatches} batch(es) failed`
          : `DNC scrub complete!\n${okCount} OK, ${dncCount} DNC`;
        alert(resultMessage);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to scrub leads';
      setError(errorMsg);
      alert(`Error: ${errorMsg}`);
    } finally {
      setIsScrubbing(false);
    }
  };

  const handleDNCScrub = async (data: EnrichedData) => {
    setIsScrubbing(true);
    try {
      const headers = ['First Name', 'Last Name', 'City', 'State', 'Zip', 'Date Of Birth', 'House hold Income', 'Primary Phone'];
      const csvRows = [
        headers.join(','),
        ...data.rows.map((row: EnrichedRow) => {
          const escapeCSV = (val: string) => val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
          return [
            escapeCSV(String(row['First Name'] || '')),
            escapeCSV(String(row['Last Name'] || '')),
            escapeCSV(String(row['City'] || '')),
            escapeCSV(String(row['State'] || '')),
            escapeCSV(String(row['Zip'] || '')),
            escapeCSV(''),
            escapeCSV(''),
            escapeCSV(String(row['Phone'] || '')),
          ].join(',');
        })
      ];

      const csv = csvRows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const file = new File([blob], 'leads.csv', { type: 'text/csv' });
      const formData = new FormData();
      formData.append('file', file);
      if (ushaToken.trim()) formData.append('token', ushaToken);
      formData.append('ScrubList', 'true');
      formData.append('ImportLeads', 'false');

      const response = await fetch('/api/usha/scrub', { method: 'POST', body: formData });
      const result = await response.json();

      if (!response.ok) {
        const errorMsg = result.error || 'Failed to scrub leads';
        // Provide more helpful error message for 401
        if (response.status === 401) {
          throw new Error(`${errorMsg}. Please add USHA_JWT_TOKEN to .env.local or enter it in the token field above.`);
        }
        throw new Error(errorMsg);
      }

      const jobId = result.data?.JobLogID || result.data?.jobLogID || result.data?.id;
      if (jobId) {
        setJobLogID(String(jobId));
        setTimeout(() => fetchDNCResults(String(jobId)), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scrub leads');
    } finally {
      setIsScrubbing(false);
    }
  };

  const fetchDNCResults = async (jobId: string) => {
    try {
      const tokenParam = ushaToken.trim() ? `&token=${encodeURIComponent(ushaToken)}` : '';
      const response = await fetch(`/api/usha/import-log?JobLogID=${jobId}${tokenParam}`);
      const result = await response.json();

      if (response.ok && result.data) {
        const results: DNCResult[] = Array.isArray(result.data) 
          ? result.data.map((item: any) => ({
              phone: item.phoneNumber || item.phone || '',
              isDoNotCall: item.isDoNotCall || item.IsDoNotCall || false,
              canContact: item.canContact || item.CanContact || false,
              reason: item.reason || '',
            }))
          : [];
        
        setDncResults(results);
        if (enrichedData) {
          const updatedSummaries = enrichedData.rows.map((row: EnrichedRow) => {
            const phone = String(row['Phone'] || '');
            const dncData = results.find(r => r.phone === phone);
            return extractLeadSummary(row, row._enriched, dncData);
          });
          setLeadSummaries(updatedSummaries);
        }
      }
    } catch (err) {
      console.error('Failed to fetch DNC results:', err);
    }
  };

  const handleSortChange = (field: 'income' | 'state' | 'none') => {
    if (field === 'none') {
      setSortField('none');
      return;
    }
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortedSummaries = (): LeadSummary[] => {
    if (sortField === 'none') return leadSummaries;
    const sorted = [...leadSummaries].sort((a, b) => {
      if (sortField === 'state') {
        return sortDirection === 'asc' ? a.state.localeCompare(b.state) : b.state.localeCompare(a.state);
      }
      if (sortField === 'income') {
        const aIncome = a.income || 0;
        const bIncome = b.income || 0;
        return sortDirection === 'asc' ? aIncome - bIncome : bIncome - aIncome;
      }
      return 0;
    });
    return sorted;
  };

  const getAPIStatusColor = (status: APIProgress['status']) => {
    switch (status) {
      case 'completed': return 'status-success';
      case 'running': return 'status-processing';
      case 'error': return 'bg-red-500';
      default: return 'bg-minimalist-border';
    }
  };

  const updateSearchParam = (key: string, value: string | undefined) => {
    setSearchParams(prev => {
      const updated = { ...prev };
      if (value === undefined || value === '') {
        delete updated[key];
      } else {
        updated[key] = value;
      }
      return updated;
    });
  };

  const [locationValidationStats, setLocationValidationStats] = useState<{
    total: number;
    kept: number;
    removed: number;
    removalRate: number;
  } | null>(null);

  return (
    <div className="w-full space-y-6 relative z-10">
      {/* Header */}
      <div className="space-y-3 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent tracking-tight drop-shadow-lg">Lead Generation</h1>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-700/50 -mt-4">
        <button
          onClick={() => setActiveTab('linkedin')}
          className={`
            flex items-center gap-2 px-6 py-3 font-medium text-sm transition-all duration-200
            border-b-2 -mb-[1px]
            ${
              activeTab === 'linkedin'
                ? 'border-blue-400 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }
          `}
        >
          <Linkedin className="w-5 h-5" />
          <span>LinkedIn</span>
        </button>
        {/* Facebook tab hidden */}
        {/* <button
          onClick={() => setActiveTab('facebook')}
          className={`
            flex items-center gap-2 px-6 py-3 font-medium text-sm transition-all duration-200
            border-b-2 -mb-[1px]
            ${
              activeTab === 'facebook'
                ? 'border-blue-400 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }
          `}
        >
          <Facebook className="w-5 h-5" />
          <span>Facebook</span>
        </button> */}
      </div>
        
      {/* Active Progress Dashboard */}
      {(isSearching || isEnriching || isScrubbing) && (
        <div className="space-y-4 animate-slide-up">
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-1">Progress</h2>
            <p className="text-xs text-slate-400">Current operation status</p>
          </div>

          {isSearching && (
            <div className="group space-y-4 panel-inactive rounded-2xl p-6 hover:border-blue-500/30">
              {/* Header */}
              <div className="flex items-center justify-between">
            <div>
                  <p className="text-sm font-medium text-slate-200">{scrapingProgress.currentOperation}</p>
                  {scrapingProgress.totalPages > 0 && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      Page {scrapingProgress.currentPage} of {scrapingProgress.totalPages}
                    </p>
                  )}
            </div>
                {scrapingProgress.status === 'completed' ? (
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                ) : scrapingProgress.status === 'error' ? (
                  <XCircle className="w-5 h-5 text-red-400" />
                ) : (
                  <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                )}
              </div>

              {/* Large Leads Count */}
              <div className="text-center py-2">
                <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
                  {scrapingProgress.leadsCollected.toLocaleString()}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {scrapingProgress.estimatedTotal > 0 && (
                    <>of {scrapingProgress.estimatedTotal.toLocaleString()} target</>
                  )}
                  {scrapingProgress.estimatedTotal === 0 && 'leads collected'}
                </div>
              </div>

              {/* Progress Bar */}
              {scrapingProgress.totalPages > 0 && (
                <div className="space-y-2">
                  <div className="w-full progress-bar-container h-3">
                    <div 
                      className="progress-bar-fill h-3 rounded-full"
                      style={{ width: `${Math.min(100, (scrapingProgress.currentPage / scrapingProgress.totalPages) * 100)}%` }}
                    />
                  </div>
                  <div className="text-xs text-slate-400 text-center">
                    {Math.min(100, Math.round((scrapingProgress.currentPage / scrapingProgress.totalPages) * 100))}% complete
                  </div>
            </div>
          )}

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                {/* Leads Per Second */}
                <div className="panel-inactive rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">Speed</div>
                  <div className="text-lg font-semibold text-blue-400">
                    {scrapingProgress.leadsPerSecond > 0 ? scrapingProgress.leadsPerSecond.toFixed(2) : '0.00'}
                </div>
                  <div className="text-xs text-slate-500">leads/sec</div>
                  </div>

                {/* Estimated Time Remaining */}
                <div className="panel-inactive rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">ETA</div>
                  <div className="text-lg font-semibold text-purple-400">
                    {scrapingProgress.estimatedTimeRemaining > 0 ? (
                      <>
                        {Math.floor(scrapingProgress.estimatedTimeRemaining / 60)}:
                        {String(scrapingProgress.estimatedTimeRemaining % 60).padStart(2, '0')}
                      </>
                    ) : (
                      '--:--'
                )}
              </div>
                  <div className="text-xs text-slate-500">remaining</div>
                </div>

                {/* Elapsed Time */}
                <div className="panel-inactive rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">Elapsed</div>
                  <div className="text-lg font-semibold text-pink-400">
                    {Math.floor(scrapingProgress.elapsedTime / 60)}:
                    {String(scrapingProgress.elapsedTime % 60).padStart(2, '0')}
                  </div>
                  <div className="text-xs text-slate-500">time</div>
                </div>

                {/* Leads This Page */}
                <div className="panel-inactive rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">This Page</div>
                  <div className="text-lg font-semibold text-emerald-400">
                    {scrapingProgress.leadsThisPage}
                  </div>
                  <div className="text-xs text-slate-500">leads</div>
                </div>
              </div>

              {/* Average Leads Per Page */}
              {scrapingProgress.averageLeadsPerPage > 0 && (
                <div className="panel-inactive rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Average per page</span>
                    <span className="text-sm font-semibold text-slate-200">
                      {scrapingProgress.averageLeadsPerPage.toFixed(1)} leads
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {isEnriching && (
            <div className="group space-y-3 panel-inactive rounded-2xl p-6 hover:border-purple-500/30">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-200">Enriching Data</p>
                <span className="text-xs text-slate-400">
                  {enrichmentProgress.current} of {enrichmentProgress.total}
                </span>
              </div>
              <div className="w-full progress-bar-container h-2">
                <div 
                  className="progress-bar-fill h-2 rounded-full"
                  style={{ width: `${(enrichmentProgress.current / enrichmentProgress.total) * 100}%` }}
                />
              </div>

              {/* Real-time Detailed Progress */}
              {detailedProgress && (
                <div className="panel-inactive rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-200">
                      Currently Enriching: {detailedProgress.leadName}
                    </h3>
                    <span className="text-xs text-slate-400">
                      {detailedProgress.current}/{detailedProgress.total}
                    </span>
                  </div>
                  
                  {/* Step Indicator */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Step:</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      detailedProgress.step === 'linkedin' ? 'bg-blue-500/20 text-blue-400' :
                      detailedProgress.step === 'zip' ? 'bg-green-500/20 text-green-400' :
                      detailedProgress.step === 'phone-discovery' ? 'bg-purple-500/20 text-purple-400' :
                      detailedProgress.step === 'telnyx' ? 'bg-yellow-500/20 text-yellow-400' :
                      detailedProgress.step === 'gatekeep' ? 'bg-orange-500/20 text-orange-400' :
                      detailedProgress.step === 'age' ? 'bg-pink-500/20 text-pink-400' :
                      detailedProgress.step === 'complete' ? 'bg-green-500/20 text-green-400' :
                      'bg-slate-700/60 text-slate-400'
                    }`}>
                      {detailedProgress.step === 'linkedin' ? 'LinkedIn Data' :
                       detailedProgress.step === 'zip' ? 'ZIP Lookup' :
                       detailedProgress.step === 'phone-discovery' ? 'Phone Discovery' :
                       detailedProgress.step === 'telnyx' ? 'Telnyx Lookup' :
                       detailedProgress.step === 'gatekeep' ? 'Gatekeep Check' :
                       detailedProgress.step === 'age' ? 'Age Enrichment' :
                       detailedProgress.step === 'complete' ? 'Complete' : 'Processing'}
                    </span>
                  </div>
                  
                  {/* Step Details */}
                  {detailedProgress.stepDetails && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      {detailedProgress.stepDetails.firstName && (
                        <div>
                          <span className="text-slate-400">First:</span>
                          <span className="text-slate-200 ml-1">{detailedProgress.stepDetails.firstName}</span>
                        </div>
                      )}
                      {detailedProgress.stepDetails.lastName && (
                        <div>
                          <span className="text-slate-400">Last:</span>
                          <span className="text-slate-200 ml-1">{detailedProgress.stepDetails.lastName}</span>
                        </div>
                      )}
                      {detailedProgress.stepDetails.city && (
                        <div>
                          <span className="text-slate-400">City:</span>
                          <span className="text-slate-200 ml-1">{detailedProgress.stepDetails.city}</span>
                        </div>
                      )}
                      {detailedProgress.stepDetails.state && (
                        <div>
                          <span className="text-slate-400">State:</span>
                          <span className="text-slate-200 ml-1">{detailedProgress.stepDetails.state}</span>
                        </div>
                      )}
                      {detailedProgress.stepDetails.zipCode && (
                        <div>
                          <span className="text-slate-400">ZIP:</span>
                          <span className="text-slate-200 ml-1 font-mono">{detailedProgress.stepDetails.zipCode}</span>
                        </div>
                      )}
                      {detailedProgress.stepDetails.phone && (
                        <div>
                          <span className="text-slate-400">Phone:</span>
                          <span className="text-slate-200 ml-1 font-mono">{detailedProgress.stepDetails.phone}</span>
                        </div>
                      )}
                      {detailedProgress.stepDetails.email && (
                        <div>
                          <span className="text-slate-400">Email:</span>
                          <span className="text-slate-200 ml-1">{detailedProgress.stepDetails.email}</span>
                        </div>
                      )}
                      {detailedProgress.stepDetails.lineType && (
                        <div>
                          <span className="text-slate-400">Line Type:</span>
                          <span className="text-slate-200 ml-1">{detailedProgress.stepDetails.lineType}</span>
                        </div>
                      )}
                      {detailedProgress.stepDetails.carrier && (
                        <div>
                          <span className="text-slate-400">Carrier:</span>
                          <span className="text-slate-200 ml-1">{detailedProgress.stepDetails.carrier}</span>
                        </div>
                      )}
                      {detailedProgress.stepDetails.age && (
                        <div>
                          <span className="text-slate-400">Age:</span>
                          <span className="text-slate-200 ml-1">{detailedProgress.stepDetails.age}</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Errors */}
                  {detailedProgress.errors && detailedProgress.errors.length > 0 && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
                      <div className="text-xs font-semibold text-red-400 mb-1">Errors:</div>
                      {detailedProgress.errors.map((err, idx) => (
                        <div key={idx} className="text-xs text-red-300">{err}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {/* Error Log */}
              {enrichmentErrors.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-red-400">Enrichment Errors ({enrichmentErrors.length})</h3>
                    <button
                      onClick={() => setEnrichmentErrors([])}
                      className="text-xs text-red-300 hover:text-red-200"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {enrichmentErrors.slice(-10).map((err, idx) => (
                      <div key={idx} className="text-xs text-red-300">
                        <span className="font-medium">{err.lead}:</span> {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {apiProgress.map((api, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-200">{api.apiName}</span>
                      <span className={`w-2 h-2 rounded-full ${getAPIStatusColor(api.status)}`} title={api.status} />
                    </div>
                    {api.total > 0 && (
                      <div className="w-full progress-bar-container h-0.5">
                        <div 
                          className="progress-bar-fill h-0.5 rounded-full"
                          style={{ width: `${(api.progress / api.total) * 100}%` }}
                  />
                </div>
                    )}
                    <p className="text-xs text-slate-500">
                      {api.dataFields.slice(0, 2).join(', ')}
                      {api.dataFields.length > 2 && '...'}
                    </p>
                    {api.error && (
                      <p className="text-xs text-red-500">{api.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* Search Configuration */}
      {/* Tab Content */}
      {activeTab === 'linkedin' && (
        <>
      {workflowStep === 'search' && (
        <div className="space-y-6 animate-fade-in">
                <div>
            <h2 className="text-2xl font-bold text-slate-200 tracking-tight mb-1 font-data">Configure Search</h2>
            <p className="text-sm text-slate-400 font-data">Target and scrape leads from linkedin sales navigator.</p>
          </div>
          
          <div className="space-y-6 panel-inactive rounded-2xl p-6">
            {/* Search Type */}
            <div className="space-y-4">
              <label className="block text-xs font-medium text-slate-200 font-data">Search Type</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setSearchType('person')}
                    className={`group relative w-full px-4 py-2.5 rounded-xl state-transition border-2 overflow-hidden ${
                      searchType === 'person' 
                        ? 'btn-active text-white' 
                        : 'btn-inactive text-slate-200'
                    }`}
                  >
                    {searchType !== 'person' && (
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-purple-500/0 to-pink-500/0 group-hover:from-blue-500/10 group-hover:via-purple-500/10 group-hover:to-pink-500/10 transition-all duration-500" />
                    )}
                    <div className={`relative flex items-center justify-center gap-2 text-sm font-semibold font-data ${
                      searchType === 'person' ? 'text-white' : 'text-slate-200'
                    }`}>
                      <Users className={`w-5 h-5 transition-transform duration-300 ${searchType === 'person' ? 'text-white scale-110' : 'text-slate-300 group-hover:text-blue-400 group-hover:scale-110'}`} />
                      <span className="relative z-10">People</span>
                    </div>
                  </button>
                </div>
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setSearchType('person_via_url')}
                    className={`group relative w-full px-4 py-2.5 rounded-xl state-transition border-2 overflow-hidden ${
                      searchType === 'person_via_url' 
                        ? 'btn-active text-white' 
                        : 'btn-inactive text-slate-200'
                    }`}
                  >
                    {searchType !== 'person_via_url' && (
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-purple-500/0 to-pink-500/0 group-hover:from-blue-500/10 group-hover:via-purple-500/10 group-hover:to-pink-500/10 transition-all duration-500" />
                    )}
                    <div className={`relative flex items-center justify-center gap-2 text-sm font-semibold font-data ${
                      searchType === 'person_via_url' ? 'text-white' : 'text-slate-200'
                    }`}>
                      <Link2 className={`w-5 h-5 transition-transform duration-300 ${searchType === 'person_via_url' ? 'text-white scale-110' : 'text-slate-300 group-hover:text-blue-400 group-hover:scale-110'}`} />
                      <span className="relative z-10">Via URL</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* Search Parameters */}
            {searchType === 'person_via_url' ? (
              <div className="space-y-4">
                <label className="block text-sm font-medium text-slate-200 font-data">Sales Navigator URL</label>
                  <input
                    type="text"
                  value={String(searchParams.url || '')}
                  onChange={(e) => updateSearchParam('url', e.target.value)}
                  placeholder="https://www.linkedin.com/sales/search/people?..."
                  className="group w-full px-4 py-3 rounded-xl field-inactive text-slate-200  focus:field-focused hover:border-slate-600/60 font-data"
                  />
                </div>
            ) : (
              <div className="space-y-4">
                {/* Primary Filters */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-200 font-data">Job Title Keywords</label>
                  <input
                    type="text"
                      value={String(searchParams.title_keywords || '')}
                      onChange={(e) => updateSearchParam('title_keywords', e.target.value)}
                      placeholder="Director, VP, Manager"
                      className="group w-full px-4 py-2.5 rounded-xl field-inactive text-sm text-slate-200  focus:field-focused hover:border-slate-600/60 font-data"
                  />
                  <div className="flex items-center gap-4 mt-2 relative z-10">
                    <label className="flex items-center gap-2 cursor-pointer relative z-10 pointer-events-auto">
                      <input
                        type="checkbox"
                        checked={String(searchParams.title_keywords || '').toLowerCase().includes('self') || 
                                 String(searchParams.title_keywords || '').toLowerCase().includes('freelancer') ||
                                 String(searchParams.title_keywords || '').toLowerCase().includes('consultant') ||
                                 String(searchParams.title_keywords || '').toLowerCase().includes('owner') ||
                                 String(searchParams.title_keywords || '').toLowerCase().includes('founder')}
                        onChange={(e) => {
                          const selfEmployedKeywords = 'Self Employed, Self-Employed, Freelancer, Independent Contractor, Consultant, Owner, Founder';
                          if (e.target.checked) {
                            // Add self-employed keywords if not already present
                            const current = String(searchParams.title_keywords || '').trim();
                            if (!current.toLowerCase().includes('self') && 
                                !current.toLowerCase().includes('freelancer') &&
                                !current.toLowerCase().includes('consultant') &&
                                !current.toLowerCase().includes('owner') &&
                                !current.toLowerCase().includes('founder')) {
                              updateSearchParam('title_keywords', current ? `${current}, ${selfEmployedKeywords}` : selfEmployedKeywords);
                            }
                          } else {
                            // Remove self-employed keywords
                            const current = String(searchParams.title_keywords || '').trim();
                            const keywords = current.split(',').map(k => k.trim()).filter(k => {
                              const lower = k.toLowerCase();
                              return !lower.includes('self') && 
                                     !lower.includes('freelancer') &&
                                     !lower.includes('independent contractor') &&
                                     !lower.includes('consultant') &&
                                     !lower.includes('owner') &&
                                     !lower.includes('founder');
                            });
                            updateSearchParam('title_keywords', keywords.join(', '));
                          }
                        }}
                        className="w-4 h-4 text-blue-500 rounded cursor-pointer relative z-10 pointer-events-auto"
                      />
                      <span className="text-xs text-slate-400 font-data pointer-events-none">Self Employed</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer relative z-10 pointer-events-auto">
                      <input
                        type="checkbox"
                        checked={searchParams.changed_jobs_90_days === 'true' || searchParams.changed_jobs_90_days === true}
                        onChange={(e) => updateSearchParam('changed_jobs_90_days', e.target.checked ? 'true' : undefined)}
                        className="w-4 h-4 text-blue-500 rounded cursor-pointer relative z-10 pointer-events-auto"
                      />
                      <span className="text-xs text-slate-400 font-data pointer-events-none">Changed Jobs (90 days)</span>
                    </label>
                  </div>
                </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-200 font-data">Location</label>
                  <input
                    type="text"
                    value={String(searchParams.location || '')}
                    onChange={(e) => updateSearchParam('location', e.target.value)}
                    placeholder="Maryland, MD, United States"
                      className="group w-full px-4 py-2.5 rounded-xl field-inactive text-sm text-slate-200  focus:field-focused hover:border-slate-600/60 font-data"
                  />
                  {locationDiscoveryStatus && (
                      <p className="text-xs text-blue-400 font-data">{locationDiscoveryStatus}</p>
                    )}
                    </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-200 font-data">Current Company</label>
                    <input
                      type="text"
                      value={String(searchParams.current_company || '')}
                      onChange={(e) => updateSearchParam('current_company', e.target.value)}
                      placeholder="Apple, Google, Microsoft"
                      className="group w-full px-4 py-2.5 rounded-xl field-inactive text-sm text-slate-200  focus:field-focused hover:border-slate-600/60 font-data"
                    />
                </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-200 font-data">Industry</label>
                  <input
                    type="text"
                    value={String(searchParams.industry || '')}
                    onChange={(e) => updateSearchParam('industry', e.target.value)}
                    placeholder="Technology, Finance, Healthcare"
                      className="group w-full px-4 py-2.5 rounded-xl field-inactive text-sm text-slate-200  focus:field-focused hover:border-slate-600/60 font-data"
                  />
                  </div>
                </div>

                {/* Company Filters */}
                <div className="space-y-3 pt-4 border-t border-slate-700/50-subtle">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <label className="block text-xs text-slate-400 font-data">Past Company</label>
                  <input
                    type="text"
                        value={String(searchParams.past_company || '')}
                        onChange={(e) => updateSearchParam('past_company', e.target.value)}
                        placeholder="Previous employer"
                        className="w-full px-4 py-2 rounded-lg field-inactive text-slate-200  focus:field-focused font-data"
                  />
                </div>
                    <div className="space-y-2">
                      <label className="block text-xs text-slate-400 font-data">Company Headcount (Min)</label>
                  <input
                    type="number"
                        min="0"
                    value={String(searchParams.company_headcount_min || '')}
                        onChange={(e) => updateSearchParam('company_headcount_min', e.target.value.trim() || undefined)}
                        placeholder="0 = Self-employed"
                        className="w-full px-4 py-2 rounded-lg field-inactive text-slate-200  focus:field-focused font-data"
                  />
                </div>
                    <div className="space-y-2">
                      <label className="block text-xs text-slate-400 font-data">Company Headcount (Max)</label>
                  <input
                    type="number"
                        min="0"
                    value={String(searchParams.company_headcount_max || '')}
                        onChange={(e) => updateSearchParam('company_headcount_max', e.target.value.trim() || undefined)}
                    placeholder="10000"
                        className="w-full px-4 py-2 rounded-lg field-inactive text-slate-200  focus:field-focused font-data"
                  />
                    </div>
                  </div>
                </div>

                {/* Experience & Education Filters */}
                <div className="space-y-3 pt-4 border-t border-slate-700/50-subtle">
                  <h4 className="text-xs font-medium text-slate-200 font-data">Experience & Education</h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="space-y-2">
                      <label className="block text-xs text-slate-400 font-data">Years Experience (Min)</label>
                  <input
                    type="number"
                        min="0"
                    value={String(searchParams.years_experience_min || '')}
                        onChange={(e) => updateSearchParam('years_experience_min', e.target.value.trim() || undefined)}
                        placeholder="0"
                        className="w-full px-4 py-2 rounded-lg field-inactive text-slate-200  focus:field-focused font-data"
                  />
                </div>
                    <div className="space-y-2">
                      <label className="block text-xs text-slate-400 font-data">Years Experience (Max)</label>
                  <input
                    type="number"
                        min="0"
                    value={String(searchParams.years_experience_max || '')}
                        onChange={(e) => updateSearchParam('years_experience_max', e.target.value.trim() || undefined)}
                        placeholder="10"
                        className="w-full px-4 py-2 rounded-lg field-inactive text-slate-200  focus:field-focused font-data"
                  />
                </div>
                    <div className="space-y-2">
                      <label className="block text-xs text-slate-400 font-data">School / University</label>
                      <input
                        type="text"
                        value={String(searchParams.school || searchParams.university || '')}
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          updateSearchParam('school', val || undefined);
                          updateSearchParam('university', val || undefined);
                        }}
                        placeholder="Stanford, Harvard"
                        className="w-full px-4 py-2 rounded-lg field-inactive text-slate-200  focus:field-focused font-data"
                      />
              </div>
                  </div>
                </div>
              </div>
            )}

            {/* Pagination Settings */}
            <div className="space-y-3 pt-4 border-t border-slate-700/50-subtle">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-200 cursor-pointer font-data">
                    <input
                      type="checkbox"
                      checked={fetchAllPages}
                      onChange={(e) => setFetchAllPages(e.target.checked)}
                    className="w-4 h-4 text-blue-400 rounded border-slate-700/50 focus:ring-minimalist-accent"
                    />
                  Fetch Multiple Pages
                  </label>
                <span className="text-xs text-slate-500 font-data">
                  {fetchAllPages ? `Up to ${maxPagesToFetch} pages` : 'Single page only'}
                </span>
              </div>
                  {fetchAllPages && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="block text-xs text-slate-400 font-data">Max Pages</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={maxPagesToFetch}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 1;
                        setMaxPagesToFetch(Math.min(100, Math.max(1, val)));
                        }}
                      className="group w-full px-4 py-2.5 rounded-xl field-inactive text-slate-200  focus:field-focused hover:border-slate-600/60 font-data"
                    />
                    </div>
                  <div className="space-y-2">
                    <label className="block text-xs text-slate-400 font-data">Results Limit</label>
                  <input
                    type="number"
                    min="1"
                    max="2500"
                      value={String(searchParams.limit || '2500')}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 2500;
                        updateSearchParam('limit', String(Math.min(2500, Math.max(1, val))));
                    }}
                      className="group w-full px-4 py-2.5 rounded-xl field-inactive text-slate-200  focus:field-focused hover:border-slate-600/60 font-data"
                    />
                </div>
                </div>
              )}
            </div>


            {/* Search Button */}
            <div className="pt-6 border-t border-slate-700/50 space-y-3">
              {/* Countdown Timer */}
              {countdownSeconds > 0 && (
                <div className="flex items-center justify-center px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl">
                  <div className="flex items-center gap-2 text-slate-300">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm font-medium">
                      Try again in <span className="text-blue-400 font-mono font-bold">{formatCountdown(countdownSeconds)}</span>
                    </span>
                  </div>
                </div>
              )}
              
              <button
                onClick={handleSearch}
                disabled={isSearching || countdownSeconds > 0}
                className="group relative w-full py-4 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 hover:from-blue-600 hover:via-purple-600 hover:to-pink-600 rounded-xl text-white text-base font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98] overflow-hidden font-data"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                {isSearching ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2 text-white relative z-10" />
                    <span className="text-white relative z-10">Searching</span>
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5 mr-2 text-white relative z-10 group-hover:scale-110 transition-transform duration-300" />
                    <span className="text-white relative z-10">Start Search</span>
                  </>
                )}
              </button>
            </div>
          </div>
          </div>
        )}

      {/* Results */}
      {workflowStep === 'results' && results !== null && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-200 tracking-tight mb-1">Search Results</h2>
              <p className="text-sm text-slate-400">
                {results.length > 0 ? `${results.length} leads found` : 'No leads found'}
              </p>
            </div>
            {results.length > 0 && (
              <div className="flex gap-3">
            <button
              onClick={() => {
                    // Direct download of search results
                    const headers = ['Name', 'First Name', 'Last Name', 'Title', 'Company', 'Location', 'LinkedIn URL', 'Email', 'Phone', 'City', 'State', 'Zip'];
                    const rows = results.map((lead: any) => {
                      // Extract name - check camelCase first (API format), then snake_case, then construct
                      const rawFullName = lead.fullName || lead.name || lead.full_name || 
                        (lead.firstName || lead.first_name ? 
                          `${lead.firstName || lead.first_name} ${lead.lastName || lead.last_name || ''}`.trim() : 
                          '');
                      // Normalize name to remove credentials (e.g., "Mona Baset, MBA, MA" -> "Mona Baset")
                      const fullName = normalizeName(rawFullName);
                      const nameParts = fullName ? fullName.split(' ') : ['', ''];
                      
                      // Extract and parse location - check geoRegion first (API format), then location
                      const locationFull = lead.geoRegion || lead.location || lead.currentLocation || '';
                      const locationParts = locationFull ? locationFull.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0) : [];
                      // Format: "City, State, Country" or "State, Country"
                      const city = locationParts.length >= 3 ? locationParts[0] : locationParts.length === 2 ? '' : locationParts[0] || '';
                      const state = locationParts.length >= 2 ? locationParts[locationParts.length - 2] : '';
                      const zip = locationParts.length >= 3 ? locationParts[2] : locationParts.length === 2 ? locationParts[1] : '';
                      
                      return [
                        fullName || '',
                        nameParts[0] || '',
                        nameParts.slice(1).join(' ') || '',
                        lead.currentPosition?.title || lead.title || lead.job_title || lead.headline || '',
                        lead.currentPosition?.companyName || lead.company || lead.company_name || lead.currentCompany || '',
                        locationFull, // Keep full location for reference
                        lead.navigationUrl || lead.linkedin_url || lead.profile_url || lead.url || '',
                        lead.email || '',
                        lead.phone || lead.phone_number || '',
                        city,
                        state,
                        zip,
                      ];
                    });
                    
                    const csv = [headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `linkedin-leads-${new Date().toISOString().split('T')[0]}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  className="group px-4 py-2.5 btn-inactive rounded-xl text-slate-200 text-sm font-medium flex items-center gap-2"
                >
                  <Download className="w-4 h-4 group-hover:scale-110 group-hover:text-blue-400 transition-transform duration-300" />
                  Download CSV
            </button>
                <button
                  onClick={addToLeadList}
                  className="group px-4 py-2.5 btn-inactive rounded-xl text-slate-200 text-sm font-medium flex items-center gap-2"
                >
                  <ClipboardList className="w-4 h-4 group-hover:scale-110 group-hover:text-blue-400 transition-transform duration-300" />
                  Add to List
                </button>
                <button
                  onClick={() => setShowLeadList(true)}
                  className="group px-4 py-2.5 btn-inactive rounded-xl text-slate-200 text-sm flex items-center gap-2"
                >
                  <Eye className="w-4 h-4 group-hover:scale-110 group-hover:text-blue-400 transition-transform duration-300" />
                  View List ({leadList.length})
                </button>
                <button
                  onClick={testEnrichmentSingleLead}
                  disabled={isEnriching || leadList.length === 0}
                  className="group px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-white text-sm font-medium transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-105 active:scale-[0.98]"
                  title={leadList.length === 0 ? "Add at least one lead to your list first" : "Test enrichment with just the first lead (saves API calls)"}
                >
                  {isEnriching ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-300" />
                      Test Enrichment (1 lead)
                    </>
                  )}
                </button>
                <button
                  onClick={handleScrubOnly}
                  disabled={isScrubbing || leadList.length === 0}
                  className="group px-4 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-xl text-white text-sm font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-green-500/30 hover:shadow-xl hover:shadow-green-500/40 hover:scale-105 active:scale-[0.98]"
                  title={leadList.length === 0 ? "Add at least one lead with a phone number first" : "Scrub DNC status for all leads with phone numbers"}
                >
                  {isScrubbing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Scrubbing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-300" />
                      Scrub DNC
                    </>
                  )}
                </button>
                <div className="flex items-center gap-2">
                <button
                  onClick={handleEnrichAndScrub}
                  disabled={isEnriching || isScrubbing}
                  className="group relative px-5 py-2.5 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 hover:from-blue-600 hover:via-purple-600 hover:to-pink-600 rounded-xl text-white text-sm font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-105 active:scale-[0.98] overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                  {isEnriching ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2 text-white relative z-10" />
                      <span className="text-white relative z-10">Enriching...</span>
                    </>
                  ) : (
                    <>
                      <Rocket className="w-4 h-4 mr-2 text-white relative z-10 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-300" />
                      <span className="text-white relative z-10">Enrich & Scrub</span>
                    </>
                  )}
                </button>
                  <button
                    onClick={handleEnrichBackground}
                    disabled={isEnriching || isScrubbing || !results || results.length === 0}
                    className="group relative px-4 py-2.5 bg-slate-700/60 hover:bg-slate-700/80 border border-slate-600/50 hover:border-slate-500/60 rounded-xl text-slate-200 text-sm font-medium transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg hover:shadow-xl hover:scale-105 active:scale-[0.98]"
                    title="Run enrichment in the background (non-blocking)"
                  >
                    <Play className="w-4 h-4 group-hover:scale-110 transition-transform duration-300" />
                    <span>Background</span>
                </button>
                </div>
              </div>
            )}
                </div>

          {results.length > 0 ? (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-800/20 backdrop-blur-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="table-header">
                      <th className="px-6 py-4 text-left text-slate-200 font-semibold">Name</th>
                      <th className="px-6 py-4 text-left text-slate-200 font-semibold">Title</th>
                      <th className="px-6 py-4 text-left text-slate-200 font-semibold">Company</th>
                      <th className="px-6 py-4 text-left text-slate-200 font-semibold">City</th>
                      <th className="px-6 py-4 text-left text-slate-200 font-semibold">State</th>
                  </tr>
                </thead>
                <tbody>
                    {results.map((result: any, index: number) => {
                      // Extract name - check camelCase first (API format), then snake_case, then construct
                      const rawName = result.fullName || result.name || result.full_name || 
                        (result.firstName || result.first_name ? 
                          `${result.firstName || result.first_name} ${result.lastName || result.last_name || ''}`.trim() : 
                          '');
                      // Normalize name to remove credentials (e.g., "Mona Baset, MBA, MA" -> "Mona Baset")
                      const name = rawName ? normalizeName(rawName) : 'N/A';
                      
                      // Extract title - check nested currentPosition first, then top-level
                      const title = result.currentPosition?.title || result.title || result.job_title || result.headline || 'N/A';
                      
                      // Extract company - check nested currentPosition first, then top-level
                      const company = result.currentPosition?.companyName || result.company || result.company_name || 'N/A';
                      
                      // Extract and parse location - check geoRegion first (API format), then location
                      const locationFull = result.geoRegion || result.location || '';
                      const locationParts = locationFull ? locationFull.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0) : [];
                      
                      // PHASE 1 FIX: Properly parse location (same logic as above)
                      const countries = ['united states', 'usa', 'canada', 'uk', 'united kingdom', 'australia', 'germany', 'france', 'spain', 'italy', 'india', 'china', 'japan'];
                      let city = '';
                      let state = '';
                      
                      if (locationParts.length >= 3) {
                        city = locationParts[0];
                        state = locationParts[1];
                      } else if (locationParts.length === 2) {
                        const secondPart = locationParts[1].toLowerCase();
                        const isCountry = countries.some(c => secondPart.includes(c));
                        if (isCountry) {
                          city = '';
                          state = locationParts[0];
                        } else {
                          city = locationParts[0];
                          state = locationParts[1];
                        }
                      } else if (locationParts.length === 1) {
                        const singlePart = locationParts[0].toLowerCase();
                        const isCountry = countries.some(c => singlePart.includes(c));
                        if (!isCountry) {
                          state = locationParts[0];
                        }
                      }
                      
                      // VALIDATION: Never set city to country name
                      const cityLower = city.toLowerCase();
                      if (countries.some(c => cityLower.includes(c))) {
                        city = '';
                      }
                      
                      const cityDisplay = city || 'N/A';
                      const stateDisplay = state || 'N/A';
                      
                      return (
                        <tr key={index} className="group border-b border-slate-700/30 hover:bg-gradient-to-r hover:from-blue-500/5 hover:via-purple-500/5 hover:to-pink-500/5 transition-all duration-300 hover:border-blue-500/30 cursor-pointer">
                          <td className="px-6 py-4 text-slate-200 group-hover:text-blue-300 transition-colors duration-300 font-medium">{name}</td>
                          <td className="px-6 py-4 text-slate-400 group-hover:text-slate-300 transition-colors duration-300">{title}</td>
                          <td className="px-6 py-4 text-slate-400 group-hover:text-slate-300 transition-colors duration-300">{company}</td>
                          <td className="px-6 py-4 text-slate-400 group-hover:text-slate-300 transition-colors duration-300">{city}</td>
                          <td className="px-6 py-4 text-slate-400 group-hover:text-slate-300 transition-colors duration-300">{state}</td>
                    </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            </>
          ) : (
            <div className="px-6 py-8 panel-inactive rounded-lg text-center">
              <p className="text-slate-400">No leads found. Try adjusting your search filters.</p>
            </div>
          )}
          </div>
        )}

      {/* Enriched Results */}
      {workflowStep === 'complete' && leadSummaries.length > 0 && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-200 tracking-tight mb-1">Enriched & Scrubbed Leads</h2>
              <p className="text-sm text-slate-400">{leadSummaries.length} leads ready</p>
            </div>
            <div className="flex gap-3">
                <button
                  onClick={() => {
                    const csv = leadSummariesToCSV(getSortedSummaries());
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `enriched_leads_${new Date().toISOString().split('T')[0]}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                  }}
                className="px-4 py-2 btn-active rounded-lg text-white text-sm font-medium state-transition flex items-center"
                >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
                </button>
              </div>
            </div>
            
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="px-4 py-3 text-left text-slate-200 font-medium">Name</th>
                  <th className="px-4 py-3 text-left text-slate-200 font-medium">Platform</th>
                  <th className="px-4 py-3 text-left text-slate-200 font-medium">Phone</th>
                  <th className="px-4 py-3 text-left text-slate-200 font-medium">Email</th>
                  <th className="px-4 py-3 text-left text-slate-200 font-medium">City</th>
                  <th className="px-4 py-3 text-left text-slate-200 font-medium">State</th>
                  <th className="px-4 py-3 text-left text-slate-200 font-medium">Income</th>
                  <th className="px-4 py-3 text-left text-slate-200 font-medium">Source</th>
                  <th className="px-4 py-3 text-left text-slate-200 font-medium">DNC</th>
                  </tr>
                </thead>
                <tbody>
                  {getSortedSummaries().map((summary, index) => {
                    // Format platform badge
                    const platformDisplay = summary.platform ? (
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                        summary.platform === 'linkedin' 
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                          : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      }`}>
                        {summary.platform === 'linkedin' ? 'LinkedIn' : 'Facebook'}
                      </span>
                    ) : 'N/A';
                    
                    // Format source details
                    let sourceDisplay = summary.searchFilter || 'N/A';
                    if (summary.sourceDetails) {
                      const parts: string[] = [];
                      if (summary.sourceDetails.occupation || summary.sourceDetails.jobTitle) {
                        parts.push(summary.sourceDetails.occupation || summary.sourceDetails.jobTitle || '');
                      }
                      if (summary.sourceDetails.location) {
                        parts.push(summary.sourceDetails.location);
                      }
                      if (summary.sourceDetails.isSelfEmployed) {
                        parts.push('Self-Employed');
                      }
                      if (summary.sourceDetails.changedJobs) {
                        parts.push('Changed Jobs');
                      }
                      if (summary.sourceDetails.groupName) {
                        parts.push(`Group: ${summary.sourceDetails.groupName}`);
                      }
                      if (summary.sourceDetails.keywords && summary.sourceDetails.keywords.length > 0) {
                        parts.push(`Keywords: ${summary.sourceDetails.keywords.slice(0, 2).join(', ')}`);
                      }
                      if (parts.length > 0) {
                        sourceDisplay = parts.join(' | ');
                      }
                    }
                    
                    return (
                  <tr key={index} className="border-b border-slate-700/50-subtle hover:bg-minimalist-border/10 transition-colors">
                    <td className="px-4 py-3 text-slate-200">{summary.name || 'N/A'}</td>
                        <td className="px-4 py-3">{platformDisplay}</td>
                    <td className="px-4 py-3 text-slate-200 font-medium">{summary.phone || 'N/A'}</td>
                    <td className="px-4 py-3 text-slate-400">{summary.email || 'N/A'}</td>
                    <td className="px-4 py-3 text-slate-400">{summary.city || 'N/A'}</td>
                    <td className="px-4 py-3 text-slate-400">{summary.state || 'N/A'}</td>
                    <td className="px-4 py-3 text-slate-200">{summary.income ? `$${Number(summary.income).toLocaleString()}` : 'N/A'}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs max-w-xs truncate" title={sourceDisplay}>
                          {sourceDisplay}
                        </td>
                    <td className={`px-4 py-3 font-medium ${
                      summary.dncStatus === 'YES' ? 'text-red-500' : 
                      summary.dncStatus === 'NO' ? 'text-blue-400' : 
                      'text-slate-500'
                      }`}>
                        {summary.dncStatus || 'UNKNOWN'}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      {error && (
        <div className="px-6 py-4 bg-red-900/20 backdrop-blur-sm border border-red-500/50 rounded-xl shadow-xl animate-fade-in">
          <p className="text-red-400 font-medium">Error: {error}</p>
          </div>
        )}

      {showLeadList && (
        <LeadListViewer
          leads={leadList}
          onClose={() => setShowLeadList(false)}
          onRemoveLead={removeFromLeadList}
          onClearList={clearLeadList}
          onExport={exportLeadList}
          onEnrichList={enrichAllLeadsFromList}
        />
      )}
        </>
      )}

      {/* Facebook Tab - Hidden */}
      {/* {activeTab === 'facebook' && (
        <FacebookLeadGenerator />
      )} */}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg ${
          toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        } animate-in slide-in-from-top-5`}>
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <XCircle className="w-5 h-5" />
            )}
            <span className="font-medium">{toast.message}</span>
          </div>
          <button
            onClick={() => setToast(null)}
            className="ml-2 hover:opacity-70 transition-opacity"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
