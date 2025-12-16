import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { enrichData } from '@/utils/enrichData';
import { extractLeadSummary } from '@/utils/extractLeadSummary';
import type { EnrichedRow } from '@/utils/enrichData';
import type { LeadSummary } from '@/utils/extractLeadSummary';
import { getDataDirectory, ensureDataDirectory } from '@/utils/dataDirectory';

/**
 * API endpoint to migrate and enrich all saved leads from data/api-results/
 * This will process all saved leads, enrich them, and return them ready to save to localStorage
 */

export async function POST(request: NextRequest) {
  try {
    ensureDataDirectory();
    const dataDir = getDataDirectory();
    const resultsDir = path.join(dataDir, 'api-results');
    
    if (!fs.existsSync(resultsDir)) {
      return NextResponse.json({
        success: false,
        error: 'No saved results directory found',
        enrichedLeads: [],
        fileCount: 0
      });
    }

    // Get all JSON files in the directory
    const files = fs.readdirSync(resultsDir)
      .filter(file => file.endsWith('.json') && file.startsWith('20')) // Only timestamped files
      .sort()
      .reverse(); // Most recent first

    const allLeads: any[] = [];
    const processedFiles: string[] = [];

    console.log(`📂 Found ${files.length} files to process`);

    for (const file of files) {
      try {
        const filePath = path.join(resultsDir, file);
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const savedResult = JSON.parse(fileContent);

        // Extract leads from different possible structures
        let leads: any[] = [];

        if (savedResult.processedResults && Array.isArray(savedResult.processedResults)) {
          leads = savedResult.processedResults;
        } else if (savedResult.rawResponse?.response?.data && Array.isArray(savedResult.rawResponse.response.data)) {
          leads = savedResult.rawResponse.response.data;
        } else if (savedResult.rawResponse?.data?.response?.data && Array.isArray(savedResult.rawResponse.data.response.data)) {
          leads = savedResult.rawResponse.data.response.data;
        } else if (savedResult.results && Array.isArray(savedResult.results)) {
          leads = savedResult.results;
        } else if (savedResult.rawResponse?.data && Array.isArray(savedResult.rawResponse.data)) {
          leads = savedResult.rawResponse.data;
        } else if (Array.isArray(savedResult.rawResponse)) {
          leads = savedResult.rawResponse;
        }

        // Add metadata to each lead
        const enrichedLeads = leads.map((lead: any) => ({
          ...lead,
          _sourceFile: file,
          _sourceTimestamp: savedResult.metadata?.timestamp || savedResult.timestamp,
          _searchParams: savedResult.metadata?.searchParams || savedResult.searchParams,
        }));

        allLeads.push(...enrichedLeads);
        if (leads.length > 0) {
          processedFiles.push(file);
        }
      } catch (fileError) {
        console.error(`Error processing file ${file}:`, fileError);
        // Continue with other files
      }
    }

    console.log(`📊 Total leads extracted: ${allLeads.length} from ${processedFiles.length} files`);

    // Remove duplicates based on LinkedIn URL or fullName
    const seen = new Set<string>();
    const uniqueLeads = allLeads.filter(lead => {
      const key = lead.navigationUrl || lead.linkedin_url || lead.profile_url || lead.url || 
                 lead.fullName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`✨ Unique leads after deduplication: ${uniqueLeads.length}`);

    // Helper function to normalize names (remove credentials)
    const normalizeName = (name: string): string => {
      if (!name) return '';
      // Split by comma and take first part, then trim and remove trailing periods
      const firstPart = name.split(',')[0].trim();
      return firstPart.replace(/\.$/, '').trim();
    };

    // Helper functions to extract email/phone from summary
    const extractEmailFromSummary = (summary: string | undefined): string => {
      if (!summary) return '';
      const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
      const matches = summary.match(emailRegex);
      return matches && matches.length > 0 ? matches[0] : '';
    };

    const extractPhoneFromSummary = (summary: string | undefined): string => {
      if (!summary) return '';
      const phonePatterns = [
        /Phone:\s*([\d\s\-\(\)]+)/i,
        /Phone\s*:\s*([\d\s\-\(\)]+)/i,
        /Tel:\s*([\d\s\-\(\)]+)/i,
        /(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g,
      ];
      
      for (const pattern of phonePatterns) {
        const match = summary.match(pattern);
        if (match && match[1]) {
          const cleaned = match[1].replace(/[^\d+]/g, '');
          if (cleaned.length >= 10) {
            return cleaned;
          }
        }
      }
      return '';
    };

    // Convert to ParsedData format
    const headers = ['Name', 'Title', 'Company', 'Location', 'LinkedIn URL', 'Email', 'Phone', 'First Name', 'Last Name', 'City', 'State', 'Zip', 'Search Filter'];
    const rows = uniqueLeads.map((lead: any) => {
      const rawFullName = lead.fullName || lead.name || lead.full_name || 
        (lead.firstName || lead.first_name ? 
          `${lead.firstName || lead.first_name} ${lead.lastName || lead.last_name || ''}`.trim() : 
          '');
      const fullName = normalizeName(rawFullName);
      const nameParts = fullName.split(' ');
      const location = lead.geoRegion || lead.location || '';
      const locationParts = location.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
      
      // PHASE 1 FIX: Properly parse location (same logic as LinkedInLeadGenerator)
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
      
      // Extract email and phone from summary if not already in structured fields
      const summary = lead.summary || '';
      const extractedEmail = lead.email || extractEmailFromSummary(summary);
      const extractedPhone = lead.phone || lead.phone_number || extractPhoneFromSummary(summary);
      
      // Generate search filter from saved params
      const searchFilter = lead._searchParams ? 
        Object.entries(lead._searchParams)
          .filter(([k, v]) => v && k !== 'rapidApiKey' && k !== 'RAPIDAPI_KEY' && k !== 'endpoint')
          .map(([k, v]) => `${k}: ${v}`)
          .join(' | ') : 
        'From Saved Results';
      
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
        'City': lead.city || locationParts[0] || '',
        'State': lead.state || locationParts[1] || '',
        'Zip': lead.zip || lead.zipcode || lead.postal_code || locationParts[2] || '',
        'Search Filter': searchFilter,
      };
    });

    const parsedData = {
      headers,
      rows,
      rowCount: rows.length,
      columnCount: headers.length,
    };

    console.log(`🔄 Starting enrichment with OPTIMIZED PIPELINE...`);
    console.log(`   Pipeline: LinkedIn → ZIP (free) → Phone → Telnyx → Gatekeep → Age`);
    console.log(`   Processing ${rows.length} leads...`);

    // Enrich the leads with optimized pipeline
    const enriched = await enrichData(parsedData, (current, total) => {
      if (current % 10 === 0 || current === total) {
        console.log(`  Progress: ${current}/${total} (${Math.round((current/total)*100)}%)`);
      }
    });

    console.log(`✅ Enrichment completed`);

    // Extract lead summaries
    const summaries: LeadSummary[] = enriched.rows.map((row: EnrichedRow) => 
      extractLeadSummary(row, row._enriched)
    );

    console.log(`📋 Extracted ${summaries.length} lead summaries`);

    return NextResponse.json({
      success: true,
      enrichedLeads: summaries,
      totalLeads: summaries.length,
      fileCount: processedFiles.length,
      processedFiles: processedFiles.slice(0, 20), // First 20 files for reference
    });
  } catch (error) {
    console.error('Error migrating saved leads:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        enrichedLeads: [],
        fileCount: 0
      },
      { status: 500 }
    );
  }
}
