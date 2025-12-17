import { NextRequest, NextResponse } from 'next/server';
import { getDataFilePath, safeReadFile, ensureDataDirectory, getDataDirectory } from '@/utils/dataDirectory';
import { loadAllEnrichedLeads } from '@/utils/incrementalSave';
import * as fs from 'fs';
import * as path from 'path';

/**
 * API endpoint to load enriched results from saved files
 * Returns partial results if available, so UI can display data immediately
 * 
 * Checks multiple sources:
 * 1. Main aggregated files (enriched-all-leads.json, etc.)
 * 2. Daily summary files in enriched-leads/ directory
 * 3. Individual lead files in enriched-leads/ directory
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
    
    // If no leads found in main files, check enriched-leads/ directory
    if (leads.length === 0) {
      try {
        // Try loading from daily summary files first (more efficient)
        const dataDir = getDataDirectory();
        const enrichedDir = path.join(dataDir, 'enriched-leads');
        
        if (fs.existsSync(enrichedDir)) {
          // Load all daily summary files (summary-YYYY-MM-DD.json)
          const summaryFiles = fs.readdirSync(enrichedDir)
            .filter(file => file.startsWith('summary-') && file.endsWith('.json'))
            .sort()
            .reverse(); // Most recent first
          
          const seenKeys = new Set<string>();
          const aggregatedLeads: any[] = [];
          
          for (const summaryFile of summaryFiles) {
            try {
              const filePath = path.join(enrichedDir, summaryFile);
              const content = safeReadFile(filePath);
              if (!content) continue;
              
              const data = JSON.parse(content);
              const dailyLeads = Array.isArray(data) ? data : [];
              
              for (const item of dailyLeads) {
                const leadSummary = item.leadSummary || item;
                if (!leadSummary) continue;
                
                // Use LinkedIn URL or name+email+phone as key for deduplication
                const leadKey = item.metadata?.leadKey || 
                  (leadSummary.linkedinUrl ? `linkedin:${leadSummary.linkedinUrl}` :
                   `${leadSummary.name || ''}:${leadSummary.email || ''}:${leadSummary.phone || ''}`);
                
                if (!seenKeys.has(leadKey) && leadKey !== ':') {
                  seenKeys.add(leadKey);
                  aggregatedLeads.push(leadSummary);
                }
              }
            } catch (error) {
              console.error(`Error loading summary file ${summaryFile}:`, error);
            }
          }
          
          if (hasData(aggregatedLeads)) {
            leads = aggregatedLeads;
            source = 'enriched-leads-summaries';
          } else {
            // Fallback: use loadAllEnrichedLeads() which loads from individual files
            const individualLeads = loadAllEnrichedLeads();
            if (hasData(individualLeads)) {
              leads = individualLeads;
              source = 'enriched-leads-individual';
            }
          }
        }
      } catch (error) {
        console.error('Error loading from enriched-leads directory:', error);
        // Continue - we'll return empty leads if nothing found
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
