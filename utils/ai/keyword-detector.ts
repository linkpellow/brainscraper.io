/**
 * Keyword Detection System
 * Analyzes user goals to extract intent, entities, and optimization hints
 */

export type DetectedIntent = {
  action: 'fetch' | 'search' | 'login' | 'submit' | 'scrape' | 'monitor' | 'subscribe' | 'unknown';
  confidence: number;
  keywords: string[];
};

export type DetectedEntity = {
  type: 'product' | 'user' | 'order' | 'post' | 'comment' | 'message' | 'transaction' | 'event' | 'custom';
  name: string;
  confidence: number;
};

export type DetectedConstraint = {
  type: 'auth' | 'pagination' | 'rate_limit' | 'filter' | 'sort' | 'date_range' | 'permission' | 'unknown';
  value?: string;
  detected: boolean;
};

export type DetectedOptimization = {
  hint: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
};

export type KeywordAnalysis = {
  intent: DetectedIntent;
  entities: DetectedEntity[];
  constraints: DetectedConstraint[];
  optimizations: DetectedOptimization[];
  suggestedGoalRefinement?: string;
  suggestedConstraints?: string[];
  expectedEndpoints: string[];
};

/**
 * Detect action intent from goal
 */
function detectIntent(goal: string): DetectedIntent {
  const goalLower = goal.toLowerCase();
  
  // Fetch/Retrieve patterns
  if (/(get|fetch|retrieve|pull|extract|obtain|download|grab|collect|gather)/.test(goalLower)) {
    return {
      action: 'fetch',
      confidence: 0.9,
      keywords: ['get', 'fetch', 'retrieve', 'pull', 'extract'],
    };
  }
  
  // Search patterns
  if (/(search|find|lookup|query|filter|locate|discover)/.test(goalLower)) {
    return {
      action: 'search',
      confidence: 0.85,
      keywords: ['search', 'find', 'lookup', 'query'],
    };
  }
  
  // Login/Auth patterns
  if (/(login|authenticate|sign in|log in|access|authorize)/.test(goalLower)) {
    return {
      action: 'login',
      confidence: 0.95,
      keywords: ['login', 'authenticate', 'sign in'],
    };
  }
  
  // Submit/Create patterns
  if (/(submit|create|post|add|insert|upload|register|send|publish)/.test(goalLower)) {
    return {
      action: 'submit',
      confidence: 0.85,
      keywords: ['submit', 'create', 'post', 'add'],
    };
  }
  
  // Scrape patterns
  if (/(scrape|crawl|spider|harvest|mine|parse)/.test(goalLower)) {
    return {
      action: 'scrape',
      confidence: 0.9,
      keywords: ['scrape', 'crawl', 'spider'],
    };
  }
  
  // Monitor patterns
  if (/(monitor|watch|track|observe|follow|check)/.test(goalLower)) {
    return {
      action: 'monitor',
      confidence: 0.8,
      keywords: ['monitor', 'watch', 'track'],
    };
  }
  
  // Subscribe patterns
  if (/(subscribe|listen|stream|webhook|notify|alert)/.test(goalLower)) {
    return {
      action: 'subscribe',
      confidence: 0.85,
      keywords: ['subscribe', 'listen', 'stream'],
    };
  }
  
  return {
    action: 'unknown',
    confidence: 0.0,
    keywords: [],
  };
}

/**
 * Detect entities being operated on
 */
function detectEntities(goal: string, targetData: string): DetectedEntity[] {
  const combined = `${goal} ${targetData}`.toLowerCase();
  const entities: DetectedEntity[] = [];
  
  // Product patterns
  if (/(product|item|listing|sku|inventory|merchandise|goods|catalog)/.test(combined)) {
    entities.push({
      type: 'product',
      name: 'products',
      confidence: 0.9,
    });
  }
  
  // User patterns
  if (/(user|customer|member|account|profile|subscriber|person|contact)/.test(combined)) {
    entities.push({
      type: 'user',
      name: 'users',
      confidence: 0.9,
    });
  }
  
  // Order patterns
  if (/(order|purchase|transaction|sale|cart|checkout|invoice|receipt)/.test(combined)) {
    entities.push({
      type: 'order',
      name: 'orders',
      confidence: 0.85,
    });
  }
  
  // Post/Content patterns
  if (/(post|article|blog|content|page|document|entry)/.test(combined)) {
    entities.push({
      type: 'post',
      name: 'posts',
      confidence: 0.85,
    });
  }
  
  // Comment patterns
  if (/(comment|reply|review|feedback|rating|testimonial)/.test(combined)) {
    entities.push({
      type: 'comment',
      name: 'comments',
      confidence: 0.85,
    });
  }
  
  // Message patterns
  if (/(message|chat|conversation|dm|notification|email)/.test(combined)) {
    entities.push({
      type: 'message',
      name: 'messages',
      confidence: 0.85,
    });
  }
  
  // Event patterns
  if (/(event|activity|log|history|timeline|update)/.test(combined)) {
    entities.push({
      type: 'event',
      name: 'events',
      confidence: 0.8,
    });
  }
  
  return entities;
}

/**
 * Detect constraints from user input
 */
function detectConstraints(constraints: string): DetectedConstraint[] {
  const constraintsLower = constraints.toLowerCase();
  const detected: DetectedConstraint[] = [];
  
  // Auth
  if (/(auth|login|token|credential|permission|authorized|authenticated)/.test(constraintsLower)) {
    detected.push({
      type: 'auth',
      detected: true,
    });
  }
  
  // Pagination
  if (/(paginat|page|limit|offset|cursor|next|previous|batch)/.test(constraintsLower)) {
    detected.push({
      type: 'pagination',
      detected: true,
    });
  }
  
  // Rate limit
  if (/(rate|limit|throttle|quota|rpm|rps|per minute|per second)/.test(constraintsLower)) {
    const match = constraintsLower.match(/(\d+)\s*(req|request|call)s?\s*per\s*(min|sec|hour)/);
    detected.push({
      type: 'rate_limit',
      value: match ? match[0] : undefined,
      detected: true,
    });
  }
  
  // Filter
  if (/(filter|where|condition|criteria|match|select)/.test(constraintsLower)) {
    detected.push({
      type: 'filter',
      detected: true,
    });
  }
  
  // Sort
  if (/(sort|order|rank|priority|asc|desc|ascending|descending)/.test(constraintsLower)) {
    detected.push({
      type: 'sort',
      detected: true,
    });
  }
  
  // Date range
  if (/(date|time|range|from|to|between|since|until|period)/.test(constraintsLower)) {
    detected.push({
      type: 'date_range',
      detected: true,
    });
  }
  
  return detected;
}

/**
 * Generate optimizations based on detected patterns
 */
function generateOptimizations(analysis: {
  intent: DetectedIntent;
  entities: DetectedEntity[];
  constraints: DetectedConstraint[];
}): DetectedOptimization[] {
  const optimizations: DetectedOptimization[] = [];
  
  // If fetching + auth detected → suggest token caching
  if (analysis.intent.action === 'fetch' && analysis.constraints.some(c => c.type === 'auth')) {
    optimizations.push({
      hint: 'Cache authentication token to avoid repeated login requests',
      priority: 'high',
      reason: 'Reduces API calls and improves performance',
    });
  }
  
  // If pagination detected → suggest batch processing
  if (analysis.constraints.some(c => c.type === 'pagination')) {
    optimizations.push({
      hint: 'Use batch fetching with parallel requests for faster pagination',
      priority: 'high',
      reason: 'Speeds up large dataset collection',
    });
  }
  
  // If rate limit detected → suggest throttling
  if (analysis.constraints.some(c => c.type === 'rate_limit')) {
    optimizations.push({
      hint: 'Implement exponential backoff and request queuing',
      priority: 'high',
      reason: 'Prevents rate limit errors',
    });
  }
  
  // If scraping → suggest caching
  if (analysis.intent.action === 'scrape') {
    optimizations.push({
      hint: 'Cache responses to avoid redundant requests',
      priority: 'medium',
      reason: 'Reduces load on target server',
    });
  }
  
  // If searching → suggest filtering early
  if (analysis.intent.action === 'search') {
    optimizations.push({
      hint: 'Apply filters at API level rather than client-side',
      priority: 'medium',
      reason: 'Reduces bandwidth and processing time',
    });
  }
  
  return optimizations;
}

/**
 * Predict expected endpoint patterns
 */
function predictEndpoints(analysis: {
  intent: DetectedIntent;
  entities: DetectedEntity[];
}): string[] {
  const endpoints: string[] = [];
  const entity = analysis.entities[0];
  
  if (!entity) return [];
  
  const entityPath = entity.name.toLowerCase();
  
  // Auth endpoints
  if (analysis.intent.action === 'login') {
    endpoints.push('/auth/login', '/api/auth/login', '/login', '/api/v1/auth/token');
  }
  
  // Fetch endpoints
  if (analysis.intent.action === 'fetch') {
    endpoints.push(
      `/api/${entityPath}`,
      `/api/v1/${entityPath}`,
      `/api/v2/${entityPath}`,
      `/${entityPath}`,
      `/rest/${entityPath}`
    );
  }
  
  // Search endpoints
  if (analysis.intent.action === 'search') {
    endpoints.push(
      `/api/${entityPath}/search`,
      `/api/search/${entityPath}`,
      `/search?type=${entity.type}`,
      `/api/v1/${entityPath}/query`
    );
  }
  
  // Submit endpoints
  if (analysis.intent.action === 'submit') {
    endpoints.push(
      `/api/${entityPath}`,
      `/api/v1/${entityPath}/create`,
      `/api/${entityPath}/new`,
      `/${entityPath}/submit`
    );
  }
  
  return endpoints;
}

/**
 * Main analysis function
 */
export function analyzeKeywords(
  goal: string,
  constraints: string,
  targetData: string
): KeywordAnalysis {
  const intent = detectIntent(goal);
  const entities = detectEntities(goal, targetData);
  const detectedConstraints = detectConstraints(constraints);
  const optimizations = generateOptimizations({ intent, entities, constraints: detectedConstraints });
  const expectedEndpoints = predictEndpoints({ intent, entities });
  
  // Generate refinement suggestions
  let suggestedGoalRefinement: string | undefined;
  if (intent.confidence < 0.7) {
    suggestedGoalRefinement = `Try being more specific. Example: "Get all ${entities[0]?.name || 'items'} with pricing data"`;
  }
  
  // Generate constraint suggestions
  const suggestedConstraints: string[] = [];
  if (!detectedConstraints.some(c => c.type === 'auth') && entities.some(e => ['user', 'order'].includes(e.type))) {
    suggestedConstraints.push('Consider: May require authentication');
  }
  if (!detectedConstraints.some(c => c.type === 'pagination') && intent.action === 'fetch') {
    suggestedConstraints.push('Consider: May need pagination for large datasets');
  }
  
  return {
    intent,
    entities,
    constraints: detectedConstraints,
    optimizations,
    suggestedGoalRefinement,
    suggestedConstraints: suggestedConstraints.length > 0 ? suggestedConstraints : undefined,
    expectedEndpoints,
  };
}

/**
 * Score endpoint relevance to goal
 */
export function scoreEndpointRelevance(
  endpoint: string,
  method: string,
  analysis: KeywordAnalysis
): number {
  let score = 0.0;
  const endpointLower = endpoint.toLowerCase();
  const entity = analysis.entities[0];
  
  // Match expected endpoints
  if (analysis.expectedEndpoints.some(exp => endpointLower.includes(exp.toLowerCase()))) {
    score += 0.5;
  }
  
  // Match entity keywords
  if (entity && endpointLower.includes(entity.name)) {
    score += 0.3;
  }
  
  // Match method to intent
  if (analysis.intent.action === 'fetch' && method === 'GET') {
    score += 0.2;
  } else if (analysis.intent.action === 'submit' && ['POST', 'PUT', 'PATCH'].includes(method)) {
    score += 0.2;
  } else if (analysis.intent.action === 'login' && method === 'POST' && /auth|login/.test(endpointLower)) {
    score += 0.4;
  }
  
  // Match action keywords
  for (const keyword of analysis.intent.keywords) {
    if (endpointLower.includes(keyword)) {
      score += 0.1;
      break;
    }
  }
  
  return Math.min(score, 1.0);
}
