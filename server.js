// Custom server for Railway deployment (web only). Desktop app uses Next.js standalone server.
// Ensures proper port handling and error logging

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = process.env.PORT || 3000;

// Ensure production mode for Railway deployments
const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT === 'production';

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
  const server = createServer(async (req, res) => {
    const parsedUrl = parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '';
    const isWarnScrape = pathname === '/api/warn/scrape';
    const timeoutMs = isWarnScrape ? 130000 : 30000; // 130s for WARN scrape (Python subprocess), 30s for others
    req.setTimeout(timeoutMs);
    res.setTimeout(timeoutMs);

    // Handle connection errors gracefully
    req.on('error', (err) => {
      if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
        console.error('[Server] Request error:', err.code, req.url);
      }
      if (!res.headersSent) {
        res.statusCode = 400;
        res.end();
      }
    });

    res.on('error', (err) => {
      if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
        console.error('[Server] Response error:', err.code, req.url);
      }
    });

    try {
      await handle(req, res, parsedUrl);
    } catch (err) {
      // Don't log connection reset errors as they're common and expected
      if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE' && err.code !== 'ECONNABORTED') {
        console.error('[Server] Error handling', req.url, err.message);
      }
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal server error');
      }
    }
  });

  // Configure server timeouts and keep-alive
  server.keepAliveTimeout = 65000; // 65 seconds (Railway default is 60s, add buffer)
  server.headersTimeout = 66000; // 66 seconds (must be > keepAliveTimeout)
  server.maxHeadersCount = 2000; // Increase header limit if needed
  
  // Handle server-level errors
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Server] Port ${port} is already in use`);
      process.exit(1);
    } else {
      console.error('[Server] Server error:', err);
    }
  });

  // Handle client connection errors (don't crash server)
  server.on('clientError', (err, socket) => {
    if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
      // These are common and expected, just close the socket
      socket.destroy();
    } else {
      console.error('[Server] Client error:', err.code);
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }
  });

  server.listen(port, hostname, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Server configured: keepAliveTimeout=${server.keepAliveTimeout}ms, headersTimeout=${server.headersTimeout}ms`);
  });
}).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
