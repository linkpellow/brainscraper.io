import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { getDataDirectory } from '@/utils/dataDirectory';
import type { SavedApiResult } from '@/utils/saveApiResults';

/**
 * Convert leads array to CSV format
 */
function leadsToCSV(leads: any[]): string {
  if (leads.length === 0) return '';

  // Get all unique keys from all leads
  const allKeys = new Set<string>();
  leads.forEach(lead => {
    Object.keys(lead).forEach(key => {
      if (!key.startsWith('_')) { // Exclude internal metadata
        allKeys.add(key);
      }
    });
  });

  const headers = Array.from(allKeys);
  
  // Create CSV header
  const csvRows = [headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',')];
  
  // Add data rows
  leads.forEach(lead => {
    const row = headers.map(header => {
      const value = lead[header];
      if (value === null || value === undefined) return '""';
      const stringValue = String(value).replace(/"/g, '""');
      return `"${stringValue}"`;
    });
    csvRows.push(row.join(','));
  });
  
  return csvRows.join('\n');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('filename');
    const format = searchParams.get('format') || 'json'; // 'json' or 'csv'

    if (!filename) {
      return NextResponse.json(
        { success: false, error: 'Filename parameter is required' },
        { status: 400 }
      );
    }

    // Security: Only allow files that start with timestamp pattern
    if (!filename.startsWith('20') || !filename.endsWith('.json')) {
      return NextResponse.json(
        { success: false, error: 'Invalid filename' },
        { status: 400 }
      );
    }

    const dataDir = getDataDirectory();
    const resultsDir = path.join(dataDir, 'api-results');
    const filePath = path.join(resultsDir, filename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const savedResult: SavedApiResult & { results?: any[] } = JSON.parse(fileContent);

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

    if (format === 'csv') {
      const csv = leadsToCSV(leads);
      const csvFilename = filename.replace('.json', '.csv');
      
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${csvFilename}"`,
        },
      });
    } else {
      // JSON format
      const jsonData = {
        metadata: savedResult.metadata,
        leads,
        totalLeads: leads.length,
      };
      
      const jsonFilename = filename;
      
      return new NextResponse(JSON.stringify(jsonData, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${jsonFilename}"`,
        },
      });
    }
  } catch (error) {
    console.error('Error downloading scrape:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
