import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { getDataDirectory, ensureDataDirectory } from '@/utils/dataDirectory';
import type { SavedApiResult } from '@/utils/saveApiResults';

interface ScrapeHistoryItem {
  filename: string;
  timestamp: string;
  date: string;
  time: string;
  leadCount: number;
  location?: string;
  state?: string;
  keywords?: string;
  jobTitle?: string;
  company?: string;
  filters: string[];
  endpoint: string;
  hasPagination: boolean;
  totalAvailable?: number;
}

/**
 * Extract state from location string
 */
function extractState(location?: string): string | undefined {
  if (!location) return undefined;
  
  // Common state patterns
  const statePatterns = [
    /\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b/i,
    /\b([A-Z]{2})\b/,
  ];
  
  for (const pattern of statePatterns) {
    const match = location.match(pattern);
    if (match) return match[1];
  }
  
  return undefined;
}

/**
 * Extract filter types and values from filters array
 */
function extractFilterInfo(filters?: any[]): { types: string[]; jobTitle?: string; company?: string } {
  if (!filters || !Array.isArray(filters)) {
    return { types: [] };
  }
  
  const types: string[] = [];
  let jobTitle: string | undefined;
  let company: string | undefined;
  
  filters.forEach((filter: any) => {
    if (filter.type) {
      types.push(filter.type);
      
      if (filter.type === 'JOB_TITLE' && filter.values?.[0]?.text) {
        jobTitle = filter.values[0].text;
      }
      if ((filter.type === 'CURRENT_COMPANY' || filter.type === 'PAST_COMPANY') && filter.values?.[0]?.text) {
        company = filter.values[0].text;
      }
    }
  });
  
  return { types, jobTitle, company };
}

export async function GET(request: NextRequest) {
  try {
    ensureDataDirectory();
    const dataDir = getDataDirectory();
    const resultsDir = path.join(dataDir, 'api-results');
    
    if (!fs.existsSync(resultsDir)) {
      return NextResponse.json({
        success: true,
        scrapes: [],
        total: 0,
      });
    }

    // Get all timestamped JSON files
    const files = fs.readdirSync(resultsDir)
      .filter(file => file.endsWith('.json') && file.startsWith('20'))
      .sort()
      .reverse(); // Most recent first

    const scrapes: ScrapeHistoryItem[] = [];

    for (const file of files) {
      try {
        const filePath = path.join(resultsDir, file);
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const savedResult: SavedApiResult = JSON.parse(fileContent);

        const metadata = savedResult.metadata;
        const timestamp = new Date(metadata.timestamp);
        const date = timestamp.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric' 
        });
        const time = timestamp.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });

        const location = metadata.location || metadata.searchParams?.location;
        const state = extractState(location);
        const keywords = metadata.keywords || metadata.searchParams?.keywords;
        
        const filterInfo = extractFilterInfo(metadata.filters || metadata.searchParams?.filters);
        const jobTitle = filterInfo.jobTitle || metadata.searchParams?.title_keywords;
        const company = filterInfo.company || metadata.searchParams?.current_company;

        scrapes.push({
          filename: file,
          timestamp: metadata.timestamp,
          date,
          time,
          leadCount: metadata.resultCount || 0,
          location,
          state,
          keywords,
          jobTitle,
          company,
          filters: filterInfo.types,
          endpoint: metadata.endpoint || 'unknown',
          hasPagination: metadata.hasPagination || false,
          totalAvailable: metadata.pagination?.total,
        });
      } catch (fileError) {
        console.error(`Error processing file ${file}:`, fileError);
        // Continue with other files
      }
    }

    return NextResponse.json({
      success: true,
      scrapes,
      total: scrapes.length,
    });
  } catch (error) {
    console.error('Error loading scrape history:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        scrapes: [],
        total: 0,
      },
      { status: 500 }
    );
  }
}
