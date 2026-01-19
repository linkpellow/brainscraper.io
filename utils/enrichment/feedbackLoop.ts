/**
 * Feedback Loop System
 * 
 * Enables learning from outcomes without requiring ML
 * Samples skipped leads and allows threshold adjustment based on conversion data
 */

import * as path from 'path';

// Only import fs in server context
let fs: typeof import('fs') | null = null;
if (typeof window === 'undefined') {
  fs = require('fs');
}

export interface FeedbackRecord {
  leadId: string;
  skipped: boolean;
  reason: string;
  reasonCodes: string[];
  confidence: number;
  decisionStage: string;
  timestamp: string;
  // Outcome data (filled in later)
  outcome?: {
    converted: boolean;
    value: number;
    notes?: string;
    reviewedAt: string;
  };
}

export interface ThresholdAdjustment {
  threshold: string; // e.g., "CONFIDENCE_SCORE", "INCOME_MAX", "AGE_MAX"
  oldValue: number;
  newValue: number;
  reason: string;
  adjustedAt: string;
  adjustedBy: string; // "system" | "manual"
}

const FEEDBACK_FILE = path.join(process.cwd(), 'data', 'enrichment-feedback.json');
const THRESHOLDS_FILE = path.join(process.cwd(), 'data', 'enrichment-thresholds.json');

/**
 * Record a decision for feedback analysis
 */
export function recordDecision(
  leadId: string,
  decision: {
    skipped: boolean;
    reason: string;
    reasonCodes: string[];
    confidence: number;
    decisionStage: string;
  }
): void {
  if (!fs) return; // Skip in client context
  try {
    const record: FeedbackRecord = {
      leadId,
      skipped: decision.skipped,
      reason: decision.reason,
      reasonCodes: decision.reasonCodes,
      confidence: decision.confidence,
      decisionStage: decision.decisionStage,
      timestamp: new Date().toISOString(),
    };
    
    // Load existing feedback
    let feedback: FeedbackRecord[] = [];
    if (fs.existsSync(FEEDBACK_FILE)) {
      const data = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf-8'));
      feedback = data.records || [];
    }
    
    // Add new record
    feedback.push(record);
    
    // Keep only last 10,000 records (prevent file bloat)
    if (feedback.length > 10000) {
      feedback = feedback.slice(-10000);
    }
    
    // Save
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify({ records: feedback, lastUpdated: new Date().toISOString() }, null, 2));
  } catch (error) {
    console.warn('[FEEDBACK_LOOP] Failed to record decision:', error);
  }
}

/**
 * Record outcome for a lead (conversion data)
 */
export function recordOutcome(
  leadId: string,
  outcome: {
    converted: boolean;
    value: number;
    notes?: string;
  }
): void {
  if (!fs) return; // Skip in client context
  try {
    let feedback: FeedbackRecord[] = [];
    if (fs.existsSync(FEEDBACK_FILE)) {
      const data = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf-8'));
      feedback = data.records || [];
    }
    
    // Find and update record
    const record = feedback.find(r => r.leadId === leadId);
    if (record) {
      record.outcome = {
        ...outcome,
        reviewedAt: new Date().toISOString(),
      };
      
      fs.writeFileSync(FEEDBACK_FILE, JSON.stringify({ records: feedback, lastUpdated: new Date().toISOString() }, null, 2));
    }
  } catch (error) {
    console.warn('[FEEDBACK_LOOP] Failed to record outcome:', error);
  }
}

/**
 * Sample skipped leads for review
 * Returns leads that were skipped but might have been valuable
 */
export function sampleSkippedLeads(limit: number = 100): FeedbackRecord[] {
  if (!fs) return []; // Skip in client context
  try {
    if (!fs.existsSync(FEEDBACK_FILE)) {
      return [];
    }
    
    const data = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf-8'));
    const feedback: FeedbackRecord[] = data.records || [];
    
    // Filter: skipped leads without outcomes (not yet reviewed)
    const skipped = feedback.filter(r => r.skipped && !r.outcome);
    
    // Sort by confidence (lower confidence = more likely false negative)
    skipped.sort((a, b) => a.confidence - b.confidence);
    
    return skipped.slice(0, limit);
  } catch (error) {
    console.warn('[FEEDBACK_LOOP] Failed to sample skipped leads:', error);
    return [];
  }
}

/**
 * Analyze feedback and suggest threshold adjustments
 */
export function analyzeFeedback(): {
  falseNegativeRate: number;
  suggestedAdjustments: ThresholdAdjustment[];
} {
  if (!fs) return { falseNegativeRate: 0, suggestedAdjustments: [] }; // Skip in client context
  try {
    if (!fs.existsSync(FEEDBACK_FILE)) {
      return { falseNegativeRate: 0, suggestedAdjustments: [] };
    }
    
    const data = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf-8'));
    const feedback: FeedbackRecord[] = data.records || [];
    
    // Filter: skipped leads with outcomes
    const skippedWithOutcomes = feedback.filter(r => r.skipped && r.outcome);
    
    if (skippedWithOutcomes.length === 0) {
      return { falseNegativeRate: 0, suggestedAdjustments: [] };
    }
    
    // Calculate false negative rate (skipped but converted)
    const falseNegatives = skippedWithOutcomes.filter(r => r.outcome?.converted).length;
    const falseNegativeRate = falseNegatives / skippedWithOutcomes.length;
    
    // Suggest adjustments based on false negatives
    const suggestedAdjustments: ThresholdAdjustment[] = [];
    
    // If false negative rate > 10%, suggest lowering thresholds
    if (falseNegativeRate > 0.10) {
      // Find common reason codes in false negatives
      const falseNegativeReasons = skippedWithOutcomes
        .filter(r => r.outcome?.converted)
        .flatMap(r => r.reasonCodes);
      
      const reasonCounts = new Map<string, number>();
      falseNegativeReasons.forEach(code => {
        reasonCounts.set(code, (reasonCounts.get(code) || 0) + 1);
      });
      
      // Suggest adjustments for top reasons
      const topReasons = Array.from(reasonCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      
      topReasons.forEach(([code, count]) => {
        if (code === 'LOW_CONFIDENCE') {
          suggestedAdjustments.push({
            threshold: 'CONFIDENCE_SCORE_MIN',
            oldValue: 30,
            newValue: 25, // Lower threshold
            reason: `${count} false negatives with LOW_CONFIDENCE`,
            adjustedAt: new Date().toISOString(),
            adjustedBy: 'system',
          });
        } else if (code === 'LOW_INCOME_BAND') {
          suggestedAdjustments.push({
            threshold: 'INCOME_MAX_THRESHOLD',
            oldValue: 40000,
            newValue: 38000, // Lower threshold slightly
            reason: `${count} false negatives with LOW_INCOME_BAND`,
            adjustedAt: new Date().toISOString(),
            adjustedBy: 'system',
          });
        }
      });
    }
    
    return { falseNegativeRate, suggestedAdjustments };
  } catch (error) {
    console.warn('[FEEDBACK_LOOP] Failed to analyze feedback:', error);
    return { falseNegativeRate: 0, suggestedAdjustments: [] };
  }
}

/**
 * Apply threshold adjustments
 */
export function applyThresholdAdjustments(adjustments: ThresholdAdjustment[]): void {
  if (!fs) return; // Skip in client context
  try {
    let thresholds: Record<string, number> = {};
    if (fs.existsSync(THRESHOLDS_FILE)) {
      const data = JSON.parse(fs.readFileSync(THRESHOLDS_FILE, 'utf-8'));
      thresholds = data.thresholds || {};
    }
    
    adjustments.forEach(adj => {
      thresholds[adj.threshold] = adj.newValue;
    });
    
    fs.writeFileSync(THRESHOLDS_FILE, JSON.stringify({
      thresholds,
      adjustments: adjustments,
      lastUpdated: new Date().toISOString(),
    }, null, 2));
  } catch (error) {
    console.warn('[FEEDBACK_LOOP] Failed to apply threshold adjustments:', error);
  }
}

/**
 * Get current thresholds
 */
export function getThresholds(): Record<string, number> {
  // Return defaults if fs not available (client context)
  const defaults = {
    CONFIDENCE_SCORE_MIN: 30,
    INCOME_MAX_THRESHOLD: 40000,
    INCOME_HIGH_BAND: 60000,
    AGE_MAX: 59,
  };
  
  if (!fs) return defaults; // Skip in client context
  try {
    if (!fs.existsSync(THRESHOLDS_FILE)) {
      return defaults;
    }
    
    const data = JSON.parse(fs.readFileSync(THRESHOLDS_FILE, 'utf-8'));
    return { ...defaults, ...(data.thresholds || {}) };
  } catch (error) {
    console.warn('[FEEDBACK_LOOP] Failed to get thresholds:', error);
    return defaults;
  }
}
