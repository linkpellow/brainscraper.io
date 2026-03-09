/**
 * Resolve standalone dir and spawn Next.js standalone server with env.
 */

import path from 'path';
import fs from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import http from 'http';

const DEFAULT_PORT = 3000;

/**
 * When running from electron/ folder (npm run start), cwd is electron/ so project root is parent.
 */
export function getProjectRoot(cwd: string, isPackaged: boolean): string {
  if (isPackaged) return cwd;
  const basename = path.basename(cwd);
  if (basename === 'electron' && fs.existsSync(path.join(cwd, '..', '.next', 'standalone'))) {
    return path.join(cwd, '..');
  }
  return cwd;
}

export function getStandaloneDir(
  resourcesPath: string,
  projectRoot: string,
  isPackaged: boolean
): string {
  if (isPackaged) {
    const inResources = path.join(resourcesPath, 'standalone');
    if (fs.existsSync(inResources)) return inResources;
  }
  return path.join(projectRoot, '.next', 'standalone');
}

/**
 * Next.js 16+ may put server.js inside a package-named subfolder. Return dir that contains server.js.
 */
export function getStandaloneServerDir(standaloneDir: string): string {
  const atRoot = path.join(standaloneDir, 'server.js');
  if (fs.existsSync(atRoot)) return standaloneDir;
  const entries = fs.readdirSync(standaloneDir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory() && !e.name.startsWith('.')) {
      const sub = path.join(standaloneDir, e.name);
      if (fs.existsSync(path.join(sub, 'server.js'))) return sub;
    }
  }
  return standaloneDir;
}

export function startNextServer(
  standaloneDir: string,
  envOverrides: Record<string, string>,
  port: number = DEFAULT_PORT
): ChildProcess {
  const serverDir = getStandaloneServerDir(standaloneDir);
  const serverPath = path.join(serverDir, 'server.js');
  if (!fs.existsSync(serverPath)) {
    throw new Error(`Standalone server not found at ${serverPath}. Run "npm run build" first.`);
  }
  const child = spawn(process.execPath, [serverPath], {
    cwd: serverDir,
    env: {
      ...process.env,
      ...envOverrides,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return child;
}

export function getAppUrl(port: number = DEFAULT_PORT): string {
  return `http://127.0.0.1:${port}`;
}

export async function waitForServerReady(
  port: number = DEFAULT_PORT,
  timeoutMs: number = 15000
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(
          {
            hostname: '127.0.0.1',
            port,
            path: '/login',
            timeout: 1000,
          },
          (res) => {
            res.resume();
            if (res.statusCode && res.statusCode < 500) {
              resolve();
              return;
            }
            reject(new Error(`Unexpected status ${res.statusCode ?? 'unknown'}`));
          }
        );

        req.on('timeout', () => req.destroy(new Error('Timed out waiting for server')));
        req.on('error', reject);
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`Next.js server did not become ready on port ${port} within ${timeoutMs}ms`);
}
