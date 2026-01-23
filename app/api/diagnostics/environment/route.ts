/**
 * Environment Snapshot API
 * 
 * Returns environment information for diagnostic reports
 */

import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export async function GET() {
  try {
    const environment: {
      gitCommit?: string;
      nodeVersion: string;
      os: { platform: string; arch: string };
      ports?: { nextDev?: number; wsBridge?: number };
      featureFlags?: Record<string, boolean>;
    } = {
      nodeVersion: process.version,
      os: {
        platform: process.platform,
        arch: process.arch,
      },
    };
    
    // Get git commit
    try {
      const gitHeadPath = join(process.cwd(), '.git', 'HEAD');
      if (existsSync(gitHeadPath)) {
        const head = readFileSync(gitHeadPath, 'utf-8').trim();
        if (head.startsWith('ref: ')) {
          const refPath = join(process.cwd(), '.git', head.substring(5));
          if (existsSync(refPath)) {
            environment.gitCommit = readFileSync(refPath, 'utf-8').trim().substring(0, 7);
          }
        } else {
          environment.gitCommit = head.substring(0, 7);
        }
      }
    } catch {
      // Ignore git errors
    }
    
    // Get ports from environment (if set)
    const nextDevPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    environment.ports = {
      nextDev: nextDevPort,
      wsBridge: process.env.WS_BRIDGE_PORT ? parseInt(process.env.WS_BRIDGE_PORT, 10) : undefined,
    };
    
    // Feature flags (from env vars)
    environment.featureFlags = {
      // Add feature flags here as needed
    };
    
    return NextResponse.json(environment);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
