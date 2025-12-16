import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { enrichData } from '@/utils/enrichData';
import { extractLeadSummary } from '@/utils/extractLeadSummary';
import type { EnrichedRow } from '@/utils/enrichData';
import type { LeadSummary } from '@/utils/extractLeadSummary';
import { getDataDirectory, ensureDataDirectory } from '@/utils/dataDirectory';

/**
 * API endpoint to re-enrich existing leads from localStorage
 * Takes leads from request body and re-enriches them with the optimized pipeline
 * 
 * IMPORTANT: If phone/email are missing, tries to find original LinkedIn data from saved files
 */

/**
 * Extracts email from LinkedIn summary text
 * PHASE 5: Improved extraction with multiple patterns
 */
function extractEmailFromSummary(summary: string | undefined): string {
  if (!summary) {
    console.log('[EXTRACT_EMAIL] No summary provided');
    return '';
  }
  
  console.log(`[EXTRACT_EMAIL] Searching summary (${summary.length} chars) for email`);
  
  // Try multiple email patterns - be more aggressive
  const emailPatterns = [
    // Standard email anywhere in text (most common)
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    // With labels
    /Email:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    /E-mail:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    /Contact:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    /Mail:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    // With parentheses or brackets
    /\(([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\)/,
    /\[([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\]/,
  ];
  
  for (let i = 0; i < emailPatterns.length; i++) {
    const pattern = emailPatterns[i];
    const matches = summary.match(pattern);
    if (matches && matches.length > 0) {
      // Use the first match, or the captured group if it exists
      const email = (matches[1] || matches[0]).trim();
      if (email && email.includes('@') && email.length > 5) {
        console.log(`[EXTRACT_EMAIL] ✅ Found email using pattern ${i}: ${email.substring(0, 20)}...`);
        return email;
      }
    }
  }
  
  console.log(`[EXTRACT_EMAIL] ❌ No email found in summary`);
  return '';
}

/**
 * Extracts phone from LinkedIn summary text
 * PHASE 5: Improved extraction with multiple patterns
 */
function extractPhoneFromSummary(summary: string | undefined): string {
  if (!summary) {
    console.log('[EXTRACT_PHONE] No summary provided');
    return '';
  }
  
  console.log(`[EXTRACT_PHONE] Searching summary (${summary.length} chars) for phone`);
  
  const phonePatterns = [
    // With labels (most specific)
    /Phone:\s*([\d\s\-\(\)\+\.]+)/i,
    /Phone\s*:\s*([\d\s\-\(\)\+\.]+)/i,
    /Tel:\s*([\d\s\-\(\)\+\.]+)/i,
    /Telephone:\s*([\d\s\-\(\)\+\.]+)/i,
    /Mobile:\s*([\d\s\-\(\)\+\.]+)/i,
    /Call:\s*([\d\s\-\(\)\+\.]+)/i,
    /Cell:\s*([\d\s\-\(\)\+\.]+)/i,
    // Standard formats (more flexible)
    /(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g, // US: (123) 456-7890, 123-456-7890, etc.
    /(\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9})/g, // International
    // With parentheses or brackets
    /\(([\d\s\-\(\)\+\.]+)\)/g, // Anything in parentheses that looks like phone
  ];
  
  for (let i = 0; i < phonePatterns.length; i++) {
    const pattern = phonePatterns[i];
    const matches = summary.match(pattern);
    if (matches) {
      // Try all matches, not just first
      for (const match of matches) {
        const phoneStr = (match[1] || match[0] || match).trim();
        if (phoneStr) {
          // Clean phone number (remove non-digits except +)
          const cleaned = phoneStr.replace(/[^\d+]/g, '');
          // Must have at least 10 digits (US) or 7+ digits (international)
          if (cleaned.length >= 10 || (cleaned.startsWith('+') && cleaned.length >= 8)) {
            console.log(`[EXTRACT_PHONE] ✅ Found phone using pattern ${i}: ${cleaned.substring(0, 15)}...`);
            return cleaned;
          }
        }
      }
    }
  }
  
  console.log(`[EXTRACT_PHONE] ❌ No phone found in summary`);
  return '';
}

/**
 * Normalizes a name by removing credentials
 */
function normalizeName(name: string): string {
  if (!name) return '';
  const firstPart = name.split(',')[0].trim();
  return firstPart.replace(/\.$/, '').trim();
}

/**
 * Finds original LinkedIn lead data from saved files
 */
function findOriginalLeadData(leadName: string, leadCity?: string, leadState?: string): any | null {
  try {
    ensureDataDirectory();
    const dataDir = getDataDirectory();
    const resultsDir = path.join(dataDir, 'api-results');
    if (!fs.existsSync(resultsDir)) {
      console.log(`[FIND_ORIGINAL] Results directory does not exist: ${resultsDir}`);
      return null;
    }
    
    const files = fs.readdirSync(resultsDir)
      .filter(f => f.endsWith('.json') && f.startsWith('20'))
      .sort()
      .reverse();
    
    console.log(`[FIND_ORIGINAL] Searching ${files.length} files for "${leadName}"`);
    
    const normalizedSearchName = normalizeName(leadName).toLowerCase();
    
    // PHASE 2: Try multiple lookup strategies
    // Strategy 1: Exact name match with location
    // Strategy 2: Exact name match without location (if location is invalid)
    // Strategy 3: Partial name match (first + last name)
    
    const nameParts = normalizedSearchName.split(' ').filter(p => p.length > 0);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
    
    // Check if location is valid
    const countries = ['united states', 'usa', 'canada', 'uk', 'united kingdom'];
    const hasValidLocation = leadCity && 
      !countries.some(c => leadCity.toLowerCase().includes(c)) && 
      leadCity.length > 2;
    const hasValidState = leadState && leadState.length > 0;
    
    console.log(`[FIND_ORIGINAL] Lookup params:`, {
      name: leadName,
      normalizedName: normalizedSearchName,
      firstName,
      lastName,
      city: leadCity || 'NONE',
      state: leadState || 'NONE',
      hasValidLocation,
      hasValidState,
    });
    
    for (const file of files) {
      try {
        const filePath = path.join(resultsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        
        let leads: any[] = [];
        // Check all possible structures (same as migrate-saved-leads)
        if (data.processedResults && Array.isArray(data.processedResults)) {
          leads = data.processedResults;
        } else if (data.rawResponse?.response?.data && Array.isArray(data.rawResponse.response.data)) {
          leads = data.rawResponse.response.data;
        } else if (data.rawResponse?.data?.response?.data && Array.isArray(data.rawResponse.data.response.data)) {
          leads = data.rawResponse.data.response.data;
        } else if (data.results && Array.isArray(data.results)) {
          leads = data.results;
        } else if (data.rawResponse?.data && Array.isArray(data.rawResponse.data)) {
          leads = data.rawResponse.data;
        } else if (Array.isArray(data.rawResponse)) {
          leads = data.rawResponse;
        } else if (Array.isArray(data.data)) {
          leads = data.data;
        }
        
        for (const originalLead of leads) {
          const originalName = normalizeName(originalLead.fullName || originalLead.name || '').toLowerCase();
          
          // Strategy 1: Exact name match
          let nameMatches = originalName === normalizedSearchName;
          
          // Strategy 2: Partial match (first + last name)
          if (!nameMatches && firstName && lastName) {
            const originalParts = originalName.split(' ').filter(p => p.length > 0);
            const originalFirst = originalParts[0] || '';
            const originalLast = originalParts.length > 1 ? originalParts.slice(1).join(' ') : '';
            nameMatches = (originalFirst === firstName && originalLast === lastName) ||
                         (originalFirst === firstName && originalLast.includes(lastName)) ||
                         (originalFirst.includes(firstName) && originalLast === lastName);
          }
          
          if (nameMatches) {
            // Location matching - flexible
            let locationMatches = true;
            
            if (hasValidLocation || hasValidState) {
              const originalLocation = (originalLead.geoRegion || originalLead.location || '').toLowerCase();
              
              if (hasValidLocation) {
                locationMatches = originalLocation.includes(leadCity!.toLowerCase());
              }
              if (hasValidState && locationMatches) {
                locationMatches = originalLocation.includes(leadState!.toLowerCase());
              }
              
              if (!locationMatches) {
                console.log(`[FIND_ORIGINAL] Name matches but location doesn't: "${originalLocation}" vs city:"${leadCity}" state:"${leadState}"`);
                // Don't continue - try name-only match as fallback
              }
            }
            
            // If we have valid location and it matches, or if location is invalid, return the match
            if (locationMatches || (!hasValidLocation && !hasValidState)) {
              console.log(`[FIND_ORIGINAL] ✅ Found original lead "${leadName}" in file ${file}`);
              console.log(`[FIND_ORIGINAL] 📧 Summary length: ${(originalLead.summary || '').length} chars`);
              console.log(`[FIND_ORIGINAL] 📍 Original location: "${originalLead.geoRegion || originalLead.location || 'N/A'}"`);
              return originalLead;
            }
          }
        }
      } catch (error) {
        // Continue to next file
        console.log(`[FIND_ORIGINAL] Error reading file ${file}:`, error);
      }
    }
    
    console.log(`[FIND_ORIGINAL] ❌ Could not find original lead "${leadName}" in any saved files`);
  } catch (error) {
    console.error('[FIND_ORIGINAL] Error finding original lead data:', error);
  }
  
  return null;
}

export async function POST(request: NextRequest) {
  console.log('[API] ========== RE-ENRICH-LEADS API CALLED ==========');
  const diagnostics: any[] = [];
  const serverLogs: string[] = [];
  
  // Capture console.log output
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  
  console.log = (...args: any[]) => {
    serverLogs.push(`[LOG] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`);
    originalLog.apply(console, args);
  };
  
  console.error = (...args: any[]) => {
    serverLogs.push(`[ERROR] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`);
    originalError.apply(console, args);
  };
  
  console.warn = (...args: any[]) => {
    serverLogs.push(`[WARN] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`);
    originalWarn.apply(console, args);
  };
  
  try {
    console.log('[API] Parsing request body...');
    const body = await request.json();
    console.log('[API] Request body received:', {
      hasLeads: !!body.leads,
      leadsCount: Array.isArray(body.leads) ? body.leads.length : 0,
      firstLead: body.leads?.[0] ? {
        name: body.leads[0].name,
        hasEmail: !!body.leads[0].email,
        hasPhone: !!body.leads[0].phone,
      } : null,
    });
    
    const leads = body.leads || [];
    
    if (!Array.isArray(leads) || leads.length === 0) {
      console.error('[API] ERROR: No leads provided in request body');
      return NextResponse.json({
        success: false,
        error: 'No leads provided in request body',
        enrichedLeads: []
      });
    }

    console.log(`[API] 🔄 Re-enriching ${leads.length} leads with OPTIMIZED PIPELINE...`);
    console.log(`[API]    Pipeline: LinkedIn → ZIP (free) → Phone → Telnyx → Gatekeep → Age`);

    // Convert LeadSummary back to ParsedData format
    // If phone/email are missing, try to find original LinkedIn data
    const headers = ['Name', 'Title', 'Company', 'Location', 'LinkedIn URL', 'Email', 'Phone', 'First Name', 'Last Name', 'City', 'State', 'Zip', 'Search Filter'];
    
    const rows = leads.map((lead: LeadSummary) => {
      const nameParts = (lead.name || '').split(' ');
      
      // If phone/email are missing, try to find original LinkedIn data
      let email = lead.email || '';
      let phone = lead.phone || '';
      let title = '';
      let company = '';
      let linkedInUrl = '';
      let originalLead: any = null;

      // Normalize bogus placeholders coming from UI/localStorage
      if (email === 'EMPTY' || email === 'N/A') email = '';
      if (phone === 'EMPTY' || phone === 'N/A') phone = '';

      // Normalize bogus "city" values (we've seen "United States" coming through here)
      let city = (lead.city || '').trim();
      let state = (lead.state || '').trim();
      if (city.toLowerCase() === 'united states') city = '';

      // If state is missing, try to infer from searchFilter like: "location: Maryland | ..."
      if (!state && lead.searchFilter) {
        const m = lead.searchFilter.match(/location:\s*([^|]+)/i);
        if (m && m[1]) state = m[1].trim();
      }
      
      const leadDiagnostics: any = {
        leadName: lead.name,
        initialEmail: lead.email || 'EMPTY',
        initialPhone: lead.phone || 'EMPTY',
        leadCity: city || 'EMPTY',
        leadState: state || 'EMPTY',
      };
      
      if ((!email || !phone) && lead.name) {
        originalLead = findOriginalLeadData(lead.name, lead.city, lead.state);
        leadDiagnostics.originalDataLookup = {
          attempted: true,
          found: !!originalLead,
        };
        
        if (originalLead) {
          console.log(`   🔍 Found original LinkedIn data for "${lead.name}"`);
          const summary = originalLead.summary || '';
          const extractedEmail = extractEmailFromSummary(summary);
          const extractedPhone = extractPhoneFromSummary(summary);
          
          leadDiagnostics.originalDataLookup.summaryLength = summary.length;
          leadDiagnostics.originalDataLookup.extractedEmail = extractedEmail || 'NOT_FOUND';
          leadDiagnostics.originalDataLookup.extractedPhone = extractedPhone || 'NOT_FOUND';
          leadDiagnostics.originalDataLookup.summaryPreview = summary.substring(0, 500);
          leadDiagnostics.originalDataLookup.fullSummary = summary; // Include full summary for debugging
          
          // DEBUG: Log what we're searching for
          console.log(`[EXTRACTION_DEBUG] Searching summary (${summary.length} chars) for email/phone`);
          console.log(`[EXTRACTION_DEBUG] Summary contains '@': ${summary.includes('@')}`);
          console.log(`[EXTRACTION_DEBUG] Summary contains 'phone': ${summary.toLowerCase().includes('phone')}`);
          console.log(`[EXTRACTION_DEBUG] Summary contains 'tel': ${summary.toLowerCase().includes('tel')}`);
          console.log(`[EXTRACTION_DEBUG] Summary contains digits: ${/\d/.test(summary)}`);
          
          if (!email && extractedEmail) {
            email = extractedEmail;
            console.log(`   ✅ Extracted email from summary: ${email.substring(0, 10)}...`);
          }
          if (!phone && extractedPhone) {
            phone = extractedPhone;
            console.log(`   ✅ Extracted phone from summary: ${phone.substring(0, 5)}...`);
          }
          if (!extractedEmail && !extractedPhone) {
            console.log(`   ⚠️  No email/phone found in summary for "${lead.name}"`);
          }
          title = originalLead.currentPosition?.title || originalLead.title || '';
          company = originalLead.currentPosition?.companyName || originalLead.company || '';
          linkedInUrl = originalLead.navigationUrl || originalLead.linkedin_url || '';
        } else {
          console.log(`   ⚠️  Could not find original LinkedIn data for "${lead.name}"`);
          leadDiagnostics.originalDataLookup.reason = 'No matching lead found in saved files';
        }
      } else {
        leadDiagnostics.originalDataLookup = {
          attempted: false,
          reason: 'Email and phone already present',
        };
      }
      
      leadDiagnostics.finalEmail = email || 'EMPTY';
      leadDiagnostics.finalPhone = phone || 'EMPTY';
      diagnostics.push(leadDiagnostics);
      
      // DIAGNOSTIC: Log extracted data before creating row
      console.log(`[RE-ENRICH] Extracted data for "${lead.name}":`, {
        email: email || 'EMPTY',
        phone: phone || 'EMPTY',
        emailLength: email?.length || 0,
        phoneLength: phone?.length || 0,
        emailValid: email ? email.includes('@') : false,
        phoneValid: phone ? (phone.replace(/[^\d+]/g, '').length >= 10) : false,
        foundOriginalData: !!originalLead,
        hasSummary: !!originalLead?.summary,
        summaryLength: originalLead?.summary?.length || 0,
        originalLeadLocation: originalLead?.geoRegion || originalLead?.location || 'N/A',
        leadCity: lead.city || 'N/A',
        leadState: lead.state || 'N/A',
      });
      
      // CRITICAL: If we found original data but didn't extract email/phone, log the summary
      if (originalLead && (!email || !phone)) {
        const summary = originalLead.summary || '';
        console.log(`[RE-ENRICH] ⚠️  Original data found but email/phone missing. Summary preview:`, summary.substring(0, 200));
      }

      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      console.log(`[RE-ENRICH] Row creation for "${lead.name}":`, {
        firstName,
        lastName,
        hasFirstName: !!firstName,
        hasLastName: !!lastName,
        email: email || 'EMPTY',
        phone: phone || 'EMPTY',
      });
      
      return {
        'Name': lead.name || '',
        'Title': title,
        'Company': company,
        'Location': city && state ? `${city}, ${state}` : city || state || '',
        'LinkedIn URL': linkedInUrl,
        'Email': email,
        'Phone': phone,
        'First Name': firstName,
        'Last Name': lastName,
        'City': city,
        'State': state,
        'Zip': lead.zipcode || '',
        'Search Filter': lead.searchFilter || 'Re-enriched',
      };
    });

    const parsedData = {
      headers,
      rows,
      rowCount: rows.length,
      columnCount: headers.length,
    };

    // DIAGNOSTIC: Log what we're sending to enrichment
    console.log(`[API] About to enrich ${rows.length} rows`);
    console.log(`[API] First row sample:`, {
      Name: rows[0]?.['Name'],
      'First Name': rows[0]?.['First Name'],
      'Last Name': rows[0]?.['Last Name'],
      Email: rows[0]?.['Email'] || 'EMPTY',
      Phone: rows[0]?.['Phone'] || 'EMPTY',
      City: rows[0]?.['City'] || 'EMPTY',
      State: rows[0]?.['State'] || 'EMPTY',
    });

    // Enrich with optimized pipeline
    const enriched = await enrichData(parsedData, (current, total) => {
      if (current % 10 === 0 || current === total) {
        console.log(`  Progress: ${current}/${total} (${Math.round((current/total)*100)}%)`);
      }
    }); // Simple progress callback only
    
    // DIAGNOSTIC: Log what enrichment returned
    console.log(`[API] Enrichment complete. First row enriched data:`, {
      hasEnriched: !!enriched.rows[0]?._enriched,
      phone: enriched.rows[0]?._enriched?.phone || 'MISSING',
      email: enriched.rows[0]?._enriched?.email || 'MISSING',
      zipCode: enriched.rows[0]?._enriched?.zipCode || 'MISSING',
      hasSkipTracing: !!enriched.rows[0]?._enriched?.skipTracingData,
    });

    // Extract lead summaries
    console.log(`[API] Extracting lead summaries from ${enriched.rows.length} enriched rows...`);
    const summaries: LeadSummary[] = enriched.rows.map((row: EnrichedRow, index: number) => {
      console.log(`[API] Extracting summary ${index + 1}/${enriched.rows.length} for "${row['Name'] || 'UNKNOWN'}"`);
      const summary = extractLeadSummary(row, row._enriched);
      console.log(`[API] Summary ${index + 1} extracted:`, {
        name: summary.name,
        phone: summary.phone || 'EMPTY',
        email: summary.email || 'EMPTY',
        zipcode: summary.zipcode || 'EMPTY',
        city: summary.city || 'EMPTY',
        state: summary.state || 'EMPTY',
      });
      return summary;
    });

    console.log(`[API] ✅ Re-enrichment complete: ${summaries.length} leads processed`);
    console.log(`[API] Final summaries:`, summaries.map(s => ({
      name: s.name,
      phone: s.phone || 'EMPTY',
      email: s.email || 'EMPTY',
    })));

    // PHASE 6: Return comprehensive diagnostic info
    const response = {
      success: true,
      enrichedLeads: summaries,
      totalLeads: summaries.length,
      diagnostics: diagnostics, // Include diagnostic info for debugging
      enrichmentSummary: summaries.map((s, idx) => ({
        name: s.name,
        hasPhone: !!s.phone && s.phone !== 'EMPTY',
        hasEmail: !!s.email && s.email !== 'EMPTY',
        hasZipcode: !!s.zipcode && s.zipcode !== 'EMPTY',
        hasAge: !!s.dobOrAge && s.dobOrAge !== 'EMPTY',
        hasLineType: !!s.lineType && s.lineType !== 'EMPTY',
        hasCarrier: !!s.carrier && s.carrier !== 'EMPTY',
        phone: s.phone || 'EMPTY',
        email: s.email || 'EMPTY',
        zipcode: s.zipcode || 'EMPTY',
        dobOrAge: s.dobOrAge || 'EMPTY',
        lineType: s.lineType || 'EMPTY',
        carrier: s.carrier || 'EMPTY',
      })),
    };
    
    console.log('[API] ========== FINAL RESPONSE SUMMARY ==========');
    console.log('[API] Enrichment results:', response.enrichmentSummary);
    console.log('[API] ============================================');
    
    // PHASE 6: Add server-side logs to response for debugging
    const serverLogs: string[] = [];
    // Capture recent console logs (this is a simplified version - in production you'd use a logger)
    
    // Restore original console functions
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    
    return NextResponse.json({
      ...response,
      serverLogs: serverLogs.slice(-100), // Last 100 log lines
      serverDiagnostics: {
        totalLogLines: serverLogs.length,
        note: 'Server logs captured and included in response',
      },
    });
  } catch (error) {
    console.error('[API] ========== ERROR IN RE-ENRICH-LEADS ==========');
    console.error('[API] Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[API] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[API] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('[API] Full error object:', error);
    
    // Restore original console functions
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        enrichedLeads: [],
        errorDetails: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 5).join('\n'),
        } : String(error),
        serverLogs: serverLogs.slice(-100), // Last 100 log lines
      },
      { status: 500 }
    );
  }
}
