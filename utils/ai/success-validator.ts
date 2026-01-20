/**
 * Success Criteria Validation
 * Validates API responses against user-defined target data structure
 */

export type ValidationResult = {
  isValid: boolean;
  score: number; // 0.0 to 1.0
  matches: string[];
  missing: string[];
  unexpected: string[];
  suggestions: string[];
  confidence: number;
};

/**
 * Parse target data structure from user input
 * Examples:
 * - "{ id, name, price }"
 * - "Array of { product_id, title, stock }"
 * - "id, name, price, stock"
 */
export function parseTargetStructure(targetData: string): {
  expectedFields: string[];
  isArray: boolean;
  nestedPaths: Record<string, string[]>;
} {
  const expectedFields: string[] = [];
  let isArray = false;
  const nestedPaths: Record<string, string[]> = {};
  
  // Detect if expecting array
  if (/array|list|\[\]/.test(targetData.toLowerCase())) {
    isArray = true;
  }
  
  // Extract field names
  // Match: id, name, price OR { id, name, price } OR id: string, name: string
  const fieldPattern = /([a-zA-Z_][a-zA-Z0-9_]*)/g;
  const matches = targetData.match(fieldPattern);
  
  if (matches) {
    // Filter out common type keywords
    const typeKeywords = ['string', 'number', 'boolean', 'object', 'array', 'any', 'of'];
    expectedFields.push(...matches.filter(m => !typeKeywords.includes(m.toLowerCase())));
  }
  
  // Detect nested structures
  // Example: "user.id, user.name, product.title"
  for (const field of expectedFields) {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      if (!nestedPaths[parent]) {
        nestedPaths[parent] = [];
      }
      nestedPaths[parent].push(child);
    }
  }
  
  return {
    expectedFields: [...new Set(expectedFields)], // Remove duplicates
    isArray,
    nestedPaths,
  };
}

/**
 * Validate response structure against target
 */
export function validateResponse(
  response: any,
  targetData: string
): ValidationResult {
  const target = parseTargetStructure(targetData);
  const matches: string[] = [];
  const missing: string[] = [];
  const unexpected: string[] = [];
  const suggestions: string[] = [];
  
  if (!response) {
    return {
      isValid: false,
      score: 0.0,
      matches,
      missing: target.expectedFields,
      unexpected,
      suggestions: ['Response is empty or null'],
      confidence: 1.0,
    };
  }
  
  // If expecting array but got object, check if data is nested
  let dataToCheck = response;
  if (target.isArray && !Array.isArray(response)) {
    // Look for common array container keys
    const arrayContainers = ['data', 'results', 'items', 'list', 'records'];
    for (const key of arrayContainers) {
      if (Array.isArray(response[key])) {
        dataToCheck = response[key][0]; // Check first item
        suggestions.push(`Data found in "${key}" field`);
        break;
      }
    }
    
    if (!Array.isArray(dataToCheck) && typeof dataToCheck === 'object') {
      suggestions.push('Expected array but got object. Try accessing a nested property.');
    }
  } else if (target.isArray && Array.isArray(response)) {
    dataToCheck = response[0] || {}; // Check first item
  }
  
  // Get actual fields in response
  const actualFields = getAllKeys(dataToCheck);
  
  // Check each expected field
  for (const expectedField of target.expectedFields) {
    const found = actualFields.some(actualField => 
      actualField.toLowerCase() === expectedField.toLowerCase() ||
      actualField.toLowerCase().includes(expectedField.toLowerCase()) ||
      expectedField.toLowerCase().includes(actualField.toLowerCase())
    );
    
    if (found) {
      matches.push(expectedField);
    } else {
      missing.push(expectedField);
      
      // Try to find similar fields
      const similar = findSimilarField(expectedField, actualFields);
      if (similar) {
        suggestions.push(`"${expectedField}" not found. Did you mean "${similar}"?`);
      }
    }
  }
  
  // Check for unexpected fields (not necessarily bad)
  for (const actualField of actualFields) {
    const expected = target.expectedFields.some(exp =>
      actualField.toLowerCase() === exp.toLowerCase() ||
      actualField.toLowerCase().includes(exp.toLowerCase()) ||
      exp.toLowerCase().includes(actualField.toLowerCase())
    );
    
    if (!expected) {
      unexpected.push(actualField);
    }
  }
  
  // Calculate score
  const score = target.expectedFields.length > 0
    ? matches.length / target.expectedFields.length
    : 0.0;
  
  // Determine validity (>= 70% match)
  const isValid = score >= 0.7;
  
  // Add general suggestions
  if (missing.length > 0) {
    suggestions.push(`Missing ${missing.length} expected field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
  }
  
  if (unexpected.length > 3) {
    suggestions.push(`Response contains ${unexpected.length} additional fields not specified in target`);
  }
  
  // Calculate confidence based on field count and matches
  const confidence = Math.min(
    1.0,
    (matches.length / Math.max(target.expectedFields.length, 1)) * 
    (actualFields.length > 0 ? 1.0 : 0.5)
  );
  
  return {
    isValid,
    score,
    matches,
    missing,
    unexpected,
    suggestions,
    confidence,
  };
}

/**
 * Get all keys from object including nested
 */
function getAllKeys(obj: any, prefix = ''): string[] {
  const keys: string[] = [];
  
  if (!obj || typeof obj !== 'object') {
    return keys;
  }
  
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    keys.push(fullKey);
    
    // Recurse for nested objects (limit depth to 2)
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && !prefix.includes('.')) {
      keys.push(...getAllKeys(value, fullKey));
    }
  }
  
  return keys;
}

/**
 * Find similar field name using fuzzy matching
 */
function findSimilarField(target: string, candidates: string[]): string | null {
  const targetLower = target.toLowerCase();
  let bestMatch: string | null = null;
  let bestScore = 0;
  
  for (const candidate of candidates) {
    const candidateLower = candidate.toLowerCase();
    
    // Exact match
    if (candidateLower === targetLower) {
      return candidate;
    }
    
    // Contains match
    if (candidateLower.includes(targetLower) || targetLower.includes(candidateLower)) {
      const score = Math.min(targetLower.length, candidateLower.length) / 
                    Math.max(targetLower.length, candidateLower.length);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }
    
    // Levenshtein distance
    const distance = levenshteinDistance(targetLower, candidateLower);
    const maxLen = Math.max(targetLower.length, candidateLower.length);
    const similarity = 1 - (distance / maxLen);
    
    if (similarity > 0.6 && similarity > bestScore) {
      bestScore = similarity;
      bestMatch = candidate;
    }
  }
  
  return bestScore > 0.5 ? bestMatch : null;
}

/**
 * Calculate Levenshtein distance
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

/**
 * Generate improved target data suggestion
 */
export function suggestImprovedTarget(response: any, currentTarget: string): string | null {
  if (!response || typeof response !== 'object') {
    return null;
  }
  
  const keys = getAllKeys(response);
  
  // If response is array, get keys from first item
  if (Array.isArray(response) && response.length > 0) {
    const itemKeys = getAllKeys(response[0]);
    return `Array of { ${itemKeys.slice(0, 5).join(', ')} }`;
  }
  
  // Prioritize important-looking keys
  const importantKeys = keys.filter(k => 
    /^(id|_id|name|title|email|price|amount|status|date|created|updated)$/i.test(k.split('.').pop() || '')
  );
  
  const suggestedKeys = importantKeys.length > 0 
    ? importantKeys.slice(0, 5)
    : keys.slice(0, 5);
  
  return `{ ${suggestedKeys.join(', ')} }`;
}

/**
 * Check if response satisfies minimum requirements
 */
export function meetsMinimumRequirements(response: any): {
  valid: boolean;
  reason?: string;
} {
  if (!response) {
    return { valid: false, reason: 'Response is null or undefined' };
  }
  
  if (typeof response !== 'object') {
    return { valid: false, reason: 'Response is not an object' };
  }
  
  if (Array.isArray(response) && response.length === 0) {
    return { valid: false, reason: 'Response is an empty array' };
  }
  
  if (!Array.isArray(response) && Object.keys(response).length === 0) {
    return { valid: false, reason: 'Response is an empty object' };
  }
  
  return { valid: true };
}
