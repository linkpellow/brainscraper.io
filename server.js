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

  const REFRESH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes (normal)
  const URGENT_CHECK_INTERVAL_MS = 1 * 60 * 1000; // Check every 1 minute when urgent
  // Refresh 2 HOURS before expiration to ensure tokens are always valid
  // This aggressive buffer accounts for: Railway deployments, network issues, retry delays
  // Critical for DNC scrub API calls which must never fail due to expired tokens
  const PROACTIVE_REFRESH_BUFFER_MS = 2 * 60 * 60 * 1000; // 2 hours
  const URGENT_REFRESH_THRESHOLD_MS = 1 * 60 * 60 * 1000; // 1 hour - triggers frequent checks

  async function checkAndRefreshTokens() {
    // Reset urgent mode at start of each check - will be set to true if any token is urgent
    urgentModeActive = false;
    
    try {
      // Use dynamic import to handle TypeScript modules correctly
      // Next.js compiles TypeScript to .next/server/app/ in production
      // Build absolute path to avoid double /app/app/ issue
      const { join } = require('path');
      let authWorkerStorage;
      const cwd = process.cwd();
      
      // Try production compiled path first (.next/server/app/...)
      const prodPath = join(cwd, '.next', 'server', 'app', 'auth-workers', 'utils', 'authWorkerServerStorage');
      try {
        authWorkerStorage = await import(prodPath);
      } catch (prodError) {
        // Fallback to source path (for development or if .next doesn't exist yet)
        const sourcePath = join(cwd, 'app', 'auth-workers', 'utils', 'authWorkerServerStorage');
        authWorkerStorage = await import(sourcePath);
      }
      const { listSessionsFromServer, getSessionFromServer } = authWorkerStorage;
      const sessions = listSessionsFromServer();
      
      if (sessions.length === 0) {
        return { urgentModeActive: false };
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
          const minutesUntilExpiry = Math.floor(timeUntilExpiry / 1000 / 60);
          const isExpired = timeUntilExpiry <= 0;
          const isUrgent = timeUntilExpiry <= URGENT_REFRESH_THRESHOLD_MS; // Within 1 hour

          // Track if ANY token is in urgent state (for interval adjustment)
          if (isUrgent && !isExpired) {
            urgentModeActive = true;
          }

          // Refresh if expired or within buffer window (2 hours)
          const shouldRefresh = 
            timeUntilExpiry <= 0 || // Already expired
            (timeUntilExpiryWithBuffer <= 0 && timeUntilExpiry > 0); // Within buffer window

          if (shouldRefresh) {
            const urgency = isExpired ? 'CRITICAL (expired)' : 
                           timeUntilExpiry < 5 * 60 * 1000 ? 'URGENT (<5min)' :
                           timeUntilExpiry < 15 * 60 * 1000 ? 'HIGH (<15min)' :
                           timeUntilExpiry < 60 * 60 * 1000 ? 'ELEVATED (<1hr)' : 'NORMAL';
            
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
                
                // Check if new token is still in urgent zone
                if (newTimeUntilExpiry && newTimeUntilExpiry > URGENT_REFRESH_THRESHOLD_MS) {
                  // Token is now safe, no longer urgent
                } else if (newTimeUntilExpiry) {
                  urgentModeActive = true; // Still urgent
                }
              } else {
                const errorMsg = refreshResult.error || 'Unknown error';
                console.error(`[Server] ❌ Token refresh failed for ${sessionMeta.targetDomain || sessionMeta.sessionId}:`, errorMsg);
                
                // CRITICAL ALERTS based on urgency level
                if (isExpired) {
                  console.error(`[Server] 🚨🚨🚨 CRITICAL ALERT 🚨🚨🚨`);
                  console.error(`[Server] 🚨 Token is EXPIRED and refresh FAILED`);
                  console.error(`[Server] 🚨 Session: ${sessionMeta.targetDomain || sessionMeta.sessionId}`);
                  console.error(`[Server] 🚨 Error: ${errorMsg}`);
                  console.error(`[Server] 🚨 DNC scrub API calls will fail until re-authenticated`);
                  console.error(`[Server] 🚨 ACTION REQUIRED: Create new auth worker from fresh HAR file`);
                  console.error(`[Server] 🚨🚨🚨 END CRITICAL ALERT 🚨🚨🚨`);
                } else if (timeUntilExpiry < 30 * 60 * 1000) {
                  // Less than 30 minutes - very high urgency
                  console.error(`[Server] ⚠️⚠️ HIGH URGENCY ALERT ⚠️⚠️`);
                  console.error(`[Server] ⚠️ Token expires in ${minutesUntilExpiry} minutes and refresh FAILED`);
                  console.error(`[Server] ⚠️ Session: ${sessionMeta.targetDomain || sessionMeta.sessionId}`);
                  console.error(`[Server] ⚠️ Error: ${errorMsg}`);
                  console.error(`[Server] ⚠️ Will retry in 1 minute (urgent mode active)`);
                  urgentModeActive = true;
                } else if (isUrgent) {
                  // 30-60 minutes - elevated urgency
                  console.warn(`[Server] ⚠️ ELEVATED ALERT: Token expires in ${minutesUntilExpiry} minutes and refresh failed`);
                  console.warn(`[Server] ⚠️ Session: ${sessionMeta.targetDomain || sessionMeta.sessionId}`);
                  urgentModeActive = true;
                }
              }
            } catch (error) {
              console.error(`[Server] ❌ Token refresh error for ${sessionMeta.targetDomain || sessionMeta.sessionId}:`, error.message);
              console.error(`[Server] Stack:`, error.stack);
              
              // Critical alerts for exceptions too
              if (isExpired) {
                console.error(`[Server] 🚨 CRITICAL: Token is EXPIRED and refresh threw exception`);
                console.error(`[Server] 🚨 ACTION REQUIRED: Create new auth worker from fresh HAR file`);
              } else if (isUrgent) {
                console.error(`[Server] ⚠️ URGENT: Token expires in ${minutesUntilExpiry}min and refresh threw exception`);
                urgentModeActive = true;
              }
            }
          } else {
            // Token not in refresh window yet, but check if it's approaching urgent
            if (isUrgent) {
              console.log(`[Server] 📊 Token for ${sessionMeta.targetDomain || sessionMeta.sessionId} expires in ${minutesUntilExpiry}min (monitoring)`);
            }
          }
        } catch (error) {
          console.error(`[Server] Error checking session ${sessionMeta.sessionId}:`, error.message);
        }
      }
      
      // Reset urgent mode if no tokens are urgent
      // (will be set to true above if any token is urgent)
    } catch (error) {
      // Handle module import errors specifically
      if (error.code === 'MODULE_NOT_FOUND' || error.message.includes('Cannot find module')) {
        console.error('[Server] Failed to import authWorkerServerStorage:', error.message);
        console.error('[Server] Token refresh job will be disabled - module not available');
        console.error('[Server] This may be expected in development or if auth workers are not configured');
      } else {
        console.error('[Server] Error in token refresh job:', error.message);
      }
    }
    
    return { urgentModeActive };
  }

  // Track if any tokens need urgent attention
  let urgentModeActive = false;
  let urgentInterval = null;

  // Wrapper that also checks for urgent tokens
  async function checkTokensAndAdjustInterval() {
    const result = await checkAndRefreshTokens();
    
    // checkAndRefreshTokens will set urgentModeActive if any tokens are within 1 hour
    if (urgentModeActive && !urgentInterval) {
      console.log('[Server] ⚠️ URGENT MODE: Switching to 1-minute checks due to near-expiry tokens');
      urgentInterval = setInterval(checkAndRefreshTokens, URGENT_CHECK_INTERVAL_MS);
    } else if (!urgentModeActive && urgentInterval) {
      console.log('[Server] ✅ NORMAL MODE: Switching back to 5-minute checks');
      clearInterval(urgentInterval);
      urgentInterval = null;
    }
  }

  // IMMEDIATE check on startup - MUST complete before starting intervals
  // This ensures tokens are refreshed before any API calls can be made
  console.log('[Server] 🚀 Running IMMEDIATE token refresh check on startup...');
  
  (async () => {
    try {
      await checkTokensAndAdjustInterval();
      console.log('[Server] ✅ Startup token check completed');
    } catch (err) {
      console.error('[Server] ⚠️ Startup token check failed:', err.message);
      // Continue anyway - intervals will handle subsequent checks
    }
    
    // Set up regular interval (5 minutes) AFTER startup check completes
    const interval = setInterval(() => {
      checkTokensAndAdjustInterval();
    }, REFRESH_CHECK_INTERVAL_MS);

    console.log('[Server] ✅ Token refresh job started (checks every 5 minutes, 1 minute when urgent)');

    // Cleanup on exit - clear BOTH intervals
    if (process.on) {
      process.on('SIGINT', () => {
        clearInterval(interval);
        if (urgentInterval) clearInterval(urgentInterval);
      });
      process.on('SIGTERM', () => {
        clearInterval(interval);
        if (urgentInterval) clearInterval(urgentInterval);
      });
    }
  })();
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
