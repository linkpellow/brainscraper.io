/**
 * Persistent Location ID Cache
 * 
 * Stores discovered location IDs to disk for persistence across restarts.
 * In production, this could be replaced with a database or Redis.
 */

import { importCache, exportCache } from './linkedinLocationDiscovery';

// Only use fs on server-side
let fs: typeof import('fs') | null = null;
let path: typeof import('path') | null = null;

if (typeof window === 'undefined') {
  try {
    fs = require('fs');
    path = require('path');
  } catch {
    // fs not available
  }
}

const getCacheFile = (): string | null => {
  if (!path || !fs) return null;
  try {
    return path.join(process.cwd(), '.cache', 'linkedin-location-ids.json');
  } catch {
    return null;
  }
};

/**
 * Load cache from disk
 */
export function loadCache(): void {
  if (!fs || !path) return; // Client-side or fs not available
  
  try {
    const cacheFile = getCacheFile();
    if (!cacheFile) return;

    // Ensure cache directory exists
    const cacheDir = path.dirname(cacheFile);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // Load cache file if it exists
    if (fs.existsSync(cacheFile)) {
      const data = fs.readFileSync(cacheFile, 'utf-8');
      const cacheData = JSON.parse(data);
      if (Array.isArray(cacheData)) {
        importCache(cacheData);
        console.log(`✅ Loaded ${cacheData.length} location IDs from cache`);
      }
    }
  } catch (error) {
    console.error('Error loading location cache:', error);
    // Continue without cache - not critical
  }
}

/**
 * Save cache to disk
 */
export function saveCache(): void {
  if (!fs || !path) return; // Client-side or fs not available
  
  try {
    const cacheFile = getCacheFile();
    if (!cacheFile) return;

    // Ensure cache directory exists
    const cacheDir = path.dirname(cacheFile);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // Export and save cache
    const cacheData = exportCache();
    if (cacheData.length > 0) {
      fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), 'utf-8');
      console.log(`💾 Saved ${cacheData.length} location IDs to cache`);
    }
  } catch (error) {
    console.error('Error saving location cache:', error);
    // Continue without saving - not critical
  }
}

/**
 * Initialize cache on module load (server-side only)
 */
if (typeof window === 'undefined' && typeof process !== 'undefined') {
  // Server-side only
  loadCache();
  
  // Save cache periodically and on process exit
  if (typeof setInterval !== 'undefined') {
    setInterval(() => {
      saveCache();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  if (process.on) {
    process.on('beforeExit', () => {
      saveCache();
    });
    
    process.on('SIGINT', () => {
      saveCache();
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      saveCache();
      process.exit(0);
    });
  }
}

