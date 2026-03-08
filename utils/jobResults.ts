/**
 * Job result snapshots
 *
 * Stores per-job result payloads so the results API can return the exact
 * output produced by a specific background job.
 */

import { ensureDataDirectory, getDataDirectory, safeReadFile, safeWriteFile } from './dataDirectory';
import { withLock } from './fileLock';

export interface JobResultsSnapshot<T = unknown> {
  jobId: string;
  jobType: 'enrichment' | 'scraping' | 'facebook_automated';
  generatedAt: string;
  count: number;
  leads: T[];
}

function getJobResultsFilePath(jobId: string): string {
  return `${getDataDirectory()}/job-results/${jobId}.json`;
}

export async function saveJobResults<T>(
  jobId: string,
  jobType: 'enrichment' | 'scraping' | 'facebook_automated',
  leads: T[]
): Promise<{ count: number; filePath: string }> {
  ensureDataDirectory();

  const filePath = getJobResultsFilePath(jobId);
  const jobResultsDir = filePath.substring(0, filePath.lastIndexOf('/'));
  require('fs').mkdirSync(jobResultsDir, { recursive: true });
  const snapshot: JobResultsSnapshot<T> = {
    jobId,
    jobType,
    generatedAt: new Date().toISOString(),
    count: leads.length,
    leads,
  };

  await withLock(filePath, async () => {
    safeWriteFile(filePath, JSON.stringify(snapshot, null, 2));
  });

  return {
    count: snapshot.count,
    filePath,
  };
}

export function getJobResults<T = unknown>(jobId: string): JobResultsSnapshot<T> | null {
  const content = safeReadFile(getJobResultsFilePath(jobId));
  if (!content) {
    return null;
  }

  try {
    return JSON.parse(content) as JobResultsSnapshot<T>;
  } catch (error) {
    console.error(`❌ [JOB_RESULTS] Failed to parse job results for ${jobId}:`, error);
    return null;
  }
}
