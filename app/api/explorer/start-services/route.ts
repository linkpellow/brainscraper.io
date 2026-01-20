import { NextResponse } from 'next/server';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const MITM_PORT = process.env.MITM_PROXY_PORT || '8080';
const BRIDGE_PORT = process.env.BRIDGE_PORT || '8787';

// Track spawned processes
const processes: { mitm?: any; bridge?: any } = {};

async function isPortInUse(port: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`lsof -i :${port} -t`);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * POST /api/explorer/start-services
 * 
 * Automatically starts mitmproxy and the WebSocket bridge if not already running
 */
export async function POST() {
  try {
    const status: { mitm: string; bridge: string; errors: string[] } = {
      mitm: 'unknown',
      bridge: 'unknown',
      errors: [],
    };

    // Check if mitmproxy is already running
    const mitmRunning = await isPortInUse(MITM_PORT);
    if (mitmRunning) {
      status.mitm = 'already_running';
    } else {
      // Start mitmproxy
      try {
        const mitmProcess = spawn('mitmproxy', [
          '-s', 'tools/mitmproxy/stream_ws.py',
          '--listen-port', MITM_PORT,
          '--set', 'block_global=false',
        ], {
          detached: true,
          stdio: 'ignore',
          cwd: process.cwd(),
        });

        mitmProcess.unref();
        processes.mitm = mitmProcess;
        
        // Wait a bit to check if it started
        await new Promise(resolve => setTimeout(resolve, 2000));
        const started = await isPortInUse(MITM_PORT);
        status.mitm = started ? 'started' : 'failed_to_start';
        
        if (!started) {
          status.errors.push('mitmproxy failed to start. Check if installed: pip install mitmproxy');
        }
      } catch (err) {
        status.mitm = 'error';
        status.errors.push(`mitmproxy error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Check if bridge is already running
    const bridgeRunning = await isPortInUse(BRIDGE_PORT);
    if (bridgeRunning) {
      status.bridge = 'already_running';
    } else {
      // Start bridge
      try {
        const bridgeProcess = spawn('npm', ['run', 'mitm:bridge'], {
          detached: true,
          stdio: 'ignore',
          cwd: process.cwd(),
          shell: true,
        });

        bridgeProcess.unref();
        processes.bridge = bridgeProcess;
        
        // Wait a bit to check if it started
        await new Promise(resolve => setTimeout(resolve, 2000));
        const started = await isPortInUse(BRIDGE_PORT);
        status.bridge = started ? 'started' : 'failed_to_start';
        
        if (!started) {
          status.errors.push('WebSocket bridge failed to start');
        }
      } catch (err) {
        status.bridge = 'error';
        status.errors.push(`Bridge error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const allGood = (status.mitm === 'started' || status.mitm === 'already_running') &&
                    (status.bridge === 'started' || status.bridge === 'already_running');

    return NextResponse.json({
      ok: allGood,
      status,
      message: allGood 
        ? 'Services are running and ready'
        : 'Some services failed to start. Check errors for details.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[start-services]', err);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 }
    );
  }
}

/**
 * GET /api/explorer/start-services
 * 
 * Check status of services
 */
export async function GET() {
  try {
    const mitmRunning = await isPortInUse(MITM_PORT);
    const bridgeRunning = await isPortInUse(BRIDGE_PORT);

    return NextResponse.json({
      ok: true,
      status: {
        mitm: mitmRunning ? 'running' : 'not_running',
        bridge: bridgeRunning ? 'running' : 'not_running',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
