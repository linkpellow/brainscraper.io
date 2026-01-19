/**
 * Record Enrichment Outcome
 * 
 * Utility to record enrichment outcomes for historical cohort memory.
 * Call this after enrichment completes to learn from actual results.
 */

import { generateCohortKey, recordOutcome } from './incomeCohortMemory';

export interface EnrichmentOutcomeData {
  jobTitle?: string;
  company?: string;
  state?: string;
  zipCode?: string;
  outcome: 'success' | 'failure' | 'low_value';
}

/**
 * Record an enrichment outcome
 * 
 * @param data - Enrichment outcome data
 * 
 * Outcomes:
 * - 'success': High-value lead (converted, engaged, high-quality)
 * - 'failure': Low-value or no conversion (wasted enrichment spend)
 * - 'low_value': Lead enriched but low value (not worth the cost)
 */
export function recordEnrichmentOutcome(data: EnrichmentOutcomeData): void {
  try {
    const cohortKey = generateCohortKey(
      data.jobTitle,
      data.company,
      data.state,
      data.zipCode
    );
    
    if (cohortKey) {
      recordOutcome(cohortKey, data.outcome);
      console.log(`[COHORT_MEMORY] Recorded ${data.outcome} for cohort:`, cohortKey);
    } else {
      console.warn('[COHORT_MEMORY] Cannot record outcome - missing cohort key data');
    }
  } catch (error) {
    console.error('[COHORT_MEMORY] Error recording outcome:', error);
    // Non-fatal - don't throw
  }
}

/**
 * Helper to determine outcome from enrichment result
 * 
 * This is a simple heuristic - you may want to customize based on your business logic:
 * - success: Has phone + email + age, income tier is 'high' or 'mid'
 * - low_value: Has some data but income tier is 'low' or enrichment incomplete
 * - failure: No useful data enriched or clearly low-income
 */
export function determineOutcomeFromResult(
  incomePreQual?: {
    decision?: {
      tier?: 'low' | 'mid' | 'high' | 'unknown';
    };
  },
  hasPhone?: boolean,
  hasEmail?: boolean,
  hasAge?: boolean
): 'success' | 'failure' | 'low_value' {
  // High-value: good income tier + complete data
  if (incomePreQual?.decision?.tier === 'high' && hasPhone && hasEmail && hasAge) {
    return 'success';
  }
  
  // Mid-value: decent tier + some data
  if (incomePreQual?.decision?.tier === 'mid' && (hasPhone || hasEmail)) {
    return 'success';
  }
  
  // Low-value: low tier or incomplete data
  if (incomePreQual?.decision?.tier === 'low') {
    return 'low_value';
  }
  
  // Failure: no useful data
  if (!hasPhone && !hasEmail) {
    return 'failure';
  }
  
  // Default: low value if uncertain
  return 'low_value';
}
