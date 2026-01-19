/**
 * Historical Cohort Memory System
 * 
 * Learns from actual enrichment outcomes to improve income estimates over time.
 * Stores observed success/failure patterns by cohort (title, industry, geoBucket).
 * 
 * This is how underwriting systems quietly get smarter - not from assumed income,
 * but from observed outcomes.
 */

import * as path from 'path';

// Only import fs in server context
let fs: typeof import('fs') | null = null;
if (typeof window === 'undefined') {
  fs = require('fs');
}

export interface CohortKey {
  title: string; // Normalized job title
  industry: string; // Industry inferred from company
  geoBucket: string; // State or ZIP code
}

export interface CohortOutcome {
  success: number; // Count of successful enrichments (high-value leads)
  failure: number; // Count of failed enrichments (low-value or no conversion)
  lowValue: number; // Count of low-value outcomes
  total: number; // Total observations
  lastUpdated: string; // ISO timestamp
}

export interface CohortMemory {
  version: string;
  lastUpdated: string;
  cohorts: Record<string, CohortOutcome>; // Key: "title|industry|geoBucket"
}

/**
 * Generate cohort key from lead data
 */
export function generateCohortKey(
  jobTitle?: string,
  company?: string,
  state?: string,
  zipCode?: string
): CohortKey | null {
  if (!jobTitle) return null;
  
  // Normalize title (remove seniority variations, keep core role)
  const normalizedTitle = normalizeTitle(jobTitle);
  
  // Infer industry from company name
  const industry = inferIndustry(company);
  
  // Use ZIP if available, otherwise state
  const geoBucket = zipCode ? zipCode.substring(0, 5) : (state?.toUpperCase() || 'unknown');
  
  return {
    title: normalizedTitle,
    industry,
    geoBucket,
  };
}

/**
 * Normalize job title to core role (for cohort matching)
 */
function normalizeTitle(title: string): string {
  const lower = title.toLowerCase().trim();
  
  // Remove seniority indicators
  const withoutSeniority = lower
    .replace(/\b(senior|sr|sr\.|snr|junior|jr|jr\.|lead|principal|staff|distinguished)\b/gi, '')
    .replace(/\b(ceo|cto|cfo|coo|president|vp|vice\s+president|chief|executive|founder|owner|partner)\b/gi, '')
    .trim();
  
  // Extract core function
  const functionKeywords = [
    'engineer', 'developer', 'programmer', 'architect', 'scientist', 'analyst',
    'manager', 'director', 'coordinator', 'specialist', 'consultant', 'advisor',
    'sales', 'marketing', 'product', 'design', 'operations', 'finance', 'accounting',
    'hr', 'human resources', 'legal', 'compliance', 'security', 'support', 'customer',
    'administrator', 'assistant', 'clerk', 'technician', 'technologist',
  ];
  
  for (const keyword of functionKeywords) {
    if (withoutSeniority.includes(keyword)) {
      return keyword;
    }
  }
  
  // Fallback: first significant word
  const words = withoutSeniority.split(/\s+/).filter(w => w.length > 2);
  return words[0] || lower.split(' ')[0] || 'unknown';
}

/**
 * Infer industry from company name
 */
function inferIndustry(company?: string): string {
  if (!company) return 'unknown';
  
  const normalized = company.toLowerCase();
  
  // Industry patterns
  const industries: Record<string, RegExp[]> = {
    'tech': [/\b(tech|technology|software|solutions|systems|services|saas|platform)\b/i],
    'finance': [/\b(bank|financial|finance|investment|wealth|capital|credit|loan)\b/i],
    'healthcare': [/\b(health|medical|hospital|clinic|pharma|pharmaceutical|care)\b/i],
    'retail': [/\b(retail|store|shop|market|commerce|ecommerce)\b/i],
    'education': [/\b(school|university|college|education|academy|institute)\b/i],
    'legal': [/\b(law|legal|attorney|lawyer|firm)\b/i],
    'consulting': [/\b(consulting|consultants|advisory|partners|group)\b/i],
    'real_estate': [/\b(real\s+estate|property|realtor|housing)\b/i],
    'manufacturing': [/\b(manufacturing|production|factory|industrial)\b/i],
    'nonprofit': [/\b(non-profit|nonprofit|foundation|charity)\b/i],
  };
  
  for (const [industry, patterns] of Object.entries(industries)) {
    if (patterns.some(p => p.test(normalized))) {
      return industry;
    }
  }
  
  return 'general';
}

/**
 * Generate cohort key string for storage
 */
function cohortKeyToString(key: CohortKey): string {
  return `${key.title}|${key.industry}|${key.geoBucket}`;
}

/**
 * Load cohort memory from file
 */
function loadCohortMemory(): CohortMemory {
  if (!fs) {
    // Client-side: return empty memory
    return {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      cohorts: {},
    };
  }
  
  const dataPath = getDataFilePath();
  
  try {
    if (fs && fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      return data as CohortMemory;
    }
  } catch (error) {
    console.warn('[COHORT_MEMORY] Error loading cohort memory:', error);
  }
  
  // Return empty memory structure
  return {
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    cohorts: {},
  };
}

/**
 * Save cohort memory to file
 */
function saveCohortMemory(memory: CohortMemory): void {
  if (!fs) {
    // Client-side: skip saving
    return;
  }
  
  const dataPath = getDataFilePath();
  
  try {
    if (!fs) return;
    
    // Ensure directory exists
    const dir = path.dirname(dataPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    memory.lastUpdated = new Date().toISOString();
    fs.writeFileSync(dataPath, JSON.stringify(memory, null, 2), 'utf-8');
  } catch (error) {
    console.error('[COHORT_MEMORY] Error saving cohort memory:', error);
  }
}

/**
 * Get data file path
 */
function getDataFilePath(): string {
  // Try multiple possible paths
  const possiblePaths = [
    path.join(process.cwd(), 'data', 'income-cohort-memory.json'),
    path.join(__dirname, '..', '..', 'data', 'income-cohort-memory.json'),
    path.join(__dirname, '..', 'data', 'income-cohort-memory.json'),
  ];
  
  for (const p of possiblePaths) {
    if (fs && fs.existsSync(path.dirname(p))) {
      return p;
    }
  }
  
  // Default to first path
  return possiblePaths[0];
}

/**
 * Record enrichment outcome
 * 
 * @param cohortKey - Cohort identifier
 * @param outcome - 'success' | 'failure' | 'low_value'
 */
export function recordOutcome(
  cohortKey: CohortKey | null,
  outcome: 'success' | 'failure' | 'low_value'
): void {
  if (!cohortKey) {
    return; // Can't record without cohort key
  }
  
  const memory = loadCohortMemory();
  const key = cohortKeyToString(cohortKey);
  
  if (!memory.cohorts[key]) {
    memory.cohorts[key] = {
      success: 0,
      failure: 0,
      lowValue: 0,
      total: 0,
      lastUpdated: new Date().toISOString(),
    };
  }
  
  const cohort = memory.cohorts[key];
  
  // Increment appropriate counter
  if (outcome === 'success') {
    cohort.success++;
  } else if (outcome === 'failure') {
    cohort.failure++;
  } else if (outcome === 'low_value') {
    cohort.lowValue++;
  }
  
  cohort.total++;
  cohort.lastUpdated = new Date().toISOString();
  
  saveCohortMemory(memory);
}

/**
 * Get historical adjustment based on cohort outcomes
 * 
 * Returns adjustment factors based on observed success rates:
 * - successRate > 0.6 → positive adjustment (cohort performs well)
 * - successRate < 0.3 → negative adjustment (cohort underperforms)
 * - Otherwise → neutral
 */
export function getHistoricalAdjustment(
  cohortKey: CohortKey | null
): {
  medianAdjustmentPct: number; // Percentage to adjust median income
  confidenceAdjustment: number; // Adjustment to confidence score
  hasData: boolean; // Whether historical data exists
} {
  if (!cohortKey) {
    return { medianAdjustmentPct: 0, confidenceAdjustment: 0, hasData: false };
  }
  
  const memory = loadCohortMemory();
  const key = cohortKeyToString(cohortKey);
  const cohort = memory.cohorts[key];
  
  if (!cohort || cohort.total < 5) {
    // Need at least 5 observations to be meaningful
    return { medianAdjustmentPct: 0, confidenceAdjustment: 0, hasData: false };
  }
  
  // Calculate success rate
  const successRate = cohort.success / cohort.total;
  const failureRate = cohort.failure / cohort.total;
  const lowValueRate = cohort.lowValue / cohort.total;
  
  // Combined "good outcome" rate (success + not low value)
  const goodOutcomeRate = successRate + (1 - lowValueRate) * 0.3;
  
  let medianAdjustmentPct = 0;
  let confidenceAdjustment = 0;
  
  // High success rate → positive adjustment (cohort performs better than estimated)
  if (goodOutcomeRate > 0.6) {
    medianAdjustmentPct = (goodOutcomeRate - 0.5) * 20; // Up to +20% for 100% success
    confidenceAdjustment = 0.05; // Increase confidence
  }
  // Low success rate → negative adjustment (cohort underperforms)
  else if (goodOutcomeRate < 0.3) {
    medianAdjustmentPct = (goodOutcomeRate - 0.5) * 15; // Down to -15% for 0% success
    confidenceAdjustment = -0.03; // Decrease confidence slightly
  }
  // Moderate success rate → small positive adjustment
  else if (goodOutcomeRate > 0.4) {
    medianAdjustmentPct = (goodOutcomeRate - 0.4) * 10; // Up to +10% for 50% success
    confidenceAdjustment = 0.02;
  }
  
  // More observations = more confidence in adjustment
  const observationWeight = Math.min(1.0, cohort.total / 20); // Full weight at 20+ observations
  medianAdjustmentPct *= observationWeight;
  confidenceAdjustment *= observationWeight;
  
  return {
    medianAdjustmentPct: Math.max(-20, Math.min(20, medianAdjustmentPct)),
    confidenceAdjustment: Math.max(-0.10, Math.min(0.10, confidenceAdjustment)),
    hasData: true,
  };
}

/**
 * Get cohort statistics for debugging/analysis
 */
export function getCohortStats(cohortKey: CohortKey | null): CohortOutcome | null {
  if (!cohortKey) return null;
  
  const memory = loadCohortMemory();
  const key = cohortKeyToString(cohortKey);
  return memory.cohorts[key] || null;
}

/**
 * Get all cohort statistics (for analysis)
 */
export function getAllCohortStats(): Record<string, CohortOutcome> {
  const memory = loadCohortMemory();
  return memory.cohorts;
}
