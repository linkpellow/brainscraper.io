/**
 * Environment Snapshot Capture
 * 
 * Captures environment context at run start:
 * - Git commit hash
 * - Node version
 * - OS / arch
 * - Active ports
 * - Feature flags
 */

export type EnvironmentSnapshot = {
  gitCommit?: string;
  nodeVersion: string;
  os: {
    platform: string;
    arch: string;
    version?: string;
  };
  ports?: {
    nextDev?: number;
    wsBridge?: number;
  };
  featureFlags?: Record<string, boolean>;
  buildTime?: string;
};

let cachedSnapshot: EnvironmentSnapshot | null = null;

/**
 * Capture environment snapshot
 */
export async function captureEnvironmentSnapshot(): Promise<EnvironmentSnapshot> {
  if (cachedSnapshot) return cachedSnapshot;
  
  const snapshot: EnvironmentSnapshot = {
    nodeVersion: typeof process !== 'undefined' ? process.version : 'unknown',
    os: {
      platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
      arch: typeof navigator !== 'undefined' ? (navigator as any).hardwareConcurrency ? 'arm64' : 'x64' : 'unknown',
    },
    buildTime: new Date().toISOString(),
  };
  
  // Try to get git commit (client-side, would need API call)
  if (typeof window !== 'undefined') {
    try {
      const response = await fetch('/api/diagnostics/environment');
      if (response.ok) {
        const env = await response.json();
        snapshot.gitCommit = env.gitCommit;
        snapshot.ports = env.ports;
        snapshot.featureFlags = env.featureFlags;
      }
    } catch {
      // Ignore errors
    }
  }
  
  // Server-side: get from process.env or filesystem
  if (typeof process !== 'undefined') {
    snapshot.os.platform = process.platform;
    snapshot.os.arch = process.arch;
    snapshot.os.version = process.platform === 'darwin' ? require('os').release() : undefined;
    
    // Try to read git commit from .git/HEAD
    try {
      const fs = require('fs');
      const path = require('path');
      const gitHeadPath = path.join(process.cwd(), '.git', 'HEAD');
      if (fs.existsSync(gitHeadPath)) {
        const head = fs.readFileSync(gitHeadPath, 'utf-8').trim();
        if (head.startsWith('ref: ')) {
          const refPath = path.join(process.cwd(), '.git', head.substring(5));
          if (fs.existsSync(refPath)) {
            snapshot.gitCommit = fs.readFileSync(refPath, 'utf-8').trim().substring(0, 7);
          }
        } else {
          snapshot.gitCommit = head.substring(0, 7);
        }
      }
    } catch {
      // Ignore errors
    }
  }
  
  cachedSnapshot = snapshot;
  return snapshot;
}

/**
 * Get cached snapshot (synchronous)
 */
export function getEnvironmentSnapshot(): EnvironmentSnapshot | null {
  return cachedSnapshot;
}
