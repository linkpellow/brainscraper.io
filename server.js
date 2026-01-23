// Custom server for Railway deployment
// Ensures proper port handling and error logging

const { createServer } = require('http');
const { parse } = require('url');
const { spawn } = require('child_process');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = process.env.PORT || 3000;

// Ensure production mode for Railway deployments
const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT === 'production';

/**
 * Initialize auth workers on startup (production only)
 * Note: Auth workers are gitignored, so they must be synced manually via:
 * npm run sync-auth-worker [sessionId] [productionUrl]
 * 
 * This function is kept for future use if we implement automatic syncing.
 */
function initializeAuthWorkers() {
  // Auth workers are gitignored and won't be in the build artifact
  // They must be synced manually using the sync script
  // This is intentional for security (tokens shouldn't be in git)
  if (isProduction) {
    console.log('[Server] Auth workers must be synced manually using: npm run sync-auth-worker');
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

app.prepare().then(() => {
  // Initialize auth workers before starting server
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
