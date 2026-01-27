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
 * Server-side automatic token refresh
 * Runs in background to refresh auth worker tokens before expiration
 */
function startTokenRefreshJob() {
  if (!isProduction) {
    console.log('[Server] Token refresh job disabled in development');
    return;
  }

  const REFRESH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
  // Refresh 30 minutes before expiration to ensure tokens are always valid
  // This is critical for DNC scrub API calls which must never fail due to expired tokens
  // Aligned with needsTokenRefresh() in tokenRefreshService.ts
  const PROACTIVE_REFRESH_BUFFER_MS = 30 * 60 * 1000; // 30 minutes

  async function checkAndRefreshTokens() {
    try {
      const { listSessionsFromServer, getSessionFromServer } = require('./app/auth-workers/utils/authWorkerServerStorage');
      const sessions = listSessionsFromServer();
      
      if (sessions.length === 0) {
        return;
      }

      console.log(`[Server] Checking ${sessions.length} auth worker(s) for token refresh...`);

      for (const sessionMeta of sessions) {
        try {
          const session = getSessionFromServer(sessionMeta.sessionId);
          if (!session) continue;

          const extractedVars = session.step2.extractedVars;
          const accessToken = extractedVars.access_token;
          
          if (!accessToken) continue;
          
          // Must have refresh capability
          const hasRefreshToken = !!extractedVars.refresh_token;
          const hasRefreshUrl = !!extractedVars.refresh_url;
          
          if (!hasRefreshToken && !hasRefreshUrl) {
            continue;
          }

          // Extract expiration time
          let expirationTime = null;
          
          if (extractedVars.expires_at) {
            expirationTime = parseInt(extractedVars.expires_at, 10);
          } else {
            // Try to extract from JWT
            try {
              const parts = accessToken.split('.');
              if (parts.length === 3) {
                const Buffer = require('buffer').Buffer;
                const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
                if (payload.exp) {
                  expirationTime = payload.exp * 1000;
                }
              }
            } catch {
              // JWT parsing failed
            }
          }

          if (!expirationTime) {
            continue;
          }

          const now = Date.now();
          const timeUntilExpiry = expirationTime - now;
          const timeUntilExpiryWithBuffer = timeUntilExpiry - PROACTIVE_REFRESH_BUFFER_MS;

          // Refresh if expired or within buffer window
          const shouldRefresh = 
            timeUntilExpiry <= 0 || // Already expired
            (timeUntilExpiryWithBuffer <= 0 && timeUntilExpiry > 0); // Within buffer window

          if (shouldRefresh) {
            const minutesUntilExpiry = Math.floor(timeUntilExpiry / 1000 / 60);
            const isExpired = timeUntilExpiry <= 0;
            const urgency = isExpired ? 'CRITICAL (expired)' : 
                           timeUntilExpiry < 5 * 60 * 1000 ? 'URGENT (<5min)' :
                           timeUntilExpiry < 15 * 60 * 1000 ? 'HIGH (<15min)' : 'NORMAL';
            
            console.log(`[Server] 🔄 Auto-refreshing token for ${sessionMeta.targetDomain || sessionMeta.sessionId} (${urgency}, expires in ${minutesUntilExpiry}min)`);
            
            // Use direct refresh function instead of API call for better error handling
            try {
              const { refreshAuthWorkerToken, getRefreshFailureStats } = require('./app/auth-workers/utils/tokenRefreshService');
              
              // Check failure stats before refresh
              const failureStats = getRefreshFailureStats(sessionMeta.sessionId);
              if (failureStats.needsAttention) {
                console.warn(`[Server] ⚠️ Session ${sessionMeta.sessionId.substring(0, 8)}... has ${failureStats.consecutiveFailures} consecutive failures`);
                console.warn(`[Server] Last error: ${failureStats.lastFailureError}`);
              }
              
              // Refresh with retry logic (built into refreshAuthWorkerToken)
              const refreshResult = await refreshAuthWorkerToken(sessionMeta.sessionId);
              
              if (refreshResult.success && refreshResult.newToken) {
                const newExpiresAt = refreshResult.expiresAt;
                const newTimeUntilExpiry = newExpiresAt ? newExpiresAt - Date.now() : null;
                const newMinutesUntilExpiry = newTimeUntilExpiry ? Math.floor(newTimeUntilExpiry / 1000 / 60) : null;
                
                console.log(`[Server] ✅ Token refreshed for ${sessionMeta.targetDomain || sessionMeta.sessionId}`, {
                  expiresAt: newExpiresAt ? new Date(newExpiresAt).toISOString() : 'unknown',
                  expiresIn: newMinutesUntilExpiry ? `${newMinutesUntilExpiry}min` : 'unknown',
                  retried: refreshResult.retried ? 'yes' : 'no',
                });
              } else {
                const errorMsg = refreshResult.error || 'Unknown error';
                console.error(`[Server] ❌ Token refresh failed for ${sessionMeta.targetDomain || sessionMeta.sessionId}:`, errorMsg);
                
                // If token is expired and refresh failed, this is critical
                if (isExpired) {
                  console.error(`[Server] 🚨 CRITICAL: Token is EXPIRED and refresh FAILED for ${sessionMeta.targetDomain || sessionMeta.sessionId}`);
                  console.error(`[Server] 🚨 DNC scrub API calls will fail until token is refreshed`);
                }
              }
            } catch (error) {
              console.error(`[Server] ❌ Token refresh error for ${sessionMeta.targetDomain || sessionMeta.sessionId}:`, error.message);
              console.error(`[Server] Stack:`, error.stack);
              
              // If token is expired, this is critical
              if (timeUntilExpiry <= 0) {
                console.error(`[Server] 🚨 CRITICAL: Token is EXPIRED and refresh threw exception`);
              }
            }
          }
        } catch (error) {
          console.error(`[Server] Error checking session ${sessionMeta.sessionId}:`, error.message);
        }
      }
    } catch (error) {
      console.error('[Server] Error in token refresh job:', error.message);
    }
  }

  // Initial check after 30 seconds (give server time to start)
  setTimeout(() => {
    checkAndRefreshTokens();
  }, 30000);

  // Set up interval
  const interval = setInterval(() => {
    checkAndRefreshTokens();
  }, REFRESH_CHECK_INTERVAL_MS);

  console.log('[Server] ✅ Token refresh job started (checks every 5 minutes)');

  // Cleanup on exit
  if (process.on) {
    process.on('SIGINT', () => {
      clearInterval(interval);
    });
    process.on('SIGTERM', () => {
      clearInterval(interval);
    });
  }
}

app.prepare().then(async () => {
  // Initialize auth workers before starting server (don't block startup)
  initializeAuthWorkers();
  
  // Start automatic token refresh job
  startTokenRefreshJob();
  
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
