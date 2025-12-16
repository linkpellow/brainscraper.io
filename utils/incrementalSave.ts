/**
 * Incremental Save Utility
 * 
 * Provides continuous saving during enrichment to ensure data persistence
 * even if the process is interrupted. Tracks processed leads to avoid duplicates.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDataDirectory, ensureDataDirectory, safeWriteFile, safeReadFile } from './dataDirectory';
import type { EnrichedRow } from './enrichData';
import type { LeadSummary } from './extractLeadSummary';

/**
 * Get a unique key for a lead to track duplicates
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
 */
export function loadProcessedLeads(): Set<string> {
  const checkpointPath = path.join(getDataDirectory(), 'enrichment-checkpoint.json');
  const content = safeReadFile(checkpointPath);
  
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
 */
export function saveProcessedLeadKey(key: string): void {
  const checkpointPath = path.join(getDataDirectory(), 'enrichment-checkpoint.json');
  const processed = loadProcessedLeads();
  processed.add(key);
  
  const data = {
    lastUpdated: new Date().toISOString(),
    processedKeys: Array.from(processed),
    totalProcessed: processed.size,
  };
  
  safeWriteFile(checkpointPath, JSON.stringify(data, null, 2));
}

/**
 * Save enriched lead immediately to disk
 */
export function saveEnrichedLeadImmediate(
  enrichedRow: EnrichedRow,
  leadSummary: LeadSummary
): void {
  try {
    ensureDataDirectory();
    const dataDir = getDataDirectory();
    const enrichedDir = path.join(dataDir, 'enriched-leads');
    
    if (!fs.existsSync(enrichedDir)) {
      fs.mkdirSync(enrichedDir, { recursive: true });
    }
    
    // Save individual lead file
    const leadKey = getLeadKey(enrichedRow);
    const sanitizedKey = leadKey.replace(/[^a-zA-Z0-9:]/g, '_').substring(0, 100);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `${timestamp}-${sanitizedKey}.json`;
    const filepath = path.join(enrichedDir, filename);
    
    const leadData = {
      metadata: {
        savedAt: new Date().toISOString(),
        leadKey,
      },
      enrichedRow,
      leadSummary,
    };
    
    safeWriteFile(filepath, JSON.stringify(leadData, null, 2));
    
    // Also append to daily summary file
    const dateStr = new Date().toISOString().split('T')[0];
    const summaryFile = path.join(enrichedDir, `summary-${dateStr}.json`);
    
    let dailySummary: any[] = [];
    if (fs.existsSync(summaryFile)) {
      try {
        const existing = safeReadFile(summaryFile);
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
    
    safeWriteFile(summaryFile, JSON.stringify(dailySummary, null, 2));
    
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
 */
export function loadAllEnrichedLeads(): LeadSummary[] {
  try {
    const dataDir = getDataDirectory();
    const enrichedDir = path.join(dataDir, 'enriched-leads');
    
    if (!fs.existsSync(enrichedDir)) {
      return [];
    }
    
    const allLeads: LeadSummary[] = [];
    const files = fs.readdirSync(enrichedDir)
      .filter(file => file.endsWith('.json') && file.startsWith('20'))
      .sort()
      .reverse(); // Most recent first
    
    const seenKeys = new Set<string>();
    
    for (const file of files) {
      try {
        const filepath = path.join(enrichedDir, file);
        const content = safeReadFile(filepath);
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
 */
export function isLeadProcessed(lead: any): boolean {
  const processed = loadProcessedLeads();
  const key = getLeadKey(lead);
  return processed.has(key);
}

/**
 * Clear checkpoint (use with caution)
 */
export function clearCheckpoint(): void {
  const checkpointPath = path.join(getDataDirectory(), 'enrichment-checkpoint.json');
  if (fs.existsSync(checkpointPath)) {
    fs.unlinkSync(checkpointPath);
  }
}
