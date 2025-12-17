/**
 * Data Directory Utility
 * 
 * Centralized data directory path management with Railway persistent volume support
 * Uses DATA_DIR environment variable for Railway deployments, falls back to local data/ directory
 * 
 * NOTE: This module uses Node.js fs module and can only run on the server.
 * Uses lazy loading to avoid bundling fs/path for client-side code.
 */

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

/**
 * Gets the data directory path
 * Priority:
 * 1. DATA_DIR environment variable (for Railway persistent volumes)
 * 2. process.cwd()/data (local development)
 */
export function getDataDirectory(): string {
  if (!ensureServerModules()) {
    // On client, return a placeholder (shouldn't be called on client)
    return './data';
  }
  
  // Railway persistent volumes: Use DATA_DIR env var if set
  if (process.env.DATA_DIR) {
    const dataDir = process.env.DATA_DIR;
    // Ensure directory exists
    if (!fs!.existsSync(dataDir)) {
      try {
        fs!.mkdirSync(dataDir, { recursive: true });
        console.log(`📁 Created data directory: ${dataDir}`);
      } catch (error) {
        console.error(`❌ Failed to create data directory ${dataDir}:`, error);
        // Fall back to local data directory
        return path!.join(process.cwd(), 'data');
      }
    }
    return dataDir;
  }
  
  // Local development: Use project data/ directory
  const localDataDir = path!.join(process.cwd(), 'data');
  if (!fs!.existsSync(localDataDir)) {
    try {
      fs!.mkdirSync(localDataDir, { recursive: true });
    } catch (error) {
      console.error(`❌ Failed to create local data directory:`, error);
    }
  }
  return localDataDir;
}

/**
 * Gets the full path to a file in the data directory
 */
export function getDataFilePath(filename: string): string {
  if (!ensureServerModules()) {
    return `./data/${filename}`;
  }
  return path!.join(getDataDirectory(), filename);
}

/**
 * Ensures the data directory exists
 */
export function ensureDataDirectory(): void {
  if (!ensureServerModules()) {
    return; // No-op on client
  }
  
  const dataDir = getDataDirectory();
  if (!fs!.existsSync(dataDir)) {
    try {
      fs!.mkdirSync(dataDir, { recursive: true });
      console.log(`📁 Created data directory: ${dataDir}`);
    } catch (error) {
      console.error(`❌ Failed to create data directory:`, error);
      throw new Error(`Cannot create data directory: ${dataDir}`);
    }
  }
}

/**
 * Safe file write with error handling and directory creation
 * Uses atomic write pattern (write to temp file, then rename) for data integrity
 */
export function safeWriteFile(filePath: string, data: string, options?: { encoding?: BufferEncoding }): void {
  if (!ensureServerModules()) {
    throw new Error('safeWriteFile can only be called on the server');
  }
  
  // Get directory path outside try block so it's accessible in catch
  const dir = path!.dirname(filePath);
  
  try {
    ensureDataDirectory();
    if (!fs!.existsSync(dir)) {
      fs!.mkdirSync(dir, { recursive: true });
    }
    
    // Atomic write: write to temp file first, then rename
    // This ensures the original file is never corrupted if write fails
    const tempFilePath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(7)}`;
    fs!.writeFileSync(tempFilePath, data, options || { encoding: 'utf-8' });
    
    // Atomic rename (rename is atomic on most filesystems)
    fs!.renameSync(tempFilePath, filePath);
  } catch (error) {
    console.error(`❌ Failed to write file ${filePath}:`, error);
    // Clean up temp file if it exists
    try {
      if (fs!.existsSync(dir)) {
        const tempFiles = fs!.readdirSync(dir).filter(f => f.startsWith(path!.basename(filePath) + '.tmp.'));
        tempFiles.forEach(f => {
          try {
            fs!.unlinkSync(path!.join(dir, f));
          } catch {
            // Ignore cleanup errors
          }
        });
      }
    } catch {
      // Ignore cleanup errors
    }
    throw new Error(`File write failed: ${filePath} - ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Safe file read with error handling
 */
export function safeReadFile(filePath: string, encoding: BufferEncoding = 'utf-8'): string | null {
  if (!ensureServerModules()) {
    return null; // Can't read files on client
  }
  
  try {
    if (!fs!.existsSync(filePath)) {
      return null;
    }
    return fs!.readFileSync(filePath, encoding);
  } catch (error) {
    console.error(`❌ Failed to read file ${filePath}:`, error);
    return null;
  }
}

/**
 * Check if a file exists in the data directory
 */
export function dataFileExists(filename: string): boolean {
  if (!ensureServerModules()) {
    return false; // Can't check files on client
  }
  
  const filePath = getDataFilePath(filename);
  return fs!.existsSync(filePath);
}
