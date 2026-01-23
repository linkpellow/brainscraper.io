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
 * Initialize auth workers on startup
 * Copies auth workers from build artifact to Railway persistent volume
 */
async function initializeAuthWorkers() {
  if (isProduction) {
    try {
      // Import and run initialization (runs async, doesn't block)
      require('./scripts/initialize-auth-workers.ts');
    } catch (error) {
      // If tsx isn't available or script fails, try direct require
      try {
        // In production build, the script might be compiled
        const initPath = require.resolve('./scripts/initialize-auth-workers');
        require(initPath);
      } catch (e) {
        console.warn('[Server] Auth worker initialization skipped (script not available):', error.message);
      }
    }
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
