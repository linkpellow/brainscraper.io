/**
 * Utility to automatically save API results
 * Since we're paying for every API call, save all data for future use
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ApiResultMetadata {
  timestamp: string;
  endpoint: string;
  searchParams: Record<string, any>;
  resultCount: number;
  hasPagination: boolean;
  pagination?: {
    total?: number;
    count?: number;
    start?: number;
    hasMore?: boolean;
  };
  filters?: any[];
  keywords?: string;
  location?: string;
}

export interface SavedApiResult {
  metadata: ApiResultMetadata;
  rawResponse: any;
  processedResults?: any[];
}

/**
 * Save API results to disk
 * Creates timestamped files in data/api-results/
 */
export async function saveApiResults(
  endpoint: string,
  searchParams: Record<string, any>,
  rawResponse: any,
  processedResults?: any[]
): Promise<string | null> {
  try {
    // Use centralized data directory utility
    const { getDataDirectory, ensureDataDirectory } = await import('./dataDirectory');
    ensureDataDirectory();
    const dataDir = getDataDirectory();
    const resultsDir = path.join(dataDir, 'api-results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    // Extract result count
    let resultCount = 0;
    if (Array.isArray(processedResults)) {
      resultCount = processedResults.length;
    } else if (rawResponse?.response?.data && Array.isArray(rawResponse.response.data)) {
      resultCount = rawResponse.response.data.length;
    } else if (rawResponse?.data?.response?.data && Array.isArray(rawResponse.data.response.data)) {
      resultCount = rawResponse.data.response.data.length;
    } else if (rawResponse?.data && Array.isArray(rawResponse.data)) {
      resultCount = rawResponse.data.length;
    } else if (Array.isArray(rawResponse)) {
      resultCount = rawResponse.length;
    }

    // Extract pagination info
    const pagination = 
      rawResponse?.response?.pagination ||
      rawResponse?.data?.response?.pagination ||
      rawResponse?.pagination ||
      rawResponse?.data?.pagination ||
      null;

    // Extract filters from search params
    const filters = searchParams.filters || [];

    // Create metadata
    const metadata: ApiResultMetadata = {
      timestamp: new Date().toISOString(),
      endpoint,
      searchParams: {
        ...searchParams,
        // Don't include API key in saved data
        rapidApiKey: undefined,
        RAPIDAPI_KEY: undefined,
      },
      resultCount,
      hasPagination: !!pagination,
      pagination: pagination ? {
        total: pagination.total,
        count: pagination.count,
        start: pagination.start,
        hasMore: pagination.total ? (pagination.start + pagination.count) < pagination.total : false,
      } : undefined,
      filters: filters.length > 0 ? filters : undefined,
      keywords: searchParams.keywords || undefined,
      location: searchParams.location || undefined,
    };

    // Create saved result object
    const savedResult: SavedApiResult = {
      metadata,
      rawResponse,
      processedResults: processedResults && processedResults.length > 0 ? processedResults : undefined,
    };

    // Generate filename with timestamp and endpoint
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const endpointSlug = endpoint.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const filename = `${timestamp}-${endpointSlug}.json`;
    const filepath = path.join(resultsDir, filename);

    // Save to file
    fs.writeFileSync(filepath, JSON.stringify(savedResult, null, 2), 'utf-8');

    // Also save to a daily summary file for easy browsing
    const dateStr = new Date().toISOString().split('T')[0];
    const summaryFile = path.join(resultsDir, `summary-${dateStr}.json`);
    
    let dailySummary: any[] = [];
    if (fs.existsSync(summaryFile)) {
      try {
        const existing = fs.readFileSync(summaryFile, 'utf-8');
        dailySummary = JSON.parse(existing);
      } catch {
        dailySummary = [];
      }
    }

    // Add to daily summary (just metadata, not full results)
    dailySummary.push({
      timestamp: metadata.timestamp,
      endpoint,
      resultCount,
      filename,
      searchParams: {
        location: metadata.location,
        keywords: metadata.keywords,
        filters: metadata.filters ? metadata.filters.map((f: any) => f.type) : undefined,
      },
      pagination: metadata.pagination,
    });

    // Keep only last 1000 entries per day to avoid huge files
    if (dailySummary.length > 1000) {
      dailySummary = dailySummary.slice(-1000);
    }

    fs.writeFileSync(summaryFile, JSON.stringify(dailySummary, null, 2), 'utf-8');

    return filepath;
  } catch (error) {
    console.error('Error saving API results:', error);
    return null;
  }
}

/**
 * Get all saved API results for a date range
 */
export function getSavedApiResults(startDate?: Date, endDate?: Date): SavedApiResult[] {
  try {
    const resultsDir = path.join(process.cwd(), 'data', 'api-results');
    if (!fs.existsSync(resultsDir)) {
      return [];
    }

    const files = fs.readdirSync(resultsDir)
      .filter(f => f.endsWith('.json') && f.startsWith('20')) // Only timestamped files
      .map(f => {
        const filepath = path.join(resultsDir, f);
        try {
          const content = fs.readFileSync(filepath, 'utf-8');
          const result: SavedApiResult = JSON.parse(content);
          
          // Filter by date range if provided
          if (startDate || endDate) {
            const resultDate = new Date(result.metadata.timestamp);
            if (startDate && resultDate < startDate) return null;
            if (endDate && resultDate > endDate) return null;
          }
          
          return result;
        } catch {
          return null;
        }
      })
      .filter((r): r is SavedApiResult => r !== null);

    // Sort by timestamp (newest first)
    return files.sort((a, b) => 
      new Date(b.metadata.timestamp).getTime() - new Date(a.metadata.timestamp).getTime()
    );
  } catch (error) {
    console.error('Error reading saved API results:', error);
    return [];
  }
}

/**
 * Get daily summary for a specific date
 */
export function getDailySummary(date: Date): any[] {
  try {
    const resultsDir = path.join(process.cwd(), 'data', 'api-results');
    const dateStr = date.toISOString().split('T')[0];
    const summaryFile = path.join(resultsDir, `summary-${dateStr}.json`);
    
    if (!fs.existsSync(summaryFile)) {
      return [];
    }

    const content = fs.readFileSync(summaryFile, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error reading daily summary:', error);
    return [];
  }
}
