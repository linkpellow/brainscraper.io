/**
 * Load .env file into process.env for Electron main process.
 * Search order: ELECTRON_ENV_FILE, next to executable (packaged), cwd (dev), userData.
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

export function getEnvFilePath(userDataPath: string, execPath: string, cwd: string): string | null {
  if (process.env.ELECTRON_ENV_FILE) {
    const p = process.env.ELECTRON_ENV_FILE;
    return fs.existsSync(p) ? p : null;
  }
  const nextToExe = path.join(path.dirname(execPath), '.env.local');
  if (fs.existsSync(nextToExe)) return nextToExe;
  const inCwd = path.join(cwd, '.env.local');
  if (fs.existsSync(inCwd)) return inCwd;
  const inUserData = path.join(userDataPath, '.env.local');
  if (fs.existsSync(inUserData)) return inUserData;
  return null;
}

/**
 * Load env file into process.env. Does not override existing env vars.
 */
export function loadEnvIntoProcess(envFilePath: string): void {
  dotenv.config({ path: envFilePath, override: false });
}
