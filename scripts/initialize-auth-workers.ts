/**
 * Initialize Auth Workers on Startup
 * 
 * This script runs during build/postbuild to ensure auth workers from local data/
 * are available in the build artifact, so they can be synced to production DATA_DIR.
 * 
 * NOTE: Since auth worker files are gitignored, they won't be in the repo.
 * This script is designed to run during local builds before deployment.
 * 
 * For Railway: Auth workers should be synced via the sync script or API endpoint.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';

const LOCAL_DATA_DIR = join(process.cwd(), 'data', 'auth-workers');
const BUILD_DATA_DIR = join(process.cwd(), '.next', 'auth-workers-seed');

async function initializeAuthWorkers() {
  try {
    // Check if local auth workers directory exists
    if (!existsSync(LOCAL_DATA_DIR)) {
      console.log('[AuthWorkersInit] No local auth workers directory found');
      return;
    }

    // Get list of local auth worker files
    const localFiles = readdirSync(LOCAL_DATA_DIR).filter(f => f.endsWith('.json'));
    
    if (localFiles.length === 0) {
      console.log('[AuthWorkersInit] No local auth worker files found');
      return;
    }

    console.log(`[AuthWorkersInit] Found ${localFiles.length} local auth worker(s)`);

    // Create build seed directory (for reference, but won't be deployed)
    if (!existsSync(BUILD_DATA_DIR)) {
      mkdirSync(BUILD_DATA_DIR, { recursive: true });
    }

    let processedCount = 0;

    // Process each auth worker
    for (const file of localFiles) {
      const localPath = join(LOCAL_DATA_DIR, file);
      const seedPath = join(BUILD_DATA_DIR, file);

      try {
        // Read and validate session data
        const content = readFileSync(localPath, 'utf-8');
        const session = JSON.parse(content);

        // Validate session structure
        if (!session.sessionId || !session.stabilized) {
          console.warn(`[AuthWorkersInit] Skipping ${file} - invalid session data`);
          continue;
        }

        // Write to seed directory (for build-time reference)
        writeFileSync(seedPath, content, 'utf-8');
        console.log(`[AuthWorkersInit] ✅ Processed ${file} (${session.targetDomain || session.sessionId})`);
        processedCount++;
      } catch (error: any) {
        console.error(`[AuthWorkersInit] ❌ Failed to process ${file}:`, error.message);
      }
    }

    console.log(`[AuthWorkersInit] Complete: ${processedCount} processed`);
    console.log(`[AuthWorkersInit] NOTE: Auth workers are gitignored. Use 'npm run sync-auth-worker' to sync to production.`);
  } catch (error: any) {
    console.error('[AuthWorkersInit] ❌ Initialization error:', error.message);
    // Don't throw - allow build to continue even if initialization fails
  }
}

// Run initialization
initializeAuthWorkers();
