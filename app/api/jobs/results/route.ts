/**
 * API Route to Retrieve Job Results
 * 
 * Returns the actual results from completed jobs
 */

import { NextRequest, NextResponse } from 'next/server';
import { getJobStatus } from '@/utils/jobStatus';
import { loadAllEnrichedLeads } from '@/utils/incrementalSave';
import * as fs from 'fs';
import * as path from 'path';
import { getDataDirectory, safeReadFile } from '@/utils/dataDirectory';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: 'jobId is required' },
        { status: 400 }
      );
    }

    // Get job status
    const job = getJobStatus(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    // Only return results for completed jobs
    if (job.status !== 'completed') {
      return NextResponse.json(
        { 
          success: false, 
          error: `Job is ${job.status}. Results only available for completed jobs.`,
          jobStatus: job.status
        },
        { status: 400 }
      );
    }

    // Get results based on job type
    if (job.type === 'enrichment') {
      // Load enriched leads from disk (they're saved incrementally)
      const enrichedLeads = loadAllEnrichedLeads();
      
      // Filter by job metadata if available (for future enhancement)
      // For now, return all enriched leads since they're saved incrementally
      return NextResponse.json({
        success: true,
        jobId,
        jobType: 'enrichment',
        results: {
          leads: enrichedLeads,
          count: enrichedLeads.length,
        },
        metadata: job.metadata,
      });
    } else if (job.type === 'scraping') {
      // Load scraped leads from api-results directory
      // Find the most recent file that matches the job's search params
      const dataDir = getDataDirectory();
      const resultsDir = path.join(dataDir, 'api-results');
      
      if (!fs.existsSync(resultsDir)) {
        return NextResponse.json({
          success: true,
          jobId,
          jobType: 'scraping',
          results: {
            leads: [],
            count: 0,
            message: 'No results directory found',
          },
          metadata: job.metadata,
        });
      }

      // Get all result files, sorted by modification time (newest first)
      const files = fs.readdirSync(resultsDir)
        .filter(file => file.endsWith('.json') && file.startsWith('20'))
        .map(file => {
          const filePath = path.join(resultsDir, file);
          const stats = fs.statSync(filePath);
          return { file, filePath, mtime: stats.mtime.getTime() };
        })
        .sort((a, b) => b.mtime - a.mtime);

      // Try to find a file that matches the job's search params
      // For now, return the most recent file (since we just saved it)
      let leads: any[] = [];
      
      if (files.length > 0) {
        // Check the most recent file first
        const recentFile = files[0];
        const content = safeReadFile(recentFile.filePath);
        
        if (content) {
          try {
            const savedResult = JSON.parse(content);
            
            // Extract leads from different possible structures
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
          } catch (error) {
            console.error(`Error parsing result file ${recentFile.file}:`, error);
          }
        }
      }

      return NextResponse.json({
        success: true,
        jobId,
        jobType: 'scraping',
        results: {
          leads,
          count: leads.length,
        },
        metadata: job.metadata,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Unknown job type' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error retrieving job results:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
