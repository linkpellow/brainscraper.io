/**
 * Initialize Auth Workers on Startup
 * 
 * Copies auth workers from build artifact (data/auth-workers) to Railway persistent volume (DATA_DIR/auth-workers)
 * Runs on server startup to ensure auth workers are available in production
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getDataDirectory } from '../utils/dataDirectory';

const BUILD_DATA_DIR = join(process.cwd(), 'data', 'auth-workers');
const AUTH_WORKERS_SUBDIR = 'auth-workers';

async function initializeAuthWorkers() {
  // Only run on server
  if (typeof window !== 'undefined') {
    return;
  }

  try {
    // Get production data directory (DATA_DIR) or local data directory
    const dataDir = getDataDirectory();
    const productionAuthWorkersDir = join(dataDir, AUTH_WORKERS_SUBDIR);

    // Check if build artifact has auth workers
    if (!existsSync(BUILD_DATA_DIR)) {
      console.log('[AuthWorkersInit] No auth workers in build artifact');
      return;
    }

    const buildFiles = readdirSync(BUILD_DATA_DIR).filter(f => f.endsWith('.json'));
    
    if (buildFiles.length === 0) {
      console.log('[AuthWorkersInit] No auth worker files in build artifact');
      return;
    }

    console.log(`[AuthWorkersInit] Found ${buildFiles.length} auth worker(s) in build artifact`);

    // Ensure production auth workers directory exists
    if (!existsSync(productionAuthWorkersDir)) {
      mkdirSync(productionAuthWorkersDir, { recursive: true });
      console.log(`[AuthWorkersInit] Created production auth workers directory: ${productionAuthWorkersDir}`);
    }

    // Get existing production files (don't overwrite)
    const existingFiles = existsSync(productionAuthWorkersDir)
      ? readdirSync(productionAuthWorkersDir).filter(f => f.endsWith('.json'))
      : [];

    let copiedCount = 0;
    let skippedCount = 0;

    // Copy each auth worker from build to production
    for (const file of buildFiles) {
      const buildPath = join(BUILD_DATA_DIR, file);
      const productionPath = join(productionAuthWorkersDir, file);

      // Skip if already exists in production (don't overwrite)
      if (existsSync(productionPath)) {
        console.log(`[AuthWorkersInit] Skipping ${file} - already exists in production`);
        skippedCount++;
        continue;
      }

      try {
        // Read and validate session data
        const content = readFileSync(buildPath, 'utf-8');
        const session = JSON.parse(content);

        // Validate session structure
        if (!session.sessionId || !session.stabilized) {
          console.warn(`[AuthWorkersInit] Skipping ${file} - invalid session data`);
          continue;
        }

        // Copy to production
        writeFileSync(productionPath, content, 'utf-8');
        console.log(`[AuthWorkersInit] ✅ Copied ${file} (${session.targetDomain || session.sessionId})`);
        copiedCount++;
      } catch (error: any) {
        console.error(`[AuthWorkersInit] ❌ Failed to copy ${file}:`, error.message);
      }
    }

    console.log(`[AuthWorkersInit] Complete: ${copiedCount} copied, ${skippedCount} skipped`);
  } catch (error: any) {
    console.error('[AuthWorkersInit] ❌ Initialization error:', error.message);
    // Don't throw - allow server to start even if initialization fails
  }
}

// Run initialization
initializeAuthWorkers();
