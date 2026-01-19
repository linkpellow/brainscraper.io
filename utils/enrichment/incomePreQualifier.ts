/**
 * Income Pre-Qualification Engine v2.0
 * 
 * Enhanced deterministic income estimation with two-pass estimator,
 * career ladder normalization, income inertia, and confidence decay.
 * 
 * Purpose: Prevent unnecessary API spend on clearly low-income leads while
 * avoiding false negatives (incorrectly discarding viable leads).
 */

import * as path from 'path';

// Only import fs in server context
let fs: typeof import('fs') | null = null;
if (typeof window === 'undefined') {
  fs = require('fs');
}
import { 
  generateCohortKey, 
  getHistoricalAdjustment,
  type CohortKey 
} from './incomeCohortMemory';

export interface IncomePreQualInput {
  // From LinkedIn
  jobTitle?: string;
  company?: string;
  city?: string;
  state?: string;
  
  // From skip-tracing or ZIP lookup
  zipCode?: string;
  
  // From skip-tracing (if available)
  age?: number;
  dob?: string;
  
  // From Telnyx
  carrierName?: string;
  lineType?: string;
  normalizedCarrier?: string;
  
  // Optional: ZIP median income (if already fetched)
  zipMedianIncome?: number;
}

export interface TitleDecomposition {
  role: string;
  function: string;
  seniority: 'junior' | 'mid' | 'senior' | 'lead' | 'exec' | 'unknown';
  modifiers: string[];
  careerLadderRung: 'ic' | 'senior_ic' | 'lead' | 'manager' | 'director' | 'exec' | 'unknown';
  isAspirational: boolean; // True if title seems inflated for company type
}

export interface CompanyPayBias {
  medianShiftPct: number;
  varianceAdjustmentPct: number;
  companyType: 'fortune500' | 'mid_size' | 'small_business' | 'startup' | 'nonprofit' | 'unknown';
  supportsHighTitles: boolean; // Can this company type support executive titles?
}

export interface GeoBias {
  relativeWealth: 'high' | 'average' | 'low';
  stateMedian?: number;
  zipMedian?: number;
}

export interface IncomePreQualResult {
  // Two-pass estimates
  conservative: {
    min: number;
    max: number;
    p50: number;
  };
  upside: {
    min: number;
    max: number;
    p50: number;
  };
  // Combined for reporting
  estimate: {
    range: {
      min: number;
      max: number;
    };
    p50: number;
    confidence: number; // 0.30-0.90 (never 1.0, never below 0.30)
    primaryDrivers: string[];
    riskFlags: string[];
  };
  decision: {
    tier: 'low' | 'mid' | 'high' | 'unknown';
    shouldContinueEnrichment: boolean;
    reason: string;
  };
}

// ============================================================================
// STATE MEDIAN INCOME DATA (NO API CALLS)
// ============================================================================

let stateMedianCache: Record<string, number> | null = null;

function getStateMedianIncome(state: string | undefined): number | null {
  if (!state) return null;
  
  if (!stateMedianCache) {
    try {
      // Try multiple possible paths
      const possiblePaths = [
        path.join(process.cwd(), 'data', 'state-median-income.json'),
        path.join(__dirname, '..', '..', 'data', 'state-median-income.json'),
        path.join(__dirname, '..', 'data', 'state-median-income.json'),
      ];
      
      let dataPath: string | null = null;
      for (const p of possiblePaths) {
        if (fs && fs.existsSync(p)) {
          dataPath = p;
          break;
        }
      }
      
      if (!dataPath) {
        console.warn('[INCOME_PRE_QUAL] State median income data file not found');
        return null;
      }
      
      if (fs) {
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        stateMedianCache = data.data || {};
      } else {
        return null;
      }
    } catch (error) {
      console.warn('[INCOME_PRE_QUAL] Could not load state median income data:', error);
      return null;
    }
  }
  
  const stateUpper = state.toUpperCase().trim();
  return stateMedianCache[stateUpper] || null;
}

// ============================================================================
// CAREER LADDER NORMALIZATION
// ============================================================================

/**
 * Career ladder: IC → Senior IC → Lead → Manager → Director → Exec
 */
const CAREER_LADDER: Record<string, 'ic' | 'senior_ic' | 'lead' | 'manager' | 'director' | 'exec'> = {
  // IC (Individual Contributor)
  'engineer': 'ic',
  'developer': 'ic',
  'analyst': 'ic',
  'specialist': 'ic',
  'coordinator': 'ic',
  'assistant': 'ic',
  'clerk': 'ic',
  'technician': 'ic',
  
  // Senior IC
  'senior engineer': 'senior_ic',
  'senior developer': 'senior_ic',
  'senior analyst': 'senior_ic',
  'senior specialist': 'senior_ic',
  'principal': 'senior_ic',
  'staff': 'senior_ic',
  'architect': 'senior_ic',
  
  // Lead
  'lead engineer': 'lead',
  'lead developer': 'lead',
  'team lead': 'lead',
  'tech lead': 'lead',
  
  // Manager
  'manager': 'manager',
  'supervisor': 'manager',
  'team manager': 'manager',
  
  // Director
  'director': 'director',
  'senior director': 'director',
  
  // Exec
  'ceo': 'exec',
  'cto': 'exec',
  'cfo': 'exec',
  'coo': 'exec',
  'president': 'exec',
  'vp': 'exec',
  'vice president': 'exec',
  'founder': 'exec',
  'owner': 'exec',
};

/**
 * Map title to career ladder rung
 */
function mapToCareerLadder(decomposed: TitleDecomposition, company?: string): {
  rung: 'ic' | 'senior_ic' | 'lead' | 'manager' | 'director' | 'exec' | 'unknown';
  isAspirational: boolean;
} {
  const titleLower = (decomposed.role + ' ' + decomposed.function).toLowerCase().trim();
  
  // Direct mapping
  for (const [key, rung] of Object.entries(CAREER_LADDER)) {
    if (titleLower.includes(key)) {
      // Check if aspirational (e.g., "CEO" at 1-person LLC)
      const isAspirational = checkIfAspirational(rung, company);
      return { rung, isAspirational };
    }
  }
  
  // Fallback: use seniority
  const seniorityToRung: Record<string, 'ic' | 'senior_ic' | 'lead' | 'manager' | 'director' | 'exec'> = {
    'junior': 'ic',
    'mid': 'ic',
    'senior': 'senior_ic',
    'lead': 'lead',
    'exec': 'exec',
  };
  
  const rung = seniorityToRung[decomposed.seniority] || 'unknown';
  const isAspirational = checkIfAspirational(rung, company);
  
  return { rung, isAspirational };
}

/**
 * Detect if title is aspirational (inflated for company type)
 */
function checkIfAspirational(
  rung: 'ic' | 'senior_ic' | 'lead' | 'manager' | 'director' | 'exec' | 'unknown',
  company?: string
): boolean {
  if (!company || rung === 'unknown' || rung === 'ic' || rung === 'senior_ic') {
    return false;
  }
  
  const companyLower = company.toLowerCase();
  
  // High-level titles at small companies are often aspirational
  if (rung === 'exec' || rung === 'director') {
    // Small business indicators
    if (companyLower.includes('llc') && !companyLower.includes('group') && !companyLower.includes('holdings')) {
      return true; // "CEO" at "John's Plumbing LLC" is aspirational
    }
    if (companyLower.match(/\b(sole\s+proprietor|dba|doing\s+business)\b/i)) {
      return true;
    }
  }
  
  return false;
}

// ============================================================================
// TITLE DECOMPOSITION (ENHANCED)
// ============================================================================

function decomposeTitle(title: string | undefined, company?: string): TitleDecomposition {
  if (!title) {
    return {
      role: '',
      function: '',
      seniority: 'unknown',
      modifiers: [],
      careerLadderRung: 'unknown',
      isAspirational: false,
    };
  }
  
  const normalized = title.toLowerCase().trim();
  const words = normalized.split(/\s+/);
  
  // Extract seniority
  const seniorityPatterns = {
    exec: /\b(ceo|cto|cfo|coo|president|vp|vice\s+president|chief|executive|founder|owner|principal|partner)\b/i,
    lead: /\b(lead|principal|architect|staff|distinguished)\b/i,
    senior: /\b(senior|sr|sr\.|snr|experienced|veteran)\b/i,
    mid: /\b(mid|mid-level|intermediate|specialist)\b/i,
    junior: /\b(junior|jr|jr\.|entry|associate|assistant|intern|trainee)\b/i,
  };
  
  let seniority: TitleDecomposition['seniority'] = 'unknown';
  for (const [level, pattern] of Object.entries(seniorityPatterns)) {
    if (pattern.test(normalized)) {
      seniority = level as TitleDecomposition['seniority'];
      break;
    }
  }
  
  // Extract function
  const functionKeywords = [
    'engineer', 'developer', 'programmer', 'architect', 'scientist', 'analyst',
    'manager', 'director', 'coordinator', 'specialist', 'consultant', 'advisor',
    'sales', 'marketing', 'product', 'design', 'operations', 'finance', 'accounting',
    'hr', 'human resources', 'legal', 'compliance', 'security', 'support', 'customer',
    'executive', 'administrator', 'assistant', 'clerk', 'technician', 'technologist',
  ];
  
  let function_ = '';
  for (const keyword of functionKeywords) {
    if (normalized.includes(keyword)) {
      function_ = keyword;
      break;
    }
  }
  
  const roleWords = words.filter(w => 
    !w.match(/^(sr|jr|senior|junior|lead|principal|executive|vice|chief)$/i) &&
    w.length > 2
  );
  const role = roleWords[0] || '';
  
  const modifiers: string[] = [];
  const modifierPatterns = [
    /\b(remote|hybrid|contract|freelance|part-time|full-time)\b/i,
    /\b(i|ii|iii|iv|v|1|2|3|4|5)\b/,
  ];
  
  for (const pattern of modifierPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      modifiers.push(match[0]);
    }
  }
  
  // Map to career ladder
  const ladderMapping = mapToCareerLadder(
    { role, function: function_, seniority, modifiers, careerLadderRung: 'unknown', isAspirational: false },
    company
  );
  
  return {
    role: role || normalized.split(' ')[0] || '',
    function: function_,
    seniority,
    modifiers,
    careerLadderRung: ladderMapping.rung,
    isAspirational: ladderMapping.isAspirational,
  };
}

// ============================================================================
// BASE INCOME DISTRIBUTIONS (BY CAREER LADDER)
// ============================================================================

const LADDER_BASE_INCOME: Record<string, { min: number; median: number; max: number }> = {
  'ic': { min: 45000, median: 70000, max: 110000 },
  'senior_ic': { min: 70000, median: 110000, max: 160000 },
  'lead': { min: 90000, median: 130000, max: 190000 },
  'manager': { min: 80000, median: 120000, max: 180000 },
  'director': { min: 120000, median: 170000, max: 260000 },
  'exec': { min: 150000, median: 220000, max: 400000 },
  'unknown': { min: 45000, median: 70000, max: 120000 },
};

// Function-specific adjustments
const FUNCTION_ADJUSTMENTS: Record<string, { medianShiftPct: number; variancePct: number }> = {
  'engineer': { medianShiftPct: 15, variancePct: 10 },
  'developer': { medianShiftPct: 10, variancePct: 15 },
  'sales': { medianShiftPct: 5, variancePct: 40 }, // High variance
  'manager': { medianShiftPct: 0, variancePct: 20 },
  'director': { medianShiftPct: 10, variancePct: 15 },
};

// ============================================================================
// COMPANY PAY-BIAS (ENHANCED)
// ============================================================================

function inferCompanyPayBias(company: string | undefined): CompanyPayBias {
  if (!company) {
    return {
      medianShiftPct: 0,
      varianceAdjustmentPct: 0,
      companyType: 'unknown',
      supportsHighTitles: false,
    };
  }
  
  const normalized = company.toLowerCase();
  
  // Fortune 500 / Large enterprise
  const fortune500Patterns = [
    /\b(google|microsoft|apple|amazon|meta|facebook|netflix|tesla|nvidia|salesforce|oracle|ibm|jpmorgan|bank\s+of\s+america|wells\s+fargo|goldman\s+sachs)\b/i,
  ];
  
  // Mid-size
  const midSizePatterns = [
    /\b(inc\.|incorporated|corp\.|corporation)\b/i,
    /\b(tech|technology|software|solutions|systems|services)\b/i,
  ];
  
  // Small business
  const smallBusinessPatterns = [
    /\b(llc|ltd)\b/i,
  ];
  
  // Startup
  const startupPatterns = [
    /\b(startup|start-up|early stage|seed|series\s+a|series\s+b)\b/i,
  ];
  
  // Nonprofit
  const nonprofitPatterns = [
    /\b(non-profit|nonprofit|foundation|charity)\b/i,
  ];
  
  let companyType: CompanyPayBias['companyType'] = 'unknown';
  let medianShiftPct = 0;
  let varianceAdjustmentPct = 0;
  
  if (fortune500Patterns.some(p => p.test(normalized))) {
    companyType = 'fortune500';
    medianShiftPct = 25;
    varianceAdjustmentPct = 5;
  } else if (midSizePatterns.some(p => p.test(normalized))) {
    companyType = 'mid_size';
    medianShiftPct = 10;
    varianceAdjustmentPct = 10;
  } else if (startupPatterns.some(p => p.test(normalized))) {
    companyType = 'startup';
    medianShiftPct = -5;
    varianceAdjustmentPct = 30; // High variance
  } else if (nonprofitPatterns.some(p => p.test(normalized))) {
    companyType = 'nonprofit';
    medianShiftPct = -15;
    varianceAdjustmentPct = 10;
  } else if (smallBusinessPatterns.some(p => p.test(normalized))) {
    companyType = 'small_business';
    medianShiftPct = -10;
    varianceAdjustmentPct = 15;
  }
  
  const supportsHighTitles = companyType === 'fortune500' || companyType === 'mid_size';
  
  return {
    medianShiftPct: Math.max(-20, Math.min(30, medianShiftPct)),
    varianceAdjustmentPct: Math.max(0, Math.min(50, varianceAdjustmentPct)),
    companyType,
    supportsHighTitles,
  };
}

// ============================================================================
// GEOGRAPHIC BIAS (ZIP-TO-STATE COMPARISON)
// ============================================================================

function getGeoBias(
  state: string | undefined,
  zipMedianIncome?: number
): GeoBias {
  const stateMedian = getStateMedianIncome(state);
  
  if (!stateMedian) {
    return { relativeWealth: 'average' };
  }
  
  if (!zipMedianIncome || zipMedianIncome <= 0) {
    return { relativeWealth: 'average', stateMedian };
  }
  
  // Compare ZIP to state median
  const ratio = zipMedianIncome / stateMedian;
  
  let relativeWealth: 'high' | 'average' | 'low' = 'average';
  if (ratio > 1.2) {
    relativeWealth = 'high';
  } else if (ratio < 0.8) {
    relativeWealth = 'low';
  }
  
  return {
    relativeWealth,
    stateMedian,
    zipMedian: zipMedianIncome,
  };
}

// ============================================================================
// CARRIER SIGNAL (LINE TYPE × TENURE LOGIC)
// ============================================================================

function processCarrierSignal(
  carrierName?: string,
  lineType?: string,
  normalizedCarrier?: string
): {
  varianceAdjustmentPct: number;
  confidenceAdjustment: number;
  riskFlags: string[];
  stabilitySignal: 'high' | 'medium' | 'low' | 'unknown';
} {
  const riskFlags: string[] = [];
  let varianceAdjustmentPct = 0;
  let confidenceAdjustment = 0;
  let stabilitySignal: 'high' | 'medium' | 'low' | 'unknown' = 'unknown';
  
  if (!carrierName && !lineType) {
    return { varianceAdjustmentPct: 0, confidenceAdjustment: 0, riskFlags: [], stabilitySignal: 'unknown' };
  }
  
  const carrierLower = (carrierName || '').toLowerCase();
  const lineTypeLower = (lineType || '').toLowerCase();
  
  // Prepaid + long tenure → stability (not poverty)
  const prepaidCarriers = ['metro', 'cricket', 'boost', 'mint', 'tracfone'];
  const isPrepaid = prepaidCarriers.some(c => carrierLower.includes(c));
  
  // VoIP + business indicators → higher income likelihood
  const isVoIP = lineTypeLower === 'voip' || lineTypeLower === 'fixed line' || lineTypeLower === 'fixed-line';
  
  // Premium carriers
  const premiumCarriers = ['verizon', 'att', 'at&t', 't-mobile', 'tmobile'];
  const isPremium = premiumCarriers.some(c => carrierLower.includes(c));
  
  if (isVoIP) {
    varianceAdjustmentPct += 15;
    confidenceAdjustment -= 0.05;
    riskFlags.push('Non-mobile line type increases uncertainty');
    stabilitySignal = 'low';
  } else if (isPrepaid) {
    // Prepaid doesn't necessarily mean low income (could be long tenure = stability)
    varianceAdjustmentPct += 10;
    stabilitySignal = 'medium'; // Neutral - could be stability or budget
  } else if (isPremium) {
    varianceAdjustmentPct -= 5;
    confidenceAdjustment += 0.02;
    stabilitySignal = 'high';
  } else {
    stabilitySignal = 'medium';
  }
  
  return {
    varianceAdjustmentPct: Math.max(0, Math.min(30, varianceAdjustmentPct)),
    confidenceAdjustment: Math.max(-0.10, Math.min(0.05, confidenceAdjustment)),
    riskFlags,
    stabilitySignal,
  };
}

// ============================================================================
// TWO-PASS ESTIMATOR
// ============================================================================

/**
 * PASS 1: Conservative floor (underestimate bias)
 * Answers: "Is this very likely low income?"
 * Purpose: Avoid false negatives (killing good leads)
 */
function estimateConservativeFloor(
  decomposed: TitleDecomposition,
  companyBias: CompanyPayBias,
  geoBias: GeoBias,
  age: number | null,
  carrierSignal: ReturnType<typeof processCarrierSignal>,
  historicalAdjustment?: { medianAdjustmentPct: number; confidenceAdjustment: number; hasData: boolean }
): { min: number; max: number; p50: number } {
  // Start with ladder base (lower bound)
  let baseRange = LADDER_BASE_INCOME[decomposed.careerLadderRung] || LADDER_BASE_INCOME['unknown'];
  
  // If aspirational title, downgrade
  if (decomposed.isAspirational) {
    // Downgrade by one rung
    const downgradedRung = downgradeRung(decomposed.careerLadderRung);
    baseRange = LADDER_BASE_INCOME[downgradedRung] || baseRange;
  }
  
  // Apply function adjustment (conservative - use lower end)
  const funcAdjust = FUNCTION_ADJUSTMENTS[decomposed.function];
  if (funcAdjust) {
    baseRange.median = baseRange.median * (1 + funcAdjust.medianShiftPct / 100 * 0.7); // 70% of adjustment
  }
  
  // Company bias (conservative - less upward adjustment)
  baseRange.median = baseRange.median * (1 + companyBias.medianShiftPct / 100 * 0.8);
  
  // Geographic constraint (conservative - use lower end)
  if (geoBias.relativeWealth === 'low') {
    baseRange.median = baseRange.median * 0.9;
  } else if (geoBias.relativeWealth === 'high') {
    baseRange.median = baseRange.median * 1.05; // Less upward for conservative
  }
  
  // Age adjustment (conservative)
  if (age !== null && age > 0) {
    if (age < 30) {
      baseRange.median = baseRange.median * 0.85;
    } else if (age >= 55) {
      baseRange.median = baseRange.median * 0.95; // Conservative for older
    }
  }
  
  // Apply historical adjustment (if available)
  if (historicalAdjustment?.hasData) {
    // Conservative pass: apply less of the adjustment (70% of historical)
    const adjustment = historicalAdjustment.medianAdjustmentPct * 0.7;
    baseRange.median = baseRange.median * (1 + adjustment / 100);
  }
  
  // Widen range for uncertainty (conservative wants wider lower bound)
  const rangeWidth = baseRange.max - baseRange.min;
  const widenedWidth = rangeWidth * 1.2;
  
  return {
    min: Math.max(30000, baseRange.median - widenedWidth / 2),
    max: baseRange.median + widenedWidth / 2,
    p50: baseRange.median,
  };
}

/**
 * PASS 2: Upside ceiling (overestimate bias)
 * Answers: "Is there plausible upside worth enriching?"
 * Purpose: Avoid wasting spend on hopeless leads
 */
function estimateUpsideCeiling(
  decomposed: TitleDecomposition,
  companyBias: CompanyPayBias,
  geoBias: GeoBias,
  age: number | null,
  carrierSignal: ReturnType<typeof processCarrierSignal>,
  historicalAdjustment?: { medianAdjustmentPct: number; confidenceAdjustment: number; hasData: boolean }
): { min: number; max: number; p50: number } {
  // Start with ladder base (upper bound)
  let baseRange = LADDER_BASE_INCOME[decomposed.careerLadderRung] || LADDER_BASE_INCOME['unknown'];
  
  // If not aspirational, can use full title value
  if (!decomposed.isAspirational) {
    // Use full seniority boost
    if (decomposed.seniority === 'exec' || decomposed.seniority === 'lead') {
      baseRange.median = baseRange.median * 1.1;
    }
  }
  
  // Apply function adjustment (optimistic - use upper end)
  const funcAdjust = FUNCTION_ADJUSTMENTS[decomposed.function];
  if (funcAdjust) {
    baseRange.median = baseRange.median * (1 + funcAdjust.medianShiftPct / 100 * 1.2); // 120% of adjustment
  }
  
  // Company bias (optimistic - full upward adjustment)
  baseRange.median = baseRange.median * (1 + companyBias.medianShiftPct / 100);
  
  // Geographic constraint (optimistic - use upper end)
  if (geoBias.relativeWealth === 'high') {
    baseRange.median = baseRange.median * 1.15;
  } else if (geoBias.relativeWealth === 'low') {
    baseRange.median = baseRange.median * 1.0; // Less downward for optimistic
  }
  
  // Age adjustment (optimistic)
  if (age !== null && age > 0) {
    if (age >= 30 && age < 55) {
      baseRange.median = baseRange.median * 1.15; // Peak earning years
    }
  }
  
  // Apply historical adjustment (if available)
  if (historicalAdjustment?.hasData) {
    // Upside pass: apply full historical adjustment
    baseRange.median = baseRange.median * (1 + historicalAdjustment.medianAdjustmentPct / 100);
  }
  
  // Widen range upward (optimistic wants higher upper bound)
  const rangeWidth = baseRange.max - baseRange.min;
  const widenedWidth = rangeWidth * 1.3;
  
  return {
    min: baseRange.median - widenedWidth / 2,
    max: baseRange.median + widenedWidth / 2,
    p50: baseRange.median,
  };
}

function downgradeRung(rung: string): string {
  const downgradeMap: Record<string, string> = {
    'exec': 'director',
    'director': 'manager',
    'manager': 'lead',
    'lead': 'senior_ic',
    'senior_ic': 'ic',
    'ic': 'ic',
  };
  return downgradeMap[rung] || 'unknown';
}

// ============================================================================
// INCOME INERTIA (ANTI-JUMP PROTECTION)
// ============================================================================

/**
 * Apply income inertia - prevent unrealistic jumps
 * Large positive deltas require multiple strong signals
 */
function applyIncomeInertia(
  conservative: { min: number; max: number; p50: number },
  upside: { min: number; max: number; p50: number },
  geoBias: GeoBias,
  companyBias: CompanyPayBias
): {
  conservative: { min: number; max: number; p50: number };
  upside: { min: number; max: number; p50: number };
} {
  // If title suggests high income but geo + company disagree, cap increase
  const titleSuggestsHigh = upside.p50 > 100000;
  const geoDisagrees = geoBias.relativeWealth === 'low';
  const companyDisagrees = !companyBias.supportsHighTitles;
  
  if (titleSuggestsHigh && (geoDisagrees || companyDisagrees)) {
    // Cap upward movement to 15-20%
    const maxIncrease = 1.18; // 18% max
    const cappedP50 = Math.min(upside.p50, conservative.p50 * maxIncrease);
    
    upside = {
      ...upside,
      p50: cappedP50,
      max: Math.min(upside.max, cappedP50 * 1.3),
    };
  }
  
  return { conservative, upside };
}

// ============================================================================
// CONFIDENCE DECAY (AGGRESSIVE PENALTIES)
// ============================================================================

function calculateConfidenceWithDecay(
  decomposed: TitleDecomposition,
  hasCompany: boolean,
  hasLocation: boolean,
  hasAge: boolean,
  hasCarrier: boolean,
  hasZipMedian: boolean,
  conflicts: string[],
  carrierConfidenceAdjustment: number,
  geoBias: GeoBias
): number {
  let confidence = 0.50; // Base
  
  // Signal completeness (penalize aggressively for missing signals)
  if (decomposed.seniority !== 'unknown') confidence += 0.12;
  else confidence -= 0.15; // Aggressive penalty
  
  if (decomposed.function) confidence += 0.12;
  else confidence -= 0.10;
  
  if (hasCompany) confidence += 0.08;
  else confidence -= 0.12; // Aggressive penalty
  
  if (hasLocation) confidence += 0.08;
  else confidence -= 0.10;
  
  if (hasAge) confidence += 0.06;
  else confidence -= 0.08;
  
  if (hasCarrier) confidence += 0.04;
  
  if (hasZipMedian) confidence += 0.05;
  
  // Agreement between signals (penalize for disagreement)
  if (decomposed.seniority !== 'unknown' && hasAge) {
    // Check alignment
    const age = 35; // Placeholder - would use actual age
    if ((age < 30 && decomposed.seniority === 'exec') || 
        (age > 60 && decomposed.seniority === 'junior')) {
      confidence -= 0.10; // Disagreement penalty
    } else {
      confidence += 0.06; // Agreement bonus
    }
  }
  
  // Geographic agreement
  if (hasZipMedian && geoBias.stateMedian) {
    if (geoBias.relativeWealth !== 'average') {
      confidence += 0.03; // Geographic signal adds confidence
    }
  }
  
  // Penalties for conflicts (aggressive)
  confidence -= conflicts.length * 0.12; // Increased from 0.08
  
  // Carrier adjustment
  confidence += carrierConfidenceAdjustment;
  
  // Aspirational title penalty
  if (decomposed.isAspirational) {
    confidence -= 0.10;
  }
  
  // Bounds: 0.30 minimum, 0.90 maximum
  confidence = Math.max(0.30, Math.min(0.90, confidence));
  
  return Math.round(confidence * 100) / 100;
}

// ============================================================================
// DECISION LOGIC (TWO-PASS)
// ============================================================================

function makePreQualDecision(
  conservative: { min: number; max: number; p50: number },
  upside: { min: number; max: number; p50: number },
  confidence: number,
  conflicts: string[]
): {
  tier: 'low' | 'mid' | 'high' | 'unknown';
  shouldContinueEnrichment: boolean;
  reason: string;
} {
  const floorThreshold = 50000; // Minimum viable income
  const enrichThreshold = 75000; // Worth enriching threshold
  
  // Decision logic:
  // If conservative_max < floor_threshold → STOP
  // If upside_min > enrich_threshold → CONTINUE
  // Else → UNKNOWN → CONTINUE LIMITED
  
  if (conservative.max < floorThreshold) {
    return {
      tier: 'low',
      shouldContinueEnrichment: false,
      reason: `Conservative max ($${Math.round(conservative.max / 1000)}k) below floor threshold ($${Math.round(floorThreshold / 1000)}k)`,
    };
  }
  
  if (upside.min > enrichThreshold) {
    return {
      tier: 'high',
      shouldContinueEnrichment: true,
      reason: `Upside min ($${Math.round(upside.min / 1000)}k) above enrich threshold ($${Math.round(enrichThreshold / 1000)}k)`,
    };
  }
  
  // UNKNOWN or MID - proceed conservatively
  if (confidence < 0.50 || conflicts.length >= 2) {
    return {
      tier: 'unknown',
      shouldContinueEnrichment: true, // Conservative: proceed if uncertain
      reason: `Low confidence (${Math.round(confidence * 100)}%) or multiple conflicts - proceeding conservatively`,
    };
  }
  
  return {
    tier: 'mid',
    shouldContinueEnrichment: true,
    reason: `Moderate confidence (${Math.round(confidence * 100)}%) - proceeding with enrichment`,
  };
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

export function preQualifyIncome(input: IncomePreQualInput): IncomePreQualResult & { cohortKey?: CohortKey | null } {
  // Decompose title with career ladder
  const decomposed = decomposeTitle(input.jobTitle, input.company);
  
  // Get company bias
  const companyBias = inferCompanyPayBias(input.company);
  
  // Get geographic bias (ZIP-to-state comparison)
  const geoBias = getGeoBias(input.state, input.zipMedianIncome);
  
  // Calculate age
  const age = input.age !== undefined && input.age > 0 
    ? input.age 
    : (input.dob ? (() => {
        try {
          const birthDate = new Date(input.dob);
          const today = new Date();
          const calculatedAge = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          return (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) 
            ? calculatedAge - 1 
            : calculatedAge;
        } catch {
          return null;
        }
      })() : null);
  
  // Process carrier signal
  const carrierSignal = processCarrierSignal(
    input.carrierName,
    input.lineType,
    input.normalizedCarrier
  );
  
  // Get historical cohort adjustment (if available)
  const cohortKey = generateCohortKey(input.jobTitle, input.company, input.state, input.zipCode);
  const historicalAdjustment = cohortKey ? getHistoricalAdjustment(cohortKey) : undefined;
  
  // TWO-PASS ESTIMATION
  const conservative = estimateConservativeFloor(decomposed, companyBias, geoBias, age, carrierSignal, historicalAdjustment);
  const upside = estimateUpsideCeiling(decomposed, companyBias, geoBias, age, carrierSignal, historicalAdjustment);
  
  // Apply income inertia
  const { conservative: finalConservative, upside: finalUpside } = applyIncomeInertia(
    conservative,
    upside,
    geoBias,
    companyBias
  );
  
  // Detect conflicts
  const conflicts: string[] = [];
  if (decomposed.isAspirational) {
    conflicts.push('Title appears aspirational for company type');
  }
  if (geoBias.relativeWealth === 'low' && finalUpside.p50 > 100000) {
    conflicts.push('High income estimate but low relative wealth area');
  }
  if (!companyBias.supportsHighTitles && (decomposed.seniority === 'exec' || decomposed.seniority === 'director')) {
    conflicts.push('High-level title but company type may not support it');
  }
  
  // Calculate confidence with decay
  let confidence = calculateConfidenceWithDecay(
    decomposed,
    !!input.company,
    !!(input.city && input.state),
    age !== null,
    !!input.carrierName,
    !!input.zipMedianIncome,
    conflicts,
    carrierSignal.confidenceAdjustment,
    geoBias
  );
  
  // Apply historical confidence adjustment (if available)
  if (historicalAdjustment?.hasData) {
    confidence = Math.max(0.30, Math.min(0.90, confidence + historicalAdjustment.confidenceAdjustment));
  }
  
  // Make decision
  const decision = makePreQualDecision(finalConservative, finalUpside, confidence, conflicts);
  
  // Build drivers and flags
  const primaryDrivers: string[] = [];
  if (decomposed.careerLadderRung !== 'unknown') {
    primaryDrivers.push(`career ladder: ${decomposed.careerLadderRung}`);
  }
  if (decomposed.function) primaryDrivers.push(`${decomposed.function} role`);
  if (input.company) primaryDrivers.push(`company: ${input.company}`);
  if (geoBias.relativeWealth !== 'average') {
    primaryDrivers.push(`geo: ${geoBias.relativeWealth} relative wealth`);
  }
  if (age !== null) primaryDrivers.push(`age: ${age}`);
  if (historicalAdjustment?.hasData) {
    primaryDrivers.push(`historical: ${historicalAdjustment.medianAdjustmentPct > 0 ? '+' : ''}${Math.round(historicalAdjustment.medianAdjustmentPct)}% adjustment`);
  }
  
  const riskFlags = [...conflicts, ...carrierSignal.riskFlags];
  if (decomposed.seniority === 'unknown') {
    riskFlags.push('Job title seniority unclear');
  }
  if (!input.company) {
    riskFlags.push('Company name missing');
  }
  if (!input.city || !input.state) {
    riskFlags.push('Location data incomplete');
  }
  
  // Combined range for reporting (conservative min, upside max)
  const combinedRange = {
    min: finalConservative.min,
    max: finalUpside.max,
    p50: (finalConservative.p50 + finalUpside.p50) / 2,
  };
  
  return {
    conservative: {
      min: Math.round(finalConservative.min / 1000) * 1000,
      max: Math.round(finalConservative.max / 1000) * 1000,
      p50: Math.round(finalConservative.p50 / 1000) * 1000,
    },
    upside: {
      min: Math.round(finalUpside.min / 1000) * 1000,
      max: Math.round(finalUpside.max / 1000) * 1000,
      p50: Math.round(finalUpside.p50 / 1000) * 1000,
    },
    estimate: {
      range: {
        min: Math.round(combinedRange.min / 1000) * 1000,
        max: Math.round(combinedRange.max / 1000) * 1000,
      },
      p50: Math.round(combinedRange.p50 / 1000) * 1000,
      confidence,
      primaryDrivers,
      riskFlags,
    },
    decision,
    cohortKey, // Include for outcome recording
  };
}
