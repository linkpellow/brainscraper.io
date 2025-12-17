/**
 * Facebook Discovery Record Persistence
 * 
 * Saves Facebook discovery records individually to ensure data persistence
 * even if the process is interrupted. Tracks processed records to avoid duplicates.
 * 
 * NOTE: This module uses Node.js fs module and can only run on the server.
 */

import type { FacebookDiscoveryRecord } from '@/app/api/facebook-discovery/route';

// Check if we're running in Node.js (server-side)
const isServer = typeof window === 'undefined' && typeof process !== 'undefined' && process.versions?.node;

// Lazy load Node.js modules only on server
let fs: typeof import('fs') | null = null;
let path: typeof import('path') | null = null;
let dataDirectoryUtils: typeof import('./dataDirectory') | null = null;

function ensureServerModules() {
  if (!isServer) {
    return false;
  }
  if (!fs || !path || !dataDirectoryUtils) {
    try {
      fs = require('fs');
      path = require('path');
      dataDirectoryUtils = require('./dataDirectory');
    } catch (error) {
      console.error('Failed to load server modules:', error);
      return false;
    }
  }
  return true;
}

/**
 * Get a unique key for a Facebook discovery record
 */
function getRecordKey(record: FacebookDiscoveryRecord): string {
  // Use post_id + comment_id as primary key, fallback to user_id + message hash
  if (record.fb_post_id && record.fb_comment_id) {
    return `fb:${record.group_id}:post:${record.fb_post_id}:comment:${record.fb_comment_id}`;
  }
  if (record.fb_post_id) {
    return `fb:${record.group_id}:post:${record.fb_post_id}`;
  }
  
  // Fallback: use user_id + message hash
  const messageHash = record.raw_message ? 
    Buffer.from(record.raw_message).toString('base64').substring(0, 16) : 
    'unknown';
  return `fb:${record.group_id}:user:${record.fb_user_id || 'anonymous'}:msg:${messageHash}`;
}

/**
 * Load already processed record keys from checkpoint file
 */
export function loadProcessedRecords(groupId: string): Set<string> {
  if (!ensureServerModules()) {
    return new Set();
  }
  
  const checkpointPath = path!.join(
    dataDirectoryUtils!.getDataDirectory(), 
    'facebook-discovery',
    `checkpoint-${groupId}.json`
  );
  
  const content = dataDirectoryUtils!.safeReadFile(checkpointPath);
  
  if (!content) {
    return new Set();
  }
  
  try {
    const data = JSON.parse(content);
    return new Set(data.processedKeys || []);
  } catch {
    return new Set();
  }
}

/**
 * Save a processed record key to checkpoint
 */
export function saveProcessedRecordKey(groupId: string, key: string): void {
  if (!ensureServerModules()) {
    return;
  }
  
  const discoveryDir = path!.join(dataDirectoryUtils!.getDataDirectory(), 'facebook-discovery');
  if (!fs!.existsSync(discoveryDir)) {
    fs!.mkdirSync(discoveryDir, { recursive: true });
  }
  
  const checkpointPath = path!.join(discoveryDir, `checkpoint-${groupId}.json`);
  const processed = loadProcessedRecords(groupId);
  processed.add(key);
  
  const data = {
    lastUpdated: new Date().toISOString(),
    groupId,
    processedKeys: Array.from(processed),
  };
  
  try {
    fs!.writeFileSync(checkpointPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('[SAVE_FB_DISCOVERY] Failed to save checkpoint:', error);
  }
}

/**
 * Save a single Facebook discovery record to disk
 * Idempotent: skips if record already exists
 */
export function saveFacebookDiscoveryRecord(record: FacebookDiscoveryRecord): boolean {
  if (!ensureServerModules()) {
    return false;
  }
  
  const recordKey = getRecordKey(record);
  const processed = loadProcessedRecords(record.group_id);
  
  // Skip if already processed
  if (processed.has(recordKey)) {
    return false;
  }
  
  const discoveryDir = path!.join(dataDirectoryUtils!.getDataDirectory(), 'facebook-discovery');
  if (!fs!.existsSync(discoveryDir)) {
    fs!.mkdirSync(discoveryDir, { recursive: true });
  }
  
  // Save individual record file
  const recordFile = path!.join(discoveryDir, `${recordKey}.json`);
  
  try {
    const recordData = {
      ...record,
      savedAt: new Date().toISOString(),
      recordKey,
    };
    
    fs!.writeFileSync(recordFile, JSON.stringify(recordData, null, 2), 'utf8');
    
    // Mark as processed
    saveProcessedRecordKey(record.group_id, recordKey);
    
    return true;
  } catch (error) {
    console.error('[SAVE_FB_DISCOVERY] Failed to save record:', error);
    return false;
  }
}

/**
 * Load all Facebook discovery records for a group
 */
export function loadFacebookDiscoveryRecords(groupId: string): FacebookDiscoveryRecord[] {
  if (!ensureServerModules()) {
    return [];
  }
  
  const discoveryDir = path!.join(dataDirectoryUtils!.getDataDirectory(), 'facebook-discovery');
  if (!fs!.existsSync(discoveryDir)) {
    return [];
  }
  
  const records: FacebookDiscoveryRecord[] = [];
  const files = fs!.readdirSync(discoveryDir);
  
  for (const file of files) {
    if (file.startsWith(`fb:${groupId}:`) && file.endsWith('.json') && !file.includes('checkpoint')) {
      try {
        const filePath = path!.join(discoveryDir, file);
        const content = fs!.readFileSync(filePath, 'utf8');
        const record = JSON.parse(content);
        // Remove metadata fields
        delete record.savedAt;
        delete record.recordKey;
        records.push(record);
      } catch (error) {
        console.error(`[LOAD_FB_DISCOVERY] Failed to load record ${file}:`, error);
      }
    }
  }
  
  return records;
}

/**
 * Check if a record has already been processed
 */
export function isRecordProcessed(record: FacebookDiscoveryRecord): boolean {
  if (!ensureServerModules()) {
    return false;
  }
  
  const recordKey = getRecordKey(record);
  const processed = loadProcessedRecords(record.group_id);
  return processed.has(recordKey);
}
