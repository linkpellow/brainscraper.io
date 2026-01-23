/**
 * Pipeline Candidate Step
 * 
 * Represents a candidate step for the workflow pipeline, derived from
 * DOM interactions and correlated network events.
 */

import type { ActionEvent } from './actions';
import type { RawNetworkEvent } from './neuromap';

export type AutomationStrategy = 'api' | 'browser_script';

export type AutomationStrategyReason = {
  reason: string;
  confidence: number;
};

export type PipelineCandidateStep = {
  id: string;
  action: ActionEvent;
  correlatedEvents: RawNetworkEvent[];
  strategy: AutomationStrategy;
  strategyReasons: AutomationStrategyReason[];
  strategyConfidence: number;
  userStatus: 'draft' | 'locked' | 'rejected';
  lockedAt?: number;
  extractedVariables?: Record<string, any>;
  dependencies?: string[]; // IDs of previous locked steps this depends on
  storageSnapshot?: {
    cookies?: Record<string, string>;
    localStorage?: Record<string, string>;
    sessionStorage?: Record<string, string>;
  };
};

/**
 * Determine automation strategy for a candidate step
 */
export function determineAutomationStrategy(
  action: ActionEvent,
  correlatedEvents: RawNetworkEvent[]
): {
  strategy: AutomationStrategy;
  reasons: AutomationStrategyReason[];
  confidence: number;
} {
  // Filter out noise (polling, analytics, static assets)
  const relevantEvents = correlatedEvents.filter(event => {
    // Skip OPTIONS (preflight)
    if (event.method === 'OPTIONS') return false;
    
    // Skip very small responses (likely analytics beacons)
    if (event.resBodySize && event.resBodySize < 100) return false;
    
    // Skip static assets
    if (event.resMime && ['image/', 'font/', 'text/css'].some(m => event.resMime!.startsWith(m))) {
      return false;
    }
    
    return true;
  });

  if (relevantEvents.length === 0) {
    return {
      strategy: 'browser_script',
      reasons: [
        { reason: 'No relevant network events detected', confidence: 0.9 },
      ],
      confidence: 0.9,
    };
  }

  // Find mutations (POST/PUT/PATCH/DELETE)
  const mutations = relevantEvents.filter(e => 
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(e.method)
  );

  // Find successful mutations
  const successfulMutations = mutations.filter(e => 
    e.status && e.status >= 200 && e.status < 300
  );

  // Find JSON responses
  const jsonResponses = relevantEvents.filter(e => 
    e.resMime?.includes('application/json') || e.resMime?.includes('text/json')
  );

  // Find large responses (likely meaningful data)
  const largeResponses = relevantEvents.filter(e => 
    e.resBodySize && e.resBodySize > 1000
  );

  // Check for auth requirements
  const hasAuth = relevantEvents.some(e => 
    e.reqHeaders?.['authorization'] ||
    e.reqHeaders?.['x-auth-token'] ||
    e.reqHeaders?.['cookie']
  );

  // Check if request body is present/derivable
  const hasDerivableBody = successfulMutations.some(e => {
    // Can derive body if:
    // 1. Form submission (can read form fields)
    // 2. JSON body is present in request
    // 3. URL-encoded body is present
    if (e.reqBodyText) return true;
    if (action.type === 'submit') return true; // Can read form
    return false;
  });

  const reasons: AutomationStrategyReason[] = [];
  let confidence = 0.5;

  // API-first decision logic
  if (successfulMutations.length > 0) {
    reasons.push({
      reason: `Mutation endpoint detected (${successfulMutations[0].method} ${successfulMutations[0].path})`,
      confidence: 0.9,
    });
    confidence += 0.3;

    if (hasDerivableBody) {
      reasons.push({
        reason: 'Request body is present and derivable',
        confidence: 0.8,
      });
      confidence += 0.2;
    }

    if (hasAuth) {
      reasons.push({
        reason: 'Authentication headers detected (can reuse session)',
        confidence: 0.7,
      });
      confidence += 0.1;
    }

    if (jsonResponses.length > 0) {
      reasons.push({
        reason: 'JSON response detected (structured data for extraction)',
        confidence: 0.8,
      });
      confidence += 0.1;
    }

    if (largeResponses.length > 0) {
      reasons.push({
        reason: 'Large response detected (likely meaningful data)',
        confidence: 0.6,
      });
      confidence += 0.1;
    }

    // Check for complex payload issues
    const complexPayload = successfulMutations.some(e => {
      // Check if request body contains client-only computed values
      // that would be hard to reconstruct
      if (!e.reqBodyText) return false;
      const body = e.reqBodyText.toLowerCase();
      // Simple heuristics - could be expanded
      return body.includes('checksum') || body.includes('signature') || body.includes('nonce');
    });

    if (complexPayload && !hasDerivableBody) {
      reasons.push({
        reason: 'Complex client-only payload detected (may require browser script)',
        confidence: 0.7,
      });
      confidence -= 0.2;
    }

    confidence = Math.min(confidence, 0.95);
    return {
      strategy: 'api',
      reasons,
      confidence,
    };
  }

  // Check for GET requests that might be useful
  if (relevantEvents.length > 0 && action.type !== 'submit' && action.type !== 'change') {
    const gets = relevantEvents.filter(e => e.method === 'GET');
    if (gets.length > 0 && jsonResponses.length > 0) {
      reasons.push({
        reason: `GET endpoint with JSON response detected (${gets[0].path})`,
        confidence: 0.7,
      });
      confidence = 0.7;
      return {
        strategy: 'api',
        reasons,
        confidence,
      };
    }
  }

  // Default to browser script
  reasons.push({
    reason: 'No clear API mutation or determinable endpoint found',
    confidence: 0.8,
  });
  
  if (action.type === 'click' && relevantEvents.length === 0) {
    reasons.push({
      reason: 'Click action with no network events (purely DOM manipulation)',
      confidence: 0.9,
    });
    confidence = 0.9;
  }

  return {
    strategy: 'browser_script',
    reasons,
    confidence: Math.max(confidence, 0.7),
  };
}

/**
 * Create a pipeline candidate step from an action and correlated events
 */
export function createPipelineCandidateStep(
  action: ActionEvent,
  correlatedEvents: RawNetworkEvent[]
): PipelineCandidateStep {
  const strategyDecision = determineAutomationStrategy(action, correlatedEvents);

  return {
    id: `candidate_${action.id}`,
    action,
    correlatedEvents,
    strategy: strategyDecision.strategy,
    strategyReasons: strategyDecision.reasons,
    strategyConfidence: strategyDecision.confidence,
    userStatus: 'draft',
    extractedVariables: {},
    dependencies: [],
  };
}
