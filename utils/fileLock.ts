/**
 * Simple file locking utility for concurrent write protection
 * Uses lock files to prevent simultaneous writes to the same file
 */

import { getDataDirectory } from './dataDirectory';

// Check if we're running in Node.js (server-side)
const isServer = typeof window === 'undefined' && typeof process !== 'undefined' && process.versions?.node;

// Lazy load Node.js modules only on server
let fs: typeof import('fs') | null = null;
let path: typeof import('path') | null = null;

function ensureServerModules() {
  if (!isServer) {
    return false;
  }
  if (!fs || !path) {
    try {
      fs = require('fs');
      path = require('path');
    } catch (error) {
      console.error('Failed to load server modules:', error);
      return false;
    }
  }
  return true;
}

const LOCK_TIMEOUT = 30000; // 30 seconds max lock time
const LOCK_CHECK_INTERVAL = 100; // Check every 100ms

interface LockInfo {
  pid: number;
  timestamp: number;
}

/**
 * Acquires a lock for a file
 * Returns lock file path if successful, null if lock already exists
 */
export function acquireLock(filePath: string): string | null {
  if (!ensureServerModules()) {
    console.warn('acquireLock called on client-side, returning null');
    return null;
  }

  const lockFilePath = `${filePath}.lock`;
  
  // Check if lock exists and is stale
  if (fs!.existsSync(lockFilePath)) {
    try {
      const lockContent = fs!.readFileSync(lockFilePath, 'utf-8');
      const lockInfo: LockInfo = JSON.parse(lockContent);
      const lockAge = Date.now() - lockInfo.timestamp;
      
      // If lock is stale (older than timeout), remove it
      if (lockAge > LOCK_TIMEOUT) {
        console.warn(`⚠️ Removing stale lock for ${filePath} (age: ${lockAge}ms)`);
        fs!.unlinkSync(lockFilePath);
      } else {
        // Lock is still valid
        return null;
      }
    } catch (error) {
      // Lock file is corrupted, remove it
      console.warn(`⚠️ Removing corrupted lock file: ${lockFilePath}`);
      try {
        fs!.unlinkSync(lockFilePath);
      } catch {
        // Ignore errors removing corrupted lock
      }
    }
  }
  
  // Create new lock
  try {
    const lockInfo: LockInfo = {
      pid: process.pid,
      timestamp: Date.now(),
    };
    fs!.writeFileSync(lockFilePath, JSON.stringify(lockInfo, null, 2));
    return lockFilePath;
  } catch (error) {
    console.error(`Failed to acquire lock for ${filePath}:`, error);
    return null;
  }
}

/**
 * Waits for a lock to be released (with timeout)
 */
export async function waitForLock(filePath: string, timeout: number = LOCK_TIMEOUT): Promise<boolean> {
  if (!ensureServerModules()) {
    console.warn('waitForLock called on client-side, returning false');
    return false;
  }

  const lockFilePath = `${filePath}.lock`;
  const startTime = Date.now();
  
  while (fs!.existsSync(lockFilePath)) {
    if (Date.now() - startTime > timeout) {
      console.warn(`⚠️ Lock timeout for ${filePath}`);
      return false;
    }
    
    // Check if lock is stale
    try {
      const lockContent = fs!.readFileSync(lockFilePath, 'utf-8');
      const lockInfo: LockInfo = JSON.parse(lockContent);
      const lockAge = Date.now() - lockInfo.timestamp;
      
      if (lockAge > LOCK_TIMEOUT) {
        console.warn(`⚠️ Removing stale lock during wait: ${filePath}`);
        fs!.unlinkSync(lockFilePath);
        return true;
      }
    } catch {
      // Lock file corrupted, remove it
      try {
        fs!.unlinkSync(lockFilePath);
        return true;
      } catch {
        // Ignore
      }
    }
    
    // Wait before checking again
    await new Promise(resolve => setTimeout(resolve, LOCK_CHECK_INTERVAL));
  }
  
  return true;
}

/**
 * Releases a lock for a file
 */
export function releaseLock(lockFilePath: string): void {
  if (!ensureServerModules()) {
    return; // No-op on client
  }

  try {
    if (fs!.existsSync(lockFilePath)) {
      fs!.unlinkSync(lockFilePath);
    }
  } catch (error) {
    console.error(`Failed to release lock ${lockFilePath}:`, error);
  }
}

/**
 * Executes a function with file locking
 */
export async function withLock<T>(
  filePath: string,
  fn: () => Promise<T> | T,
  timeout: number = LOCK_TIMEOUT
): Promise<T> {
  // Wait for lock if it exists
  const lockAvailable = await waitForLock(filePath, timeout);
  if (!lockAvailable) {
    throw new Error(`Could not acquire lock for ${filePath} within timeout`);
  }
  
  // Acquire lock
  const lockFilePath = acquireLock(filePath);
  if (!lockFilePath) {
    throw new Error(`Could not acquire lock for ${filePath}`);
  }
  
  try {
    // Execute function
    return await fn();
  } finally {
    // Always release lock
    releaseLock(lockFilePath);
  }
}
