import { NextRequest, NextResponse } from 'next/server';
import { getDataFilePath, safeReadFile, ensureDataDirectory } from '@/utils/dataDirectory';

/**
 * API endpoint to load unenriched leads
 * Returns leads that have been scraped but not yet enriched
 * 
 * NOTE: This endpoint loads from api-results/ directory
 * which contains raw scraped data before enrichment
 */
export async function GET(request: NextRequest) {
  try {
    ensureDataDirectory();
    
    // Load from api-results directory (scraped but not enriched)
    const { getDataDirectory } = require('@/utils/dataDirectory');
    const dataDir = getDataDirectory();
    const fs = require('fs');
    const path = require('path');
    
    const resultsDir = path.join(dataDir, 'api-results');
    if (!fs.existsSync(resultsDir)) {
      return NextResponse.json({
        success: true,
        leads: [],
        totalLeads: 0,
        message: 'No unenriched leads found',
      });
    }
    
    // Get all JSON files in api-results
    const files = fs.readdirSync(resultsDir)
      .filter((file: string) => file.endsWith('.json') && file.startsWith('20'))
      .sort()
      .reverse(); // Most recent first
    
    const allLeads: any[] = [];
    
    for (const file of files) {
      try {
        const filePath = path.join(resultsDir, file);
        const content = safeReadFile(filePath);
        if (content) {
          const data = JSON.parse(content);
          // Extract leads from the response structure
          if (data.response?.data && Array.isArray(data.response.data)) {
            allLeads.push(...data.response.data);
          } else if (Array.isArray(data)) {
            allLeads.push(...data);
          }
        }
      } catch (error) {
        console.warn(`[LOAD_UNENRICHED] Error reading ${file}:`, error);
        // Continue with other files
      }
    }
    
    return NextResponse.json({
      success: true,
      leads: allLeads,
      totalLeads: allLeads.length,
      message: `Loaded ${allLeads.length} unenriched leads from ${files.length} files`,
    });
  } catch (error) {
    console.error('Error loading unenriched leads:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        leads: [],
        totalLeads: 0,
      },
      { status: 500 }
    );
  }
}
