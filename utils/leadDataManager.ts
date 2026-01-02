/**
 * Lead Data Manager Class
 * 
 * SINGLE ENTRY POINT for all lead data operations
 * Ensures data integrity, idempotency, and verification
 * 
 * CRITICAL: All lead data writes MUST go through this class
 * 
 * Features:
 * - Zod schema validation
 * - Idempotency (safe to retry)
 * - Checksum verification (SHA-256)
 * - Post-write verification (3 attempts)
 * - Atomic writes with backups
 * - File locking (prevents concurrent writes)
 */

import { getDataFilePath, safeReadFile, safeWriteFile, ensureDataDirectory } from './dataDirectory';
import { withLock } from './fileLock';
import type { LeadSummary } from './extractLeadSummary';
import { extractLeadSummary } from './extractLeadSummary';
import type { EnrichedRow } from './enrichData';
import { safeValidateLeadSummary, safeValidateLeadSummaryArray } from './leadSchemas';
import crypto from 'crypto';

const IDEMPOTENCY_DIR = 'idempotency';

interface IdempotencyRecord {
  key: string;
  result: any;
  timestamp: number;
  checksum: string;
}

export interface AggregationResult {
  success: boolean;
  totalLeads: number;
  newLeadsAdded: number;
  verified: boolean;
  checksum: string;
  error?: string;
}

export interface RecoveryResult {
  recovered: number;
  errors: number;
  details: string[];
}

/**
 * Lead Data Manager Class
 * 
 * Single entry point for all lead data operations
 */
export class LeadDataManager {
  private static instance: LeadDataManager | null = null;

  /**
   * Get singleton instance
   */
  static getInstance(): LeadDataManager {
    if (!LeadDataManager.instance) {
      LeadDataManager.instance = new LeadDataManager();
    }
    return LeadDataManager.instance;
  }

  /**
   * Generate idempotency key for an operation
   */
  private generateIdempotencyKey(jobId: string, operation: string, dataHash: string): string {
    return `${jobId}-${operation}-${dataHash}`;
  }

  /**
   * Check if operation was already executed (idempotency check)
   */
  private checkIdempotency(key: string): IdempotencyRecord | null {
    try {
      ensureDataDirectory();
      const { getDataDirectory } = require('./dataDirectory');
      const dataDir = getDataDirectory();
      const fs = require('fs');
      const path = require('path');
      
      const idempotencyDir = path.join(dataDir, IDEMPOTENCY_DIR);
      if (!fs.existsSync(idempotencyDir)) {
        fs.mkdirSync(idempotencyDir, { recursive: true });
      }
      
      const keyFile = path.join(idempotencyDir, `${key}.json`);
      if (!fs.existsSync(keyFile)) {
        return null;
      }
      
      const content = safeReadFile(keyFile);
      if (!content) {
        return null;
      }
      
      return JSON.parse(content) as IdempotencyRecord;
    } catch (error) {
      console.error('[DATA_MANAGER] Failed to check idempotency:', error);
      return null;
    }
  }

  /**
   * Save idempotency record
   */
  private saveIdempotencyRecord(key: string, result: any, checksum: string): void {
    try {
      ensureDataDirectory();
      const { getDataDirectory } = require('./dataDirectory');
      const dataDir = getDataDirectory();
      const fs = require('fs');
      const path = require('path');
      
      const idempotencyDir = path.join(dataDir, IDEMPOTENCY_DIR);
      if (!fs.existsSync(idempotencyDir)) {
        fs.mkdirSync(idempotencyDir, { recursive: true });
      }
      
      const record: IdempotencyRecord = {
        key,
        result,
        timestamp: Date.now(),
        checksum,
      };
      
      const keyFile = path.join(idempotencyDir, `${key}.json`);
      safeWriteFile(keyFile, JSON.stringify(record, null, 2));
    } catch (error) {
      console.error('[DATA_MANAGER] Failed to save idempotency record:', error);
    }
  }

  /**
   * Compute SHA-256 checksum of data
   */
  private computeChecksum(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Validate lead summary using Zod schema
   */
  private validateLeadSummary(lead: unknown): lead is LeadSummary {
    const result = safeValidateLeadSummary(lead);
    return result.success;
  }

  /**
   * Aggregate enriched leads to enriched-all-leads.json
   * REQUIRED operation - cannot be skipped
   * Idempotent - safe to retry
   * Verified - checks data integrity after write
   * 
   * Uses Zod schema validation for all leads
   */
  async aggregateLeadsWithVerification(
    enrichedRows: EnrichedRow[],
    jobId: string
  ): Promise<AggregationResult> {
    try {
      // Extract lead summaries from enriched rows
      const summaries: LeadSummary[] = enrichedRows
        .map((row) => extractLeadSummary(row, row._enriched))
        .filter((lead) => this.validateLeadSummary(lead)); // Zod schema validation
      
      if (summaries.length === 0) {
        const totalInput = enrichedRows.length;
        console.error(`[DATA_MANAGER] ❌ CRITICAL: All ${totalInput} leads failed validation and were filtered out!`);
        console.error(`[DATA_MANAGER] This usually means leads are missing required fields: name (non-empty) AND phone (10+ digits)`);
        console.error(`[DATA_MANAGER] Sample of filtered leads:`, enrichedRows.slice(0, 3).map(row => ({
          name: row['Name'] || row.name || 'MISSING',
          phone: row['Phone'] || row.phone || 'MISSING',
          email: row['Email'] || row.email || 'MISSING',
        })));
        // Return error instead of success to make the issue visible
        return {
          success: false,
          totalLeads: 0,
          newLeadsAdded: 0,
          verified: false,
          checksum: '',
          error: `All ${totalInput} leads failed validation. Leads must have both name and phone (10+ digits). Check enrichment pipeline.`,
        };
      }
      
      // Validate all summaries with Zod (strict validation)
      const validationResult = safeValidateLeadSummaryArray(summaries);
      if (!validationResult.success) {
        console.error('[DATA_MANAGER] Zod validation failed for some leads:', validationResult.errors?.length || 0);
        // Filter out invalid leads
        const validSummaries = summaries.filter((lead) => this.validateLeadSummary(lead));
        if (validSummaries.length === 0) {
          return {
            success: false,
            totalLeads: 0,
            newLeadsAdded: 0,
            verified: false,
            checksum: '',
            error: 'All leads failed Zod schema validation',
          };
        }
        // Use only valid leads
        summaries.splice(0, summaries.length, ...validSummaries);
      }
      
      // Generate idempotency key
      const dataHash = this.computeChecksum(JSON.stringify(summaries.map(s => ({
        name: s.name,
        phone: s.phone,
        email: s.email,
        linkedinUrl: s.linkedinUrl,
      }))));
      const idempotencyKey = this.generateIdempotencyKey(jobId, 'aggregate', dataHash);
      
      // Check idempotency
      const existing = this.checkIdempotency(idempotencyKey);
      if (existing) {
        console.log(`[DATA_MANAGER] Operation already executed (idempotency): ${idempotencyKey}`);
        return {
          success: true,
          totalLeads: existing.result.totalLeads,
          newLeadsAdded: existing.result.newLeadsAdded,
          verified: true,
          checksum: existing.checksum,
        };
      }
      
      // Perform aggregation with file locking
      const existingPath = getDataFilePath('enriched-all-leads.json');
      let aggregatedLeads: LeadSummary[] = [];
      let newLeadsAdded = 0;
      
      await withLock(existingPath, async () => {
        // Load existing leads
        const existingContent = safeReadFile(existingPath);
        if (existingContent) {
          try {
            const existingData = JSON.parse(existingContent);
            const rawLeads = Array.isArray(existingData) ? existingData : (existingData.leads || []);
            
            // Validate existing leads with Zod schema
            aggregatedLeads = rawLeads.filter((lead: unknown) => this.validateLeadSummary(lead));
            
            if (aggregatedLeads.length !== rawLeads.length) {
              console.warn(`[DATA_MANAGER] Filtered ${rawLeads.length - aggregatedLeads.length} invalid leads from existing data`);
            }
          } catch (error) {
            console.error('[DATA_MANAGER] Error parsing existing leads, starting fresh:', error);
            aggregatedLeads = [];
          }
        }
        
        // Create deduplication map
        const getLeadKey = (lead: LeadSummary): string => {
          if (lead.linkedinUrl) {
            return `linkedin:${lead.linkedinUrl}`;
          }
          const name = (lead.name || '').trim();
          const email = (lead.email || '').trim();
          const phone = (lead.phone || '').trim();
          return `name:${name}:${email || phone}`;
        };
        
        const seenKeys = new Set<string>(aggregatedLeads.map(getLeadKey));
        
        // Add new leads (deduplicate) - all validated with Zod
        for (const lead of summaries) {
          // Final Zod validation before adding
          if (!this.validateLeadSummary(lead)) {
            console.warn(`[DATA_MANAGER] Skipping invalid lead (Zod validation failed): ${lead.name || 'Unknown'}`);
            continue;
          }
          
          const key = getLeadKey(lead);
          if (!seenKeys.has(key)) {
            aggregatedLeads.push(lead);
            seenKeys.add(key);
            newLeadsAdded++;
          } else {
            // Merge with existing (preserve DNC status)
            const existingIndex = aggregatedLeads.findIndex(l => getLeadKey(l) === key);
            if (existingIndex >= 0) {
              aggregatedLeads[existingIndex] = {
                ...aggregatedLeads[existingIndex],
                ...lead,
                // Preserve DNC status if existing has it
                dncStatus: aggregatedLeads[existingIndex].dncStatus || lead.dncStatus,
                dncLastChecked: aggregatedLeads[existingIndex].dncLastChecked || lead.dncLastChecked,
              };
            }
          }
        }
        
        // Compute checksum before write
        const dataToWrite = JSON.stringify(aggregatedLeads, null, 2);
        const checksum = this.computeChecksum(dataToWrite);
        
        // Atomic write with backup
        const backupPath = getDataFilePath(`enriched-all-leads-BACKUP-${Date.now()}.json`);
        if (existingContent) {
          safeWriteFile(backupPath, existingContent);
        }
        
        // Write new data
        safeWriteFile(existingPath, dataToWrite);
        
        // VERIFICATION: Read back and verify checksum
        const verificationAttempts = 3;
        let verified = false;
        
        for (let i = 0; i < verificationAttempts; i++) {
          await new Promise(resolve => setTimeout(resolve, 100 * (i + 1))); // Exponential backoff
          
          const readBack = safeReadFile(existingPath);
          if (readBack) {
            const readChecksum = this.computeChecksum(readBack);
            if (readChecksum === checksum) {
              verified = true;
              break;
            }
          }
        }
        
        if (!verified) {
          // Restore from backup
          if (existingContent) {
            safeWriteFile(existingPath, existingContent);
          }
          throw new Error('Verification failed: checksum mismatch after write');
        }
        
        // Save idempotency record
        const result = {
          totalLeads: aggregatedLeads.length,
          newLeadsAdded,
        };
        this.saveIdempotencyRecord(idempotencyKey, result, checksum);
        
        console.log(`[DATA_MANAGER] ✅ Aggregated ${newLeadsAdded} new leads (total: ${aggregatedLeads.length}) - Verified: ${verified}`);
        
        return {
          success: true,
          totalLeads: aggregatedLeads.length,
          newLeadsAdded,
          verified: true,
          checksum,
        };
      });
      
      return {
        success: true,
        totalLeads: aggregatedLeads.length,
        newLeadsAdded,
        verified: true,
        checksum: '',
      };
    } catch (error) {
      console.error('[DATA_MANAGER] ❌ Aggregation failed:', error);
      return {
        success: false,
        totalLeads: 0,
        newLeadsAdded: 0,
        verified: false,
        checksum: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Recover orphaned leads from enriched-leads/ directory
   * Scans for leads that were saved incrementally but not aggregated
   */
  async recoverOrphanedLeads(): Promise<RecoveryResult> {
    try {
      ensureDataDirectory();
      const { getDataDirectory } = require('./dataDirectory');
      const dataDir = getDataDirectory();
      const fs = require('fs');
      const path = require('path');
      
      const enrichedLeadsDir = path.join(dataDir, 'enriched-leads');
      if (!fs.existsSync(enrichedLeadsDir)) {
        return { recovered: 0, errors: 0, details: [] };
      }
      
      // Load current aggregated leads to check what's missing
      const existingPath = getDataFilePath('enriched-all-leads.json');
      const existingContent = safeReadFile(existingPath);
      const existingLeads: LeadSummary[] = existingContent
        ? (Array.isArray(JSON.parse(existingContent)) ? JSON.parse(existingContent) : JSON.parse(existingContent).leads || [])
        : [];
      
      // Validate existing leads with Zod
      const validExistingLeads = existingLeads.filter((lead) => this.validateLeadSummary(lead));
      
      const existingKeys = new Set(
        validExistingLeads.map(l => l.linkedinUrl || `${l.name}-${l.phone}-${l.email}`)
      );
      
      // Scan enriched-leads directory
      const files = fs.readdirSync(enrichedLeadsDir).filter((f: string) => f.endsWith('.json') && !f.startsWith('summary-'));
      
      const orphanedRows: EnrichedRow[] = [];
      const details: string[] = [];
      let errors = 0;
      
      for (const file of files) {
        try {
          const filePath = path.join(enrichedLeadsDir, file);
          const content = safeReadFile(filePath);
          if (content) {
            const data = JSON.parse(content);
            const row = data.enrichedRow || data;
            const summary = data.leadSummary || extractLeadSummary(row, row._enriched);
            
            // Validate with Zod before considering for recovery
            if (!this.validateLeadSummary(summary)) {
              details.push(`Skipped invalid lead: ${summary.name || 'Unknown'} (failed Zod validation)`);
              continue;
            }
            
            const key = summary.linkedinUrl || `${summary.name}-${summary.phone}-${summary.email}`;
            if (!existingKeys.has(key)) {
              orphanedRows.push(row);
              details.push(`Recovered: ${summary.name} (${summary.phone})`);
            }
          }
        } catch (error) {
          errors++;
          details.push(`Error reading ${file}: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      }
      
      if (orphanedRows.length > 0) {
        // Aggregate orphaned leads using same manager
        const recoveryJobId = `recovery-${Date.now()}`;
        const result = await this.aggregateLeadsWithVerification(orphanedRows, recoveryJobId);
        
        if (result.success && result.verified) {
          details.push(`✅ Successfully recovered ${result.newLeadsAdded} orphaned leads`);
          return {
            recovered: result.newLeadsAdded,
            errors,
            details,
          };
        } else {
          details.push(`❌ Failed to aggregate recovered leads: ${result.error}`);
          return {
            recovered: 0,
            errors: errors + 1,
            details,
          };
        }
      }
      
      return { recovered: 0, errors, details };
    } catch (error) {
      console.error('[DATA_MANAGER] ❌ Orphan recovery failed:', error);
      return {
        recovered: 0,
        errors: 1,
        details: [`Recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }
}

// Export singleton instance methods for backward compatibility
const dataManager = LeadDataManager.getInstance();

/**
 * Aggregate enriched leads to enriched-all-leads.json
 * REQUIRED operation - cannot be skipped
 * Uses LeadDataManager class internally
 */
export async function aggregateLeadsWithVerification(
  enrichedRows: EnrichedRow[],
  jobId: string
): Promise<AggregationResult> {
  return dataManager.aggregateLeadsWithVerification(enrichedRows, jobId);
}

/**
 * Recover orphaned leads from enriched-leads/ directory
 * Uses LeadDataManager class internally
 */
export async function recoverOrphanedLeads(): Promise<RecoveryResult> {
  return dataManager.recoverOrphanedLeads();
}
