/**
 * Pre-Enrichment Decision Engine
 * 
 * Transforms binary filters into a weighted confidence scoring system
 * that optimizes ROI while controlling costs.
 * 
 * Architecture:
 * - Confidence scoring (0-100) instead of binary pass/fail
 * - Multi-signal kill switches for extreme cases
 * - Machine-readable reason codes
 * - Soft downgrades instead of hard skips where appropriate
 * - Interval-based income logic
 */

import type { EnrichmentStation } from '../enrichmentStations';
import { recordDecision } from './feedbackLoop';
import { getThresholds } from './feedbackLoop';

export type DecisionAction = 'skip' | 'partial' | 'full';
export type DecisionStage = 'pre_linkedin' | 'pre_skip_trace' | 'pre_telnyx' | 'pre_age' | 'post_telnyx';

export interface DecisionReason {
  code: string;
  message: string;
  confidence: number; // 0-100
  stage: DecisionStage;
  signals: string[]; // List of contributing signals
}

export interface DecisionResult {
  action: DecisionAction;
  confidence: number; // 0-100 overall confidence
  reasons: DecisionReason[];
  shouldContinue: boolean;
  enrichmentLevel: 'none' | 'free_only' | 'partial' | 'full';
  estimatedValue: 'low' | 'medium' | 'high' | 'unknown';
  costEstimate: number; // Estimated API cost for this lead
}

export interface LeadSignals {
  // Basic data
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  
  // LinkedIn data
  jobTitle?: string;
  company?: string;
  linkedinUrl?: string;
  profileCompleteness?: number; // 0-100
  
  // Enrichment data
  age?: number;
  dob?: string;
  lineType?: string;
  carrierName?: string;
  normalizedCarrier?: string;
  dncStatus?: string;
  canContact?: boolean;
  
  // Income signals
  estimatedIncome?: {
    min: number;
    max: number;
    p50: number;
    confidence: number;
  };
  zipMedianIncome?: number;
  stateMedianIncome?: number;
  
  // Quality signals
  emailDomain?: string;
  isFreeEmail?: boolean;
  isDisposableEmail?: boolean;
  phonePattern?: 'valid' | 'invalid' | 'suspicious';
  locationMatch?: boolean; // LinkedIn location matches skip-trace location
}

/**
 * Normalize all input data once, early
 * This prevents duplicate logic and inconsistent behavior
 */
export function normalizeLeadSignals(rawSignals: Partial<LeadSignals>): LeadSignals {
  const normalized: LeadSignals = { ...rawSignals };
  
  // Normalize name
  if (normalized.fullName) {
    normalized.fullName = normalized.fullName.trim();
  }
  if (normalized.firstName) {
    normalized.firstName = normalized.firstName.trim();
  }
  if (normalized.lastName) {
    normalized.lastName = normalized.lastName.trim();
  }
  
  // Normalize job title
  if (normalized.jobTitle) {
    normalized.jobTitle = normalized.jobTitle.trim().toLowerCase();
  }
  
  // Normalize company
  if (normalized.company) {
    normalized.company = normalized.company.trim().toLowerCase();
  }
  
  // Normalize email
  if (normalized.email) {
    normalized.email = normalized.email.trim().toLowerCase();
    const domain = normalized.email.split('@')[1];
    normalized.emailDomain = domain;
    normalized.isFreeEmail = isFreeEmailDomain(domain);
    normalized.isDisposableEmail = isDisposableEmailDomain(domain);
  }
  
  // Normalize phone
  if (normalized.phone) {
    const cleaned = normalized.phone.replace(/\D/g, '');
    normalized.phone = cleaned.length === 10 ? cleaned : normalized.phone;
    normalized.phonePattern = validatePhonePattern(cleaned);
  }
  
  // Normalize location
  if (normalized.city) {
    normalized.city = normalized.city.trim();
  }
  if (normalized.state) {
    normalized.state = normalized.state.trim().toUpperCase();
  }
  if (normalized.zipCode) {
    normalized.zipCode = String(normalized.zipCode).match(/\d{5}/)?.[0];
  }
  
  return normalized;
}

/**
 * Free email domain detection
 */
function isFreeEmailDomain(domain: string | undefined): boolean {
  if (!domain) return false;
  const freeDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'protonmail.com'];
  return freeDomains.includes(domain.toLowerCase());
}

/**
 * Disposable email domain detection
 */
function isDisposableEmailDomain(domain: string | undefined): boolean {
  if (!domain) return false;
  const disposableDomains = [
    'tempmail', '10minutemail', 'guerrillamail', 'mailinator', 'throwaway', 'trashmail', 'getnada',
    'mohmal', 'fakeinbox', 'temp-mail', 'yopmail', 'sharklasers',
  ];
  return disposableDomains.some(d => domain.toLowerCase().includes(d));
}

/**
 * Phone pattern validation
 */
function validatePhonePattern(phone: string): 'valid' | 'invalid' | 'suspicious' {
  if (!phone || phone.length !== 10) return 'invalid';
  
  // Sequential numbers
  if (/0123456789|9876543210/.test(phone)) return 'suspicious';
  
  // Repeated numbers
  if (/^(\d)\1{9}$/.test(phone)) return 'suspicious';
  
  // Test numbers (555-0100 pattern)
  if (phone.startsWith('555')) return 'suspicious';
  
  // Invalid area codes
  const areaCode = phone.substring(0, 3);
  if (areaCode === '000' || areaCode === '111' || areaCode === '999') {
    return 'invalid';
  }
  
  return 'valid';
}

/**
 * Obviously low-income title detection
 */
function isObviouslyLowIncomeTitle(title: string | undefined): boolean {
  if (!title) return false;
  const lowIncomeTitles = [
    'cashier', 'retail associate', 'fast food', 'janitor', 'custodian',
    'intern', 'trainee', 'entry level', 'volunteer', 'unpaid',
    'part-time cashier', 'part-time retail', 'seasonal worker',
    'dishwasher', 'server', 'waiter', 'waitress', 'bartender',
    'delivery driver', 'uber driver', 'lyft driver',
  ];
  return lowIncomeTitles.some(lowTitle => title.includes(lowTitle));
}

/**
 * Low-income company detection
 */
function isLowIncomeCompany(company: string | undefined): boolean {
  if (!company) return false;
  const lowIncomeCompanies = [
    'walmart', 'target', 'mcdonald', 'burger king', 'kfc', 'subway',
    'dollar general', 'dollar tree', 'family dollar',
    'foundation', 'charity', 'non-profit', 'nonprofit',
  ];
  return lowIncomeCompanies.some(pattern => company.includes(pattern));
}

/**
 * KILL SWITCH: Multi-signal abort mechanism
 * If multiple independent free signals agree, trust them immediately
 */
export function checkKillSwitch(signals: LeadSignals): DecisionReason | null {
  const killSignals: string[] = [];
  
  // Signal 1: Obviously low-income title
  if (signals.jobTitle && isObviouslyLowIncomeTitle(signals.jobTitle)) {
    killSignals.push('LOW_INCOME_TITLE');
  }
  
  // Signal 2: Low-income ZIP (if available)
  if (signals.zipMedianIncome && signals.zipMedianIncome < 35000) {
    killSignals.push('LOW_INCOME_ZIP');
  }
  
  // Signal 3: Disposable email
  if (signals.isDisposableEmail) {
    killSignals.push('DISPOSABLE_EMAIL');
  }
  
  // Signal 4: Invalid phone pattern
  if (signals.phonePattern === 'invalid') {
    killSignals.push('INVALID_PHONE_PATTERN');
  }
  
  // Signal 5: Age > 59 (if known)
  if (signals.age && signals.age > 59) {
    killSignals.push('AGE_OVER_59');
  }
  
  // Kill switch triggers if 3+ independent signals agree
  if (killSignals.length >= 3) {
    return {
      code: 'KILL_SWITCH',
      message: `Multiple weak signals detected: ${killSignals.join(', ')}`,
      confidence: 95,
      stage: 'pre_skip_trace',
      signals: killSignals,
    };
  }
  
  // Also trigger on extreme single signals
  if (signals.isDisposableEmail && signals.phonePattern === 'invalid') {
    return {
      code: 'KILL_SWITCH',
      message: 'Disposable email + invalid phone pattern',
      confidence: 98,
      stage: 'pre_skip_trace',
      signals: ['DISPOSABLE_EMAIL', 'INVALID_PHONE_PATTERN'],
    };
  }
  
  if (signals.age && signals.age > 59 && signals.jobTitle && isObviouslyLowIncomeTitle(signals.jobTitle)) {
    return {
      code: 'KILL_SWITCH',
      message: 'Age > 59 + low-income title',
      confidence: 97,
      stage: 'pre_skip_trace',
      signals: ['AGE_OVER_59', 'LOW_INCOME_TITLE'],
    };
  }
  
  return null;
}

/**
 * Calculate weighted confidence score
 * Combines multiple signals into a single 0-100 score
 */
export function calculateConfidenceScore(signals: LeadSignals): {
  score: number;
  components: Array<{ name: string; weight: number; value: number; contribution: number }>;
} {
  const components: Array<{ name: string; weight: number; value: number; contribution: number }> = [];
  let totalScore = 0;
  let totalWeight = 0;
  
  // Age confidence (0-20 points)
  if (signals.age !== undefined) {
    let ageValue = 0;
    if (signals.age >= 25 && signals.age <= 55) {
      ageValue = 20; // Prime age range
    } else if (signals.age >= 18 && signals.age < 25) {
      ageValue = 15; // Young but valid
    } else if (signals.age > 55 && signals.age <= 59) {
      ageValue = 10; // Older but still valid
    } else if (signals.age > 59) {
      ageValue = 0; // Over threshold
    } else {
      ageValue = 5; // Very young
    }
    const weight = 20;
    const contribution = (ageValue / 20) * weight;
    totalScore += contribution;
    totalWeight += weight;
    components.push({ name: 'age', weight, value: ageValue, contribution });
  }
  
  // Title income confidence (0-25 points)
  if (signals.jobTitle) {
    let titleValue = 0;
    if (isObviouslyLowIncomeTitle(signals.jobTitle)) {
      titleValue = 0;
    } else if (signals.jobTitle.includes('senior') || signals.jobTitle.includes('director') || 
               signals.jobTitle.includes('manager') || signals.jobTitle.includes('vp') ||
               signals.jobTitle.includes('executive') || signals.jobTitle.includes('ceo')) {
      titleValue = 25; // High-income indicators
    } else if (signals.jobTitle.includes('engineer') || signals.jobTitle.includes('developer') ||
               signals.jobTitle.includes('analyst') || signals.jobTitle.includes('specialist')) {
      titleValue = 18; // Mid-high income
    } else {
      titleValue = 10; // Unknown/neutral
    }
    const weight = 25;
    const contribution = (titleValue / 25) * weight;
    totalScore += contribution;
    totalWeight += weight;
    components.push({ name: 'title', weight, value: titleValue, contribution });
  }
  
  // ZIP income confidence (0-15 points)
  if (signals.zipMedianIncome) {
    let zipValue = 0;
    if (signals.zipMedianIncome >= 80000) {
      zipValue = 15; // High-income area
    } else if (signals.zipMedianIncome >= 60000) {
      zipValue = 12; // Above average
    } else if (signals.zipMedianIncome >= 40000) {
      zipValue = 8; // Average
    } else if (signals.zipMedianIncome >= 30000) {
      zipValue = 4; // Below average
    } else {
      zipValue = 0; // Low-income area
    }
    const weight = 15;
    const contribution = (zipValue / 15) * weight;
    totalScore += contribution;
    totalWeight += weight;
    components.push({ name: 'zip_income', weight, value: zipValue, contribution });
  }
  
  // Company confidence (0-15 points)
  if (signals.company) {
    let companyValue = 0;
    if (isLowIncomeCompany(signals.company)) {
      companyValue = 0;
    } else if (signals.company.includes('inc') || signals.company.includes('corp') || 
               signals.company.includes('llc') && signals.company.length > 10) {
      companyValue = 12; // Established company
    } else if (signals.company.includes('startup') || signals.company.includes('early stage')) {
      companyValue = 6; // Startup (variable)
    } else {
      companyValue = 8; // Unknown
    }
    const weight = 15;
    const contribution = (companyValue / 15) * weight;
    totalScore += contribution;
    totalWeight += weight;
    components.push({ name: 'company', weight, value: companyValue, contribution });
  }
  
  // Profile completeness (0-10 points)
  if (signals.profileCompleteness !== undefined) {
    const weight = 10;
    const contribution = (signals.profileCompleteness / 100) * weight;
    totalScore += contribution;
    totalWeight += weight;
    components.push({ name: 'profile_completeness', weight, value: signals.profileCompleteness, contribution });
  }
  
  // Email quality (0-10 points)
  if (signals.email) {
    let emailValue = 0;
    if (signals.isDisposableEmail) {
      emailValue = 0;
    } else if (signals.isFreeEmail) {
      emailValue = 5; // Free email = lower quality
    } else {
      emailValue = 10; // Corporate email = high quality
    }
    const weight = 10;
    const contribution = (emailValue / 10) * weight;
    totalScore += contribution;
    totalWeight += weight;
    components.push({ name: 'email_quality', weight, value: emailValue, contribution });
  }
  
  // Phone quality (0-5 points)
  if (signals.phone) {
    let phoneValue = 0;
    if (signals.phonePattern === 'valid') {
      phoneValue = 5;
    } else if (signals.phonePattern === 'suspicious') {
      phoneValue = 2;
    } else {
      phoneValue = 0;
    }
    const weight = 5;
    const contribution = (phoneValue / 5) * weight;
    totalScore += contribution;
    totalWeight += weight;
    components.push({ name: 'phone_quality', weight, value: phoneValue, contribution });
  }
  
  // Normalize to 0-100 scale
  const normalizedScore = totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;
  
  return {
    score: Math.round(normalizedScore),
    components,
  };
}

/**
 * Interval-based income decision logic
 * Uses bands instead of point estimates
 */
export function evaluateIncomeBand(estimatedIncome: { min: number; max: number; p50: number } | undefined): {
  band: 'low' | 'high';
  confidence: number;
  requiresStrongPositives: boolean;
} {
  if (!estimatedIncome) {
    // No income data - treat as low (conservative)
    return { band: 'low', confidence: 0, requiresStrongPositives: false };
  }
  
  // Strict $60k minimum threshold
  const minimumIncomeThreshold = 60000;
  
  // Use p50 (median estimate) as primary decision metric
  // If p50 < $60k, lead is rejected
  if (estimatedIncome.p50 < minimumIncomeThreshold) {
    return { band: 'low', confidence: 95, requiresStrongPositives: false };
  }
  
  // Lead earns $60k+ - proceed
  return { band: 'high', confidence: 85, requiresStrongPositives: false };
}

/**
 * Main decision engine
 * Combines all signals into a final decision
 */
export function makeEnrichmentDecision(
  signals: LeadSignals,
  stage: DecisionStage,
  enabledStations?: Set<EnrichmentStation>
): DecisionResult {
  const reasons: DecisionReason[] = [];
  
  // Step 1: Check kill switch first (highest priority)
  const killSwitch = checkKillSwitch(signals);
  if (killSwitch) {
    return {
      action: 'skip',
      confidence: killSwitch.confidence,
      reasons: [killSwitch],
      shouldContinue: false,
      enrichmentLevel: 'none',
      estimatedValue: 'low',
      costEstimate: 0,
    };
  }
  
  // Step 2: Calculate confidence score
  const confidenceResult = calculateConfidenceScore(signals);
  const confidenceScore = confidenceResult.score;
  
  // Step 3: Evaluate income band
  const incomeBand = signals.estimatedIncome 
    ? evaluateIncomeBand(signals.estimatedIncome)
    : { band: 'low' as const, confidence: 0, requiresStrongPositives: false }; // No income data = low (reject)
  
  // Step 4: Determine action based on confidence and income
  let action: DecisionAction = 'full';
  let enrichmentLevel: 'none' | 'free_only' | 'partial' | 'full' = 'full';
  let estimatedValue: 'low' | 'medium' | 'high' | 'unknown' = 'unknown';
  let costEstimate = 0;
  
  // Get dynamic thresholds (can be adjusted via feedback loop)
  const thresholds = getThresholds();
  const confidenceMin = thresholds.CONFIDENCE_SCORE_MIN || 30;
  const minimumIncomeThreshold = 60000; // Strict $60k minimum
  const ageMax = thresholds.AGE_MAX || 59;
  
  // Hard skip conditions (extreme certainty)
  if (confidenceScore < confidenceMin) {
    action = 'skip';
    enrichmentLevel = 'none';
    estimatedValue = 'low';
    reasons.push({
      code: 'LOW_CONFIDENCE',
      message: `Confidence score ${confidenceScore} < 30`,
      confidence: 95,
      stage,
      signals: confidenceResult.components.filter(c => c.contribution < 5).map(c => c.name.toUpperCase()),
    });
  } else if (incomeBand.band === 'low') {
    action = 'skip';
    enrichmentLevel = 'none';
    estimatedValue = 'low';
    reasons.push({
      code: 'INCOME_BELOW_60K',
      message: `Income p50 < $${Math.round(minimumIncomeThreshold / 1000)}k (strict threshold)`,
      confidence: incomeBand.confidence,
      stage,
      signals: ['INCOME_BELOW_60K_THRESHOLD'],
    });
  } else if (signals.age && signals.age > ageMax) {
    action = 'skip';
    enrichmentLevel = 'none';
    estimatedValue = 'low';
    reasons.push({
      code: 'AGE_OVER_59',
      message: `Age ${signals.age} > ${ageMax}`,
      confidence: 98,
      stage,
      signals: ['AGE_THRESHOLD'],
    });
  } else if (signals.phonePattern === 'invalid') {
    action = 'skip';
    enrichmentLevel = 'none';
    estimatedValue = 'low';
    reasons.push({
      code: 'INVALID_PHONE',
      message: 'Invalid phone pattern detected',
      confidence: 95,
      stage,
      signals: ['PHONE_PATTERN_VALIDATION'],
    });
  } else if (signals.isDisposableEmail) {
    action = 'skip';
    enrichmentLevel = 'none';
    estimatedValue = 'low';
    reasons.push({
      code: 'DISPOSABLE_EMAIL',
      message: 'Disposable email domain detected',
      confidence: 90,
      stage,
      signals: ['EMAIL_DOMAIN_VALIDATION'],
    });
  }
  // Partial enrichment (30-60 confidence)
  else if (confidenceScore >= 30 && confidenceScore < 60) {
    action = 'partial';
    enrichmentLevel = 'partial';
    estimatedValue = 'medium';
    costEstimate = 0.015; // Only free/cheap APIs
    reasons.push({
      code: 'PARTIAL_ENRICHMENT',
      message: `Confidence score ${confidenceScore} in partial range (30-60)`,
      confidence: 70,
      stage,
      signals: confidenceResult.components.map(c => c.name.toUpperCase()),
    });
  }
  // Full enrichment (60+ confidence and high income band)
  else {
    action = 'full';
    enrichmentLevel = 'full';
    estimatedValue = confidenceScore >= 80 ? 'high' : 'medium';
    costEstimate = 0.03; // Full enrichment cost
    reasons.push({
      code: 'FULL_ENRICHMENT',
      message: `High confidence (${confidenceScore}) and income band (${incomeBand.band})`,
      confidence: confidenceScore,
      stage,
      signals: confidenceResult.components.filter(c => c.contribution > 10).map(c => c.name.toUpperCase()),
    });
  }
  
  // Soft downgrades (reduce confidence but don't skip)
  if (signals.isFreeEmail && action !== 'skip') {
    reasons.push({
      code: 'SOFT_DOWNGRADE_FREE_EMAIL',
      message: 'Free email domain reduces confidence',
      confidence: 15,
      stage,
      signals: ['FREE_EMAIL_DOMAIN'],
    });
  }
  
  if (signals.profileCompleteness !== undefined && signals.profileCompleteness < 50 && action !== 'skip') {
    reasons.push({
      code: 'SOFT_DOWNGRADE_INCOMPLETE_PROFILE',
      message: 'Incomplete LinkedIn profile reduces confidence',
      confidence: 10,
      stage,
      signals: ['LOW_PROFILE_COMPLETENESS'],
    });
  }
  
  if (signals.company && signals.company.length < 5 && action !== 'skip') {
    reasons.push({
      code: 'SOFT_DOWNGRADE_SMALL_COMPANY',
      message: 'Very small company name reduces confidence',
      confidence: 5,
      stage,
      signals: ['SMALL_COMPANY_NAME'],
    });
  }
  
  // Calculate final confidence (reduce for soft downgrades)
  const downgradePenalty = reasons
    .filter(r => r.code.startsWith('SOFT_DOWNGRADE'))
    .reduce((sum, r) => sum + r.confidence, 0);
  const finalConfidence = Math.max(0, confidenceScore - downgradePenalty);
  
  const decision: DecisionResult = {
    action,
    confidence: finalConfidence,
    reasons,
    shouldContinue: action !== 'skip',
    enrichmentLevel,
    estimatedValue,
    costEstimate,
  };
  
  // Record decision for feedback loop (async, non-blocking)
  try {
    const leadId = `${signals.firstName || ''}_${signals.lastName || ''}_${signals.phone || signals.email || 'unknown'}`.replace(/[^a-zA-Z0-9_]/g, '_');
    recordDecision(leadId, {
      skipped: decision.action === 'skip',
      reason: getReasonSummary(decision).reason,
      reasonCodes: getReasonSummary(decision).codes,
      confidence: decision.confidence,
      decisionStage: stage,
    });
  } catch (error) {
    // Non-blocking: log but don't fail
    console.warn('[DECISION_ENGINE] Failed to record decision for feedback:', error);
  }
  
  return decision;
}

/**
 * Get machine-readable reason summary
 */
export function getReasonSummary(decision: DecisionResult): {
  skipped: boolean;
  reason: string;
  stage: DecisionStage;
  codes: string[];
} {
  const skipReasons = decision.reasons.filter(r => 
    r.code.includes('SKIP') || r.code.includes('KILL') || r.code.includes('LOW') ||
    r.code.includes('INVALID') || r.code.includes('DISPOSABLE') || r.code.includes('AGE_OVER')
  );
  
  return {
    skipped: decision.action === 'skip',
    reason: skipReasons.length > 0 
      ? skipReasons.map(r => r.code).join(' + ')
      : decision.action === 'partial' 
        ? 'PARTIAL_ENRICHMENT'
        : 'FULL_ENRICHMENT',
    stage: decision.reasons[0]?.stage || 'pre_skip_trace',
    codes: decision.reasons.map(r => r.code),
  };
}
