import { NextResponse } from 'next/server';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * POST /api/dev/restart-servers
 * 
 * DEV ONLY: Restarts all development servers
 * - Kills Next.js dev server
 * - Kills mitmproxy
 * - Kills WebSocket bridge
 * - Restarts them all
 */
export async function POST() {
  // CRITICAL: Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { ok: false, error: 'Restart is only available in development mode' },
      { status: 403 }
    );
  }

  try {
    console.log('[restart-servers] Starting server restart...');

    // Kill all related processes
    const killCommands = [
      // Kill mitmproxy
      'pkill -f "mitmproxy.*stream_ws.py" || true',
      // Kill WebSocket bridge
      'pkill -f "tsx.*wsMitmBridge" || true',
      'pkill -f "node.*wsMitmBridge" || true',
    ];

    // Execute all kill commands
    for (const cmd of killCommands) {
      try {
        await execAsync(cmd);
        console.log(`[restart-servers] Executed: ${cmd}`);
      } catch (err) {
        // Ignore errors - process might not be running
        console.log(`[restart-servers] ${cmd} - no process to kill`);
      }
    }

    // Wait a moment for processes to fully terminate
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Start mitmproxy in background
    try {
      const mitmProcess = spawn('mitmproxy', [
        '-s', 'tools/mitmproxy/stream_ws.py',
        '--listen-port', process.env.MITM_PROXY_PORT || '8080',
        '--set', 'block_global=false',
      ], {
        detached: true,
        stdio: 'ignore',
        cwd: process.cwd(),
      });
      mitmProcess.unref();
      console.log('[restart-servers] Started mitmproxy');
    } catch (err) {
      console.warn('[restart-servers] Could not start mitmproxy:', err);
    }

    // Start WebSocket bridge in background
    try {
      const bridgeProcess = spawn('npm', ['run', 'mitm:bridge'], {
        detached: true,
        stdio: 'ignore',
        cwd: process.cwd(),
        shell: true,
      });
      bridgeProcess.unref();
      console.log('[restart-servers] Started WebSocket bridge');
    } catch (err) {
      console.warn('[restart-servers] Could not start bridge:', err);
    }

    // Note: We can't restart the Next.js server from within itself
    // The client will need to reload, which will reconnect to the restarted server

    return NextResponse.json({
      ok: true,
      message: 'Servers restarted. Page will reload automatically.',
      restarted: ['mitmproxy', 'bridge'],
      note: 'Next.js dev server continues running (cannot self-restart)',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[restart-servers] Error:', err);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 }
    );
  }
}

/**
 * GET /api/dev/restart-servers
 * 
 * Check if endpoint is available (dev mode check)
 */
export async function GET() {
  const isDev = process.env.NODE_ENV !== 'production';
  return NextResponse.json({
    ok: true,
    available: isDev,
    mode: process.env.NODE_ENV,
  });
}
