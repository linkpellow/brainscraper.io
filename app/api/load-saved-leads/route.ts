import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { getDataDirectory, ensureDataDirectory } from '@/utils/dataDirectory';

/**
 * API endpoint to load all saved leads from data/api-results/
 * and return them in a format ready for enrichment
 */

export async function GET(request: NextRequest) {
  try {
    ensureDataDirectory();
    const dataDir = getDataDirectory();
    const resultsDir = path.join(dataDir, 'api-results');
    
    if (!fs.existsSync(resultsDir)) {
      return NextResponse.json({
        success: false,
        error: 'No saved results directory found',
        leads: [],
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
        processedFiles.push(file);
      } catch (fileError) {
        console.error(`Error processing file ${file}:`, fileError);
        // Continue with other files
      }
    }

    // Remove duplicates based on LinkedIn URL or fullName
    const uniqueLeads = Array.from(
      new Map(
        allLeads.map(lead => {
          const key = lead.navigationUrl || lead.linkedin_url || lead.profile_url || lead.url || 
                     lead.fullName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim();
          return [key, lead];
        })
      ).values()
    );

    return NextResponse.json({
      success: true,
      leads: uniqueLeads,
      totalLeads: uniqueLeads.length,
      fileCount: processedFiles.length,
      processedFiles: processedFiles.slice(0, 10), // First 10 files for reference
    });
  } catch (error) {
    console.error('Error loading saved leads:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        leads: [],
        fileCount: 0
      },
      { status: 500 }
    );
  }
}
