/**
 * Automation Templates (Step B)
 * 
 * Templates with signature matchers that pick the right endpoint group(s)
 */

import type { AutomationEndpointGroup } from './automationGrouping';

/**
 * Automation template
 */
export type AutomationTemplate = {
  key: string;
  name: string;
  description: string;
  signature: AutomationSignature;
};

/**
 * Signature matcher with scoring
 */
export type AutomationSignature = {
  // Method boost
  preferredMethods?: string[]; // e.g., ['POST']
  methodBoost?: number; // Default: 10
  
  // Path keywords
  pathKeywords?: string[]; // e.g., ['scrub', 'dnc', 'phone']
  pathBoost?: number; // Per keyword match, default: 5
  
  // Request body keywords
  bodyKeywords?: string[]; // e.g., ['phone', 'phoneNumber', 'phones']
  bodyBoost?: number; // Per keyword match, default: 5
  
  // Response keywords
  responseKeywords?: string[]; // e.g., ['scrub', 'dnc', 'status', 'result']
  responseBoost?: number; // Per keyword match, default: 5
  
  // Host boost
  firstPartyBoost?: number; // Default: 3
  
  // Auth boost
  bearerAuthBoost?: number; // Default: 5
  
  // Minimum score to consider
  minScore?: number; // Default: 10
};

/**
 * Match result
 */
export type MatchResult = {
  group: AutomationEndpointGroup;
  score: number;
  evidence: string[];
};

/**
 * Match endpoint group to automation template
 */
export function matchEndpointToAutomation(
  group: AutomationEndpointGroup,
  signature: AutomationSignature
): MatchResult | null {
  let score = 0;
  const evidence: string[] = [];
  
  // Method boost
  if (signature.preferredMethods) {
    if (signature.preferredMethods.includes(group.method)) {
      const boost = signature.methodBoost || 10;
      score += boost;
      evidence.push(`${group.method} method (+${boost})`);
    }
  }
  
  // Path keywords
  if (signature.pathKeywords) {
    const pathLower = group.normalizedPathTemplate.toLowerCase();
    let pathMatches = 0;
    for (const keyword of signature.pathKeywords) {
      if (pathLower.includes(keyword.toLowerCase())) {
        pathMatches++;
      }
    }
    if (pathMatches > 0) {
      const boost = (signature.pathBoost || 5) * pathMatches;
      score += boost;
      evidence.push(`path contains ${pathMatches} keyword(s) (+${boost})`);
    }
  }
  
  // Body keywords
  if (signature.bodyKeywords && group.sampleBodyKeys.length > 0) {
    const bodyKeysLower = group.sampleBodyKeys.map(k => k.toLowerCase());
    let bodyMatches = 0;
    for (const keyword of signature.bodyKeywords) {
      if (bodyKeysLower.some(k => k.includes(keyword.toLowerCase()))) {
        bodyMatches++;
      }
    }
    if (bodyMatches > 0) {
      const boost = (signature.bodyBoost || 5) * bodyMatches;
      score += boost;
      evidence.push(`body has ${bodyMatches} matching field(s) (+${boost})`);
    }
  }
  
  // Response keywords
  if (signature.responseKeywords && group.sampleResponseKeys.length > 0) {
    const responseKeysLower = group.sampleResponseKeys.map(k => k.toLowerCase());
    let responseMatches = 0;
    for (const keyword of signature.responseKeywords) {
      if (responseKeysLower.some(k => k.includes(keyword.toLowerCase()))) {
        responseMatches++;
      }
    }
    if (responseMatches > 0) {
      const boost = (signature.responseBoost || 5) * responseMatches;
      score += boost;
      evidence.push(`response has ${responseMatches} matching field(s) (+${boost})`);
    }
  }
  
  // First-party boost
  if (group.isFirstParty) {
    const boost = signature.firstPartyBoost || 3;
    score += boost;
    evidence.push(`first-party host (+${boost})`);
  }
  
  // Bearer auth boost
  if (group.hasAuthHeader) {
    const boost = signature.bearerAuthBoost || 5;
    score += boost;
    evidence.push(`uses bearer auth (+${boost})`);
  }
  
  // Check minimum score
  const minScore = signature.minScore || 10;
  if (score < minScore) {
    return null;
  }
  
  return {
    group,
    score,
    evidence,
  };
}

/**
 * Find top matches for an automation template
 */
export function findTopMatches(
  groups: AutomationEndpointGroup[],
  template: AutomationTemplate,
  limit: number = 5
): MatchResult[] {
  const matches: MatchResult[] = [];
  
  for (const group of groups) {
    const match = matchEndpointToAutomation(group, template.signature);
    if (match) {
      matches.push(match);
    }
  }
  
  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);
  
  return matches.slice(0, limit);
}

/**
 * Predefined automation templates
 */
export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    key: 'DNC_SCRUB',
    name: 'DNC Scrub',
    description: 'Scrub phone numbers against Do Not Call list',
    signature: {
      preferredMethods: ['POST'],
      methodBoost: 10,
      pathKeywords: ['scrub', 'dnc', 'phone', 'leads'],
      pathBoost: 5,
      bodyKeywords: ['phone', 'phoneNumber', 'phones', 'numbers'],
      bodyBoost: 5,
      responseKeywords: ['scrub', 'dnc', 'status', 'result'],
      responseBoost: 5,
      firstPartyBoost: 3,
      bearerAuthBoost: 5,
      minScore: 15,
    },
  },
  {
    key: 'FETCH_LEADS',
    name: 'Fetch Leads',
    description: 'Retrieve leads/listings from the system',
    signature: {
      preferredMethods: ['GET'],
      methodBoost: 10,
      pathKeywords: ['leads', 'listings', 'contacts', 'search'],
      pathBoost: 5,
      responseKeywords: ['leads', 'items', 'data', 'results'],
      responseBoost: 5,
      firstPartyBoost: 3,
      bearerAuthBoost: 5,
      minScore: 15,
    },
  },
  {
    key: 'UPDATE_LEAD',
    name: 'Update Lead',
    description: 'Update lead information',
    signature: {
      preferredMethods: ['PUT', 'PATCH'],
      methodBoost: 10,
      pathKeywords: ['lead', 'contact', 'update', 'edit'],
      pathBoost: 5,
      bodyKeywords: ['name', 'email', 'phone', 'status'],
      bodyBoost: 5,
      firstPartyBoost: 3,
      bearerAuthBoost: 5,
      minScore: 15,
    },
  },
];

/**
 * Get automation template by key
 */
export function getAutomationTemplate(key: string): AutomationTemplate | undefined {
  return AUTOMATION_TEMPLATES.find(t => t.key === key);
}
