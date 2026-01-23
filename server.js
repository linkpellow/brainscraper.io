// Custom server for Railway deployment
// Ensures proper port handling and error logging

const { createServer } = require('http');
const { parse } = require('url');
const { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } = require('fs');
const { join } = require('path');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = process.env.PORT || 3000;

// Ensure production mode for Railway deployments
const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT === 'production';

/**
 * Initialize auth workers on startup
 * Copies auth workers from build artifact to Railway persistent volume
 */
function initializeAuthWorkers() {
  if (!isProduction) return;

  try {
    const BUILD_DATA_DIR = join(process.cwd(), 'data', 'auth-workers');
    const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
    const PRODUCTION_AUTH_WORKERS_DIR = join(DATA_DIR, 'auth-workers');

    // Check if build artifact has auth workers
    if (!existsSync(BUILD_DATA_DIR)) {
      console.log('[Server] No auth workers in build artifact');
      return;
    }

    const buildFiles = readdirSync(BUILD_DATA_DIR).filter(f => f.endsWith('.json'));
    
    if (buildFiles.length === 0) {
      console.log('[Server] No auth worker files in build artifact');
      return;
    }

    console.log(`[Server] Found ${buildFiles.length} auth worker(s) in build artifact`);

    // Ensure production auth workers directory exists
    if (!existsSync(PRODUCTION_AUTH_WORKERS_DIR)) {
      mkdirSync(PRODUCTION_AUTH_WORKERS_DIR, { recursive: true });
      console.log(`[Server] Created production auth workers directory: ${PRODUCTION_AUTH_WORKERS_DIR}`);
    }

    let copiedCount = 0;
    let skippedCount = 0;

    // Copy each auth worker from build to production
    for (const file of buildFiles) {
      const buildPath = join(BUILD_DATA_DIR, file);
      const productionPath = join(PRODUCTION_AUTH_WORKERS_DIR, file);

      // Skip if already exists in production (don't overwrite)
      if (existsSync(productionPath)) {
        skippedCount++;
        continue;
      }

      try {
        // Read and validate session data
        const content = readFileSync(buildPath, 'utf-8');
        const session = JSON.parse(content);

        // Validate session structure
        if (!session.sessionId || !session.stabilized) {
          console.warn(`[Server] Skipping ${file} - invalid session data`);
          continue;
        }

        // Copy to production
        writeFileSync(productionPath, content, 'utf-8');
        console.log(`[Server] ✅ Copied ${file} (${session.targetDomain || session.sessionId})`);
        copiedCount++;
      } catch (error) {
        console.error(`[Server] ❌ Failed to copy ${file}:`, error.message);
      }
    }

    console.log(`[Server] Auth workers initialized: ${copiedCount} copied, ${skippedCount} skipped`);
    
    // Verify files were written correctly
    if (copiedCount > 0) {
      const verifyFiles = readdirSync(PRODUCTION_AUTH_WORKERS_DIR).filter(f => f.endsWith('.json'));
      console.log(`[Server] Verification: ${verifyFiles.length} files in ${PRODUCTION_AUTH_WORKERS_DIR}`);
      console.log(`[Server] Verification: Files: ${verifyFiles.join(', ')}`);
    }
  } catch (error) {
    console.warn('[Server] Auth worker initialization failed (non-critical):', error.message);
  }
}

const app = next({ 
  dev: !isProduction, 
  hostname, 
  port,
  // Disable server actions if not needed (prevents "Failed to find Server Action" errors)
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
});
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // Initialize auth workers before starting server (don't block startup)
  initializeAuthWorkers();
  
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  }).listen(port, hostname, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
}).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
