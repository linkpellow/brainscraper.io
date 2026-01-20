import { NextRequest, NextResponse } from 'next/server';

const MITM_PORT = process.env.MITM_PROXY_PORT || '8080';
const PROXY_SERVER = `http://127.0.0.1:${MITM_PORT}`;

// Keep a reference so we can close the previous instance when launching again
let launchedBrowser: { close(): Promise<void> } | null = null;

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
    const url = typeof body?.url === 'string' && body.url.trim() ? body.url.trim() : 'about:blank';

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

    const { chromium } = await import('playwright');

    // Close any previously launched browser so we don't pile up
    if (launchedBrowser) {
      await launchedBrowser.close().catch(() => {});
      launchedBrowser = null;
    }

    const browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    launchedBrowser = browser;

    const context = await browser.newContext({
      proxy: { server: PROXY_SERVER },
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    return NextResponse.json({
      ok: true,
      message: `Chromium launched with proxy ${PROXY_SERVER}. Use the browser window to click and browse; API calls will appear in the logs.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[launch-browser]', err);
    return NextResponse.json(
      {
        ok: false,
        error: /executable doesn't exist|executable doesn't exist at/i.test(msg)
          ? 'Chromium not installed. Run: npx playwright install chromium'
          : msg,
      },
      { status: 500 }
    );
  }
}
