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
    
    // Always verify files exist (even if skipped)
    if (existsSync(PRODUCTION_AUTH_WORKERS_DIR)) {
      const verifyFiles = readdirSync(PRODUCTION_AUTH_WORKERS_DIR).filter(f => f.endsWith('.json'));
      console.log(`[Server] Verification: ${verifyFiles.length} files in ${PRODUCTION_AUTH_WORKERS_DIR}`);
      console.log(`[Server] Verification: DATA_DIR=${DATA_DIR}`);
      console.log(`[Server] Verification: Files: ${verifyFiles.join(', ')}`);
      
      // Try to read one file to verify it's valid
      if (verifyFiles.length > 0) {
        try {
          const testFile = join(PRODUCTION_AUTH_WORKERS_DIR, verifyFiles[0]);
          const testContent = readFileSync(testFile, 'utf-8');
          const testSession = JSON.parse(testContent);
          console.log(`[Server] Verification: Test file ${verifyFiles[0]} is valid:`, {
            sessionId: testSession.sessionId,
            stabilized: testSession.stabilized,
            version: testSession.version,
          });
        } catch (e) {
          console.error(`[Server] Verification: Test file ${verifyFiles[0]} is invalid:`, e.message);
        }
      }
    } else {
      console.warn(`[Server] Verification: Directory does not exist: ${PRODUCTION_AUTH_WORKERS_DIR}`);
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

/**
 * Server-side automatic token refresh.
 * Triggers /api/auth-worker/cron-refresh via HTTP (logic lives in Next.js bundle).
 * Must run only after the HTTP server is listening.
 */
function startTokenRefreshJob(port) {
  if (!isProduction) {
    console.log('[Server] Token refresh job disabled in development');
    return;
  }

  const REFRESH_CHECK_INTERVAL_MS = 5 * 60 * 1000;
  const URGENT_CHECK_INTERVAL_MS = 1 * 60 * 1000;
  const url = `http://127.0.0.1:${port}/api/auth-worker/cron-refresh`;
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.CRON_SECRET) {
    headers['Authorization'] = `Bearer ${process.env.CRON_SECRET}`;
  }

  let lastUrgent = false;
  let mainInterval = null;
  let urgentInterval = null;

  async function fetchCronRefresh() {
    const res = await fetch(url, { method: 'POST', headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[Server] Cron-refresh request failed:', res.status, data.error || res.statusText);
      return lastUrgent;
    }
    if (data.ok && typeof data.urgent === 'boolean') {
      lastUrgent = data.urgent;
    }
    return lastUrgent;
  }

  async function runCheckAndAdjustInterval() {
    try {
      const urgent = await fetchCronRefresh();
      if (urgent && !urgentInterval) {
        console.log('[Server] ⚠️ URGENT MODE: Switching to 1-minute checks due to near-expiry tokens');
        urgentInterval = setInterval(runCheckAndAdjustInterval, URGENT_CHECK_INTERVAL_MS);
      } else if (!urgent && urgentInterval) {
        console.log('[Server] ✅ NORMAL MODE: Switching back to 5-minute checks');
        clearInterval(urgentInterval);
        urgentInterval = null;
      }
    } catch (err) {
      console.error('[Server] Token refresh fetch error:', err.message);
    }
  }

  console.log('[Server] 🚀 Running IMMEDIATE token refresh check on startup...');
  (async () => {
    try {
      await runCheckAndAdjustInterval();
      console.log('[Server] ✅ Startup token check completed');
    } catch (err) {
      console.error('[Server] ⚠️ Startup token check failed:', err.message);
    }
    mainInterval = setInterval(runCheckAndAdjustInterval, REFRESH_CHECK_INTERVAL_MS);
    console.log('[Server] ✅ Token refresh job started (checks every 5 minutes, 1 minute when urgent)');

    if (process.on) {
      process.on('SIGINT', () => {
        if (mainInterval) clearInterval(mainInterval);
        if (urgentInterval) clearInterval(urgentInterval);
      });
      process.on('SIGTERM', () => {
        if (mainInterval) clearInterval(mainInterval);
        if (urgentInterval) clearInterval(urgentInterval);
      });
    }
  })();
}

app.prepare().then(async () => {
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
    startTokenRefreshJob(port);
  });
}).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
