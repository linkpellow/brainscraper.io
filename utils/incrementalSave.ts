/**
 * Incremental Save Utility
 * 
 * Provides continuous saving during enrichment to ensure data persistence
 * even if the process is interrupted. Tracks processed leads to avoid duplicates.
 * 
 * NOTE: This module uses Node.js fs module and can only run on the server.
 * All functions check if they're running in a Node.js environment before executing.
 */

import type { EnrichedRow } from './enrichData';
import type { LeadSummary } from './extractLeadSummary';

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
 * Get a unique key for a lead to track duplicates
 * Works on both client and server
 */
export function getLeadKey(lead: any): string {
  // Use LinkedIn URL as primary key, fallback to name+email+phone
  const linkedinUrl = lead['LinkedIn URL'] || lead.linkedinUrl || lead.navigationUrl || '';
  if (linkedinUrl) {
    return `linkedin:${linkedinUrl}`;
  }
  
  const name = (lead['Name'] || lead.name || '').trim();
  const email = (lead['Email'] || lead.email || '').trim();
  const phone = (lead['Phone'] || lead.phone || '').trim();
  
  if (name && (email || phone)) {
    return `name:${name}:${email || phone}`;
  }
  
  // Last resort: use name only
  return `name:${name || 'unknown'}`;
}

/**
 * Load already processed lead keys from checkpoint file
 * Only works on server - returns empty set on client
 */
export function loadProcessedLeads(): Set<string> {
  if (!ensureServerModules()) {
    return new Set(); // Return empty set on client
  }
  
  const checkpointPath = path!.join(dataDirectoryUtils!.getDataDirectory(), 'enrichment-checkpoint.json');
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
 * Save a processed lead key to checkpoint
 * Only works on server - no-op on client
 */
export function saveProcessedLeadKey(key: string): void {
  if (!ensureServerModules()) {
    return; // No-op on client
  }
  
  const checkpointPath = path!.join(dataDirectoryUtils!.getDataDirectory(), 'enrichment-checkpoint.json');
  const processed = loadProcessedLeads();
  processed.add(key);
  
  const data = {
    lastUpdated: new Date().toISOString(),
    processedKeys: Array.from(processed),
    totalProcessed: processed.size,
  };
  
  dataDirectoryUtils!.safeWriteFile(checkpointPath, JSON.stringify(data, null, 2));
}

/**
 * Save enriched lead immediately to disk
 * Only works on server - no-op on client (saves via API instead)
 */
export function saveEnrichedLeadImmediate(
  enrichedRow: EnrichedRow,
  leadSummary: LeadSummary
): void {
  if (!ensureServerModules()) {
    // On client, save via API call
    if (typeof fetch !== 'undefined') {
      fetch('/api/save-enriched-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrichedRow, leadSummary }),
      }).catch(error => {
        console.error(`❌ [INCREMENTAL_SAVE] Failed to save lead via API:`, error);
      });
    }
    return;
  }
  
  try {
    dataDirectoryUtils!.ensureDataDirectory();
    const dataDir = dataDirectoryUtils!.getDataDirectory();
    const enrichedDir = path!.join(dataDir, 'enriched-leads');
    
    if (!fs!.existsSync(enrichedDir)) {
      fs!.mkdirSync(enrichedDir, { recursive: true });
    }
    
    // Save individual lead file
    const leadKey = getLeadKey(enrichedRow);
    const sanitizedKey = leadKey.replace(/[^a-zA-Z0-9:]/g, '_').substring(0, 100);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `${timestamp}-${sanitizedKey}.json`;
    const filepath = path!.join(enrichedDir, filename);
    
    const leadData = {
      metadata: {
        savedAt: new Date().toISOString(),
        leadKey,
      },
      enrichedRow,
      leadSummary,
    };
    
    dataDirectoryUtils!.safeWriteFile(filepath, JSON.stringify(leadData, null, 2));
    
    // Also append to daily summary file
    const dateStr = new Date().toISOString().split('T')[0];
    const summaryFile = path!.join(enrichedDir, `summary-${dateStr}.json`);
    
    let dailySummary: any[] = [];
    if (fs!.existsSync(summaryFile)) {
      try {
        const existing = dataDirectoryUtils!.safeReadFile(summaryFile);
        if (existing) {
          dailySummary = JSON.parse(existing);
        }
      } catch {
        dailySummary = [];
      }
    }
    
    // Add to summary (avoid duplicates)
    const existingIndex = dailySummary.findIndex((item: any) => 
      item.metadata?.leadKey === leadKey
    );
    
    if (existingIndex >= 0) {
      dailySummary[existingIndex] = leadData;
    } else {
      dailySummary.push(leadData);
    }
    
    dataDirectoryUtils!.safeWriteFile(summaryFile, JSON.stringify(dailySummary, null, 2));
    
    // Mark as processed
    saveProcessedLeadKey(leadKey);
    
    console.log(`💾 [INCREMENTAL_SAVE] Saved lead: ${leadSummary.name || 'Unknown'}`);
  } catch (error) {
    console.error(`❌ [INCREMENTAL_SAVE] Failed to save lead:`, error);
    // Don't throw - continue processing even if save fails
  }
}

/**
 * Load all enriched leads from disk
 * Only works on server - returns empty array on client
 */
export function loadAllEnrichedLeads(): LeadSummary[] {
  if (!ensureServerModules()) {
    return []; // Return empty array on client
  }
  
  try {
    const dataDir = dataDirectoryUtils!.getDataDirectory();
    const enrichedDir = path!.join(dataDir, 'enriched-leads');
    
    if (!fs!.existsSync(enrichedDir)) {
      return [];
    }
    
    const allLeads: LeadSummary[] = [];
    const files = fs!.readdirSync(enrichedDir)
      .filter(file => file.endsWith('.json') && file.startsWith('20'))
      .sort()
      .reverse(); // Most recent first
    
    const seenKeys = new Set<string>();
    
    for (const file of files) {
      try {
        const filepath = path!.join(enrichedDir, file);
        const content = dataDirectoryUtils!.safeReadFile(filepath);
        if (!content) continue;
        
        const data = JSON.parse(content);
        const leadKey = data.metadata?.leadKey || getLeadKey(data.enrichedRow || data.leadSummary || {});
        
        // Skip duplicates
        if (seenKeys.has(leadKey)) {
          continue;
        }
        seenKeys.add(leadKey);
        
        if (data.leadSummary) {
          allLeads.push(data.leadSummary);
        }
      } catch (error) {
        console.error(`Error loading enriched lead from ${file}:`, error);
      }
    }
    
    return allLeads;
  } catch (error) {
    console.error(`Error loading enriched leads:`, error);
    return [];
  }
}

/**
 * Check if a lead has already been processed
 * Works on both client and server (returns false on client if can't check)
 */
export function isLeadProcessed(lead: any): boolean {
  if (!ensureServerModules()) {
    return false; // On client, can't check, so return false to allow processing
  }
  
  const processed = loadProcessedLeads();
  const key = getLeadKey(lead);
  return processed.has(key);
}

/**
 * Clear checkpoint (use with caution)
 * Only works on server - no-op on client
 */
export function clearCheckpoint(): void {
  if (!ensureServerModules()) {
    return; // No-op on client
  }
  
  const checkpointPath = path!.join(dataDirectoryUtils!.getDataDirectory(), 'enrichment-checkpoint.json');
  if (fs!.existsSync(checkpointPath)) {
    fs!.unlinkSync(checkpointPath);
  }
}


