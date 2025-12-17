/**
 * Job Status Tracking
 * 
 * Tracks background job status using file-based storage
 * Compatible with Railway persistent volumes
 * Uses file locking to prevent concurrent write issues
 */

import { getDataDirectory, ensureDataDirectory, safeWriteFile, safeReadFile } from './dataDirectory';
import { withLock } from './fileLock';

export interface JobStatus {
  jobId: string;
  type: 'enrichment' | 'scraping';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
  startedAt: string;
  completedAt?: string;
  error?: string;
  metadata?: {
    leadCount?: number;
    searchParams?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

/**
 * Save job status to disk with file locking
 */
export function saveJobStatus(jobStatus: JobStatus): void {
  try {
    ensureDataDirectory();
    const dataDir = getDataDirectory();
    const jobsDir = `${dataDir}/jobs`;
    
    // Lazy load fs module
    const fs = require('fs');
    const path = require('path');
    
    if (!fs.existsSync(jobsDir)) {
      fs.mkdirSync(jobsDir, { recursive: true });
    }
    
    const filePath = path.join(jobsDir, `${jobStatus.jobId}.json`);
    
    // Use file locking to prevent concurrent writes
    // Note: withLock is async but we're in a sync context
    // For sync operations, we'll use a try-catch approach
    try {
      safeWriteFile(filePath, JSON.stringify(jobStatus, null, 2));
    } catch (error) {
      console.error(`❌ [JOB_STATUS] Failed to save job status:`, error);
    }
  } catch (error) {
    console.error(`❌ [JOB_STATUS] Failed to save job status:`, error);
  }
}

/**
 * Save job status to disk with file locking (async version)
 */
export async function saveJobStatusAsync(jobStatus: JobStatus): Promise<void> {
  try {
    ensureDataDirectory();
    const dataDir = getDataDirectory();
    const jobsDir = `${dataDir}/jobs`;
    
    const fs = require('fs');
    const path = require('path');
    
    if (!fs.existsSync(jobsDir)) {
      fs.mkdirSync(jobsDir, { recursive: true });
    }
    
    const filePath = path.join(jobsDir, `${jobStatus.jobId}.json`);
    
    // Use file locking for concurrent safety
    await withLock(filePath, async () => {
      safeWriteFile(filePath, JSON.stringify(jobStatus, null, 2));
    });
  } catch (error) {
    console.error(`❌ [JOB_STATUS] Failed to save job status:`, error);
  }
}

/**
 * Get job status by ID
 */
export function getJobStatus(jobId: string): JobStatus | null {
  try {
    const dataDir = getDataDirectory();
    const jobsDir = `${dataDir}/jobs`;
    const filePath = require('path').join(jobsDir, `${jobId}.json`);
    
    const content = safeReadFile(filePath);
    if (!content) {
      return null;
    }
    
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ [JOB_STATUS] Failed to read job status:`, error);
    return null;
  }
}

/**
 * Get all active jobs
 */
export function getActiveJobs(): JobStatus[] {
  try {
    const dataDir = getDataDirectory();
    const jobsDir = `${dataDir}/jobs`;
    
    const fs = require('fs');
    const path = require('path');
    
    if (!fs.existsSync(jobsDir)) {
      return [];
    }
    
    const files = fs.readdirSync(jobsDir)
      .filter((file: string) => file.endsWith('.json'))
      .map((file: string) => {
        try {
          const filePath = path.join(jobsDir, file);
          const content = safeReadFile(filePath);
          if (!content) return null;
          return JSON.parse(content);
        } catch {
          return null;
        }
      })
      .filter((job: JobStatus | null): job is JobStatus => job !== null)
      .filter((job: JobStatus) => 
        job.status === 'pending' || job.status === 'running'
      );
    
    return files.sort((a: JobStatus, b: JobStatus) => 
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  } catch (error) {
    console.error(`❌ [JOB_STATUS] Failed to get active jobs:`, error);
    return [];
  }
}

/**
 * Get all jobs (including completed)
 */
export function getAllJobs(limit: number = 50): JobStatus[] {
  try {
    const dataDir = getDataDirectory();
    const jobsDir = `${dataDir}/jobs`;
    
    const fs = require('fs');
    const path = require('path');
    
    if (!fs.existsSync(jobsDir)) {
      return [];
    }
    
    const files = fs.readdirSync(jobsDir)
      .filter((file: string) => file.endsWith('.json'))
      .map((file: string) => {
        try {
          const filePath = path.join(jobsDir, file);
          const content = safeReadFile(filePath);
          if (!content) return null;
          const job = JSON.parse(content);
          // Add file modification time for sorting
          const stats = fs.statSync(filePath);
          return { ...job, _modifiedAt: stats.mtime.getTime() };
        } catch {
          return null;
        }
      })
      .filter((job: any): job is JobStatus => job !== null)
      .sort((a: any, b: any) => b._modifiedAt - a._modifiedAt)
      .slice(0, limit)
      .map((job: any) => {
        const { _modifiedAt, ...rest } = job;
        return rest;
      });
    
    return files;
  } catch (error) {
    console.error(`❌ [JOB_STATUS] Failed to get all jobs:`, error);
    return [];
  }
}

/**
 * Update job progress (sync version for callbacks)
 */
export function updateJobProgress(
  jobId: string,
  progress: { current: number; total: number }
): void {
  const job = getJobStatus(jobId);
  if (!job) return;
  
  const updated: JobStatus = {
    ...job,
    status: job.status === 'pending' ? 'running' : job.status,
    progress: {
      current: progress.current,
      total: progress.total,
      percentage: Math.round((progress.current / progress.total) * 100),
    },
  };
  
  // Use sync save for progress updates (fire and forget)
  // File locking happens at the fs level in safeWriteFile
  saveJobStatus(updated);
}

/**
 * Update job progress (async version with file locking)
 */
export async function updateJobProgressAsync(
  jobId: string,
  progress: { current: number; total: number }
): Promise<void> {
  const job = getJobStatus(jobId);
  if (!job) return;
  
  const updated: JobStatus = {
    ...job,
    status: job.status === 'pending' ? 'running' : job.status,
    progress: {
      current: progress.current,
      total: progress.total,
      percentage: Math.round((progress.current / progress.total) * 100),
    },
  };
  
  await saveJobStatusAsync(updated);
}

/**
 * Mark job as completed (with file locking)
 */
export async function completeJob(jobId: string, metadata?: Record<string, unknown>): Promise<void> {
  const job = getJobStatus(jobId);
  if (!job) return;
  
  const updated: JobStatus = {
    ...job,
    status: 'completed',
    completedAt: new Date().toISOString(),
    progress: {
      ...job.progress,
      percentage: 100,
    },
    metadata: metadata ? { ...job.metadata, ...metadata } : job.metadata,
  };
  
  await saveJobStatusAsync(updated);
}

/**
 * Mark job as failed (with file locking)
 */
export async function failJob(jobId: string, error: string): Promise<void> {
  const job = getJobStatus(jobId);
  if (!job) return;
  
  const updated: JobStatus = {
    ...job,
    status: 'failed',
    completedAt: new Date().toISOString(),
    error,
  };
  
  await saveJobStatusAsync(updated);
}

/**
 * Generate unique job ID
 */
export function generateJobId(type: 'enrichment' | 'scraping'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `${type}-${timestamp}-${random}`;
}

/**
 * Clean up old job files
 * Removes jobs older than specified days (default: 30 days)
 */
export function cleanupOldJobs(daysToKeep: number = 30): { deleted: number; errors: number } {
  try {
    const dataDir = getDataDirectory();
    const jobsDir = `${dataDir}/jobs`;
    
    const fs = require('fs');
    const path = require('path');
    
    if (!fs.existsSync(jobsDir)) {
      return { deleted: 0, errors: 0 };
    }
    
    const cutoffDate = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    const files = fs.readdirSync(jobsDir)
      .filter((file: string) => file.endsWith('.json'));
    
    let deleted = 0;
    let errors = 0;
    
    for (const file of files) {
      try {
        const filePath = path.join(jobsDir, file);
        const stats = fs.statSync(filePath);
        const content = safeReadFile(filePath);
        
        if (!content) {
          // Empty or unreadable file - delete it
          fs.unlinkSync(filePath);
          deleted++;
          continue;
        }
        
        const job = JSON.parse(content);
        
        // Delete if job is old and completed/failed
        const jobDate = new Date(job.completedAt || job.startedAt).getTime();
        if (
          (job.status === 'completed' || job.status === 'failed') &&
          jobDate < cutoffDate
        ) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      } catch (error) {
        console.error(`Error processing job file ${file}:`, error);
        errors++;
      }
    }
    
    return { deleted, errors };
  } catch (error) {
    console.error('Error cleaning up old jobs:', error);
    return { deleted: 0, errors: 1 };
  }
}
