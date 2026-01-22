import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BrowserCaptureService } from '@/src/server/browserCapture';

const execAsync = promisify(exec);

const MITM_PORT = process.env.MITM_PROXY_PORT || '8080';
const PROXY_SERVER = `http://127.0.0.1:${MITM_PORT}`;

// Keep a reference so we can close the previous instance when launching again
let captureService: BrowserCaptureService | null = null;

// Export function to set capture service (used by other endpoints)
export function getCaptureService(): BrowserCaptureService | null {
  return captureService;
}

async function isPortInUse(port: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`lsof -i :${port} -t`);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * POST /api/explorer/launch-browser
 *
 * Launches Playwright Chromium in headed mode with:
 * - Proxy set to mitmproxy (127.0.0.1:8080 by default) so traffic is captured
 * - ignoreHTTPSErrors so mitmproxy's cert is accepted
 *
 * Body (optional): { url?: string } — open this URL; default about:blank
 *
 * Requires: mitmproxy listening on 8080 (or MITM_PROXY_PORT), and
 * `npx playwright install chromium`.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const defaultStartUrl = `http://localhost:${process.env.PORT || 3000}/brainscraper-start`;
    const url = typeof body?.url === 'string' && body.url.trim() ? body.url.trim() : defaultStartUrl;

    // First, ensure mitmproxy and bridge are running
    console.log('[launch-browser] Starting services...');
    try {
      const servicesResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/explorer/start-services`, {
        method: 'POST',
      });
      const servicesData = await servicesResponse.json();
      console.log('[launch-browser] Services status:', servicesData);
      
      if (!servicesData.ok && servicesData.status?.errors?.length) {
        console.warn('[launch-browser] Service warnings:', servicesData.status.errors);
      }
    } catch (servErr) {
      console.warn('[launch-browser] Could not start services automatically:', servErr);
      // Continue anyway - services might already be running
    }

    // Verify mitmproxy is actually running before launching browser
    const mitmRunning = await isPortInUse(MITM_PORT);
    if (!mitmRunning) {
      return NextResponse.json(
        {
          ok: false,
          error: `mitmproxy is not running on port ${MITM_PORT}. Please start it first:\n\n  mitmproxy -s tools/mitmproxy/stream_ws.py\n\nOr use the "Start Services" button in the UI.`,
        },
        { status: 500 }
      );
    }

    // Verify bridge is running (check if port 8787 is in use)
    const bridgeRunning = await isPortInUse('8787');
    if (!bridgeRunning) {
      return NextResponse.json(
        {
          ok: false,
          error: `WebSocket bridge is not running on port 8787. Please start it first:\n\n  npm run mitm:bridge\n\nOr use the "Start Services" button in the UI.`,
        },
        { status: 500 }
      );
    }

    // Close any previously launched browser so we don't pile up
    if (captureService) {
      await captureService.close().catch(() => {});
      captureService = null;
    }

    // Create new capture service
    captureService = new BrowserCaptureService();

    try {
      // Connect to bridge
      console.log('[launch-browser] Connecting to bridge...');
      await captureService.connectBridge();
      
      // Launch browser with capture
      console.log('[launch-browser] Launching browser...');
      await captureService.launchBrowser(url);
      
      // Get session ID from capture service
      const sessionId = captureService.getSessionId();
      
      if (!sessionId) {
        throw new Error('Failed to get session ID from capture service');
      }
      
      return NextResponse.json({
        ok: true,
        sessionId,
        url: captureService.getBrowserUrl(),
        startedAt: captureService.getStartedAt(),
        message: `Browser launched with proxy ${PROXY_SERVER}. DOM interactions and network traffic are being captured.`,
      });
    } catch (captureError) {
      console.error('[launch-browser] Capture service error:', captureError);
      
      // Clean up on error
      if (captureService) {
        await captureService.close().catch(() => {});
        captureService = null;
      }
      
      throw captureError;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[launch-browser]', err);
    
    // Clean up on error
    if (captureService) {
      await captureService.close().catch(() => {});
      captureService = null;
    }
    
    // Provide specific error messages for common issues
    let errorMessage = msg;
    
    if (/executable doesn't exist|executable doesn't exist at/i.test(msg)) {
      errorMessage = 'Chromium not installed. Run: npx playwright install chromium';
    } else if (/ERR_PROXY_CONNECTION_FAILED|proxy.*connection/i.test(msg)) {
      errorMessage = `Proxy connection failed. mitmproxy may not be running on port ${MITM_PORT}.\n\nPlease start mitmproxy:\n\n  mitmproxy -s tools/mitmproxy/stream_ws.py\n\nOr check if it's running:\n\n  lsof -i :${MITM_PORT}`;
    } else if (/WebSocket|bridge.*connection/i.test(msg)) {
      errorMessage = `WebSocket bridge connection failed. Bridge may not be running on port 8787.\n\nPlease start the bridge:\n\n  npm run mitm:bridge\n\nOr check if it's running:\n\n  lsof -i :8787`;
    } else if (/net::ERR/i.test(msg)) {
      errorMessage = `Network error: ${msg}\n\nThis might indicate:\n- mitmproxy is not running on port ${MITM_PORT}\n- The target URL is not accessible\n- Network connectivity issues\n\nCheck mitmproxy status:\n  lsof -i :${MITM_PORT}`;
    }
    
    return NextResponse.json(
      {
        ok: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

// Cleanup endpoint for stopping browser
export async function DELETE() {
  try {
    if (captureService) {
      await captureService.close();
      captureService = null;
      return NextResponse.json({ ok: true, message: 'Browser capture stopped' });
    }
    return NextResponse.json({ ok: true, message: 'No active browser session' });
  } catch (err) {
    console.error('[stop-browser]', err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
