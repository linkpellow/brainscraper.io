/**
 * Smart Variable Detection & Extraction
 * Enhanced pattern matching for API responses
 */

export type VariablePattern = {
  name: string;
  paths: string[]; // JSON paths to check
  aliases: string[]; // Alternative names
  type: 'auth' | 'id' | 'pagination' | 'metadata' | 'data';
  priority: number; // Higher = more important
  transform?: (value: any) => any;
};

/**
 * Comprehensive variable patterns
 */
const VARIABLE_PATTERNS: VariablePattern[] = [
  // Authentication tokens (highest priority)
  {
    name: 'token',
    paths: ['token', 'access_token', 'accessToken', 'auth_token', 'authToken', 'jwt', 'bearer'],
    aliases: ['token', 'access_token', 'jwt'],
    type: 'auth',
    priority: 100,
  },
  {
    name: 'refreshToken',
    paths: ['refresh_token', 'refreshToken', 'refresh'],
    aliases: ['refresh_token', 'refreshToken'],
    type: 'auth',
    priority: 95,
  },
  {
    name: 'apiKey',
    paths: ['api_key', 'apiKey', 'key', 'api_token'],
    aliases: ['api_key', 'apiKey'],
    type: 'auth',
    priority: 90,
  },
  {
    name: 'sessionId',
    paths: ['session_id', 'sessionId', 'session', 'sid'],
    aliases: ['session_id', 'sessionId'],
    type: 'auth',
    priority: 85,
  },
  
  // User identifiers
  {
    name: 'userId',
    paths: ['user_id', 'userId', 'user.id', 'id', 'uid', 'account_id', 'accountId'],
    aliases: ['user_id', 'userId', 'uid'],
    type: 'id',
    priority: 80,
  },
  {
    name: 'username',
    paths: ['username', 'user_name', 'userName', 'user.username', 'login'],
    aliases: ['username', 'user_name'],
    type: 'id',
    priority: 70,
  },
  {
    name: 'email',
    paths: ['email', 'user_email', 'userEmail', 'user.email', 'mail'],
    aliases: ['email', 'user_email'],
    type: 'id',
    priority: 65,
  },
  
  // Resource identifiers
  {
    name: 'id',
    paths: ['id', '_id', 'uuid', 'guid'],
    aliases: ['id', '_id', 'uuid'],
    type: 'id',
    priority: 75,
  },
  {
    name: 'productId',
    paths: ['product_id', 'productId', 'item_id', 'itemId', 'sku'],
    aliases: ['product_id', 'productId', 'sku'],
    type: 'id',
    priority: 60,
  },
  {
    name: 'orderId',
    paths: ['order_id', 'orderId', 'order_number', 'orderNumber', 'transaction_id'],
    aliases: ['order_id', 'orderId'],
    type: 'id',
    priority: 60,
  },
  
  // Pagination
  {
    name: 'nextPage',
    paths: ['next_page', 'nextPage', 'next', 'pagination.next', 'page.next', 'next_url', 'nextUrl'],
    aliases: ['next_page', 'nextPage', 'next'],
    type: 'pagination',
    priority: 50,
  },
  {
    name: 'cursor',
    paths: ['cursor', 'next_cursor', 'nextCursor', 'pagination.cursor', 'page_cursor'],
    aliases: ['cursor', 'next_cursor'],
    type: 'pagination',
    priority: 50,
  },
  {
    name: 'totalPages',
    paths: ['total_pages', 'totalPages', 'page_count', 'pageCount', 'pagination.total_pages'],
    aliases: ['total_pages', 'totalPages'],
    type: 'pagination',
    priority: 40,
  },
  {
    name: 'totalItems',
    paths: ['total', 'total_count', 'totalCount', 'count', 'total_items', 'totalItems'],
    aliases: ['total', 'total_count'],
    type: 'pagination',
    priority: 40,
  },
  
  // Metadata
  {
    name: 'timestamp',
    paths: ['timestamp', 'created_at', 'createdAt', 'time', 'date'],
    aliases: ['timestamp', 'created_at'],
    type: 'metadata',
    priority: 30,
  },
  {
    name: 'expiresAt',
    paths: ['expires_at', 'expiresAt', 'expiry', 'expires_in', 'expiresIn', 'ttl'],
    aliases: ['expires_at', 'expiresAt'],
    type: 'metadata',
    priority: 35,
    transform: (value: any) => {
      // Convert relative expiry (seconds) to absolute timestamp
      if (typeof value === 'number' && value < 1000000000000) {
        return Date.now() + (value * 1000);
      }
      return value;
    },
  },
  
  // Data arrays
  {
    name: 'data',
    paths: ['data', 'results', 'items', 'records', 'list'],
    aliases: ['data', 'results'],
    type: 'data',
    priority: 20,
  },
];

/**
 * Get nested property value from object
 */
function getNestedValue(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  
  return current;
}

/**
 * Extract variables using comprehensive patterns
 */
export function extractSmartVariables(response: any): Record<string, any> {
  const extracted: Record<string, any> = {};
  
  if (!response || typeof response !== 'object') {
    return extracted;
  }
  
  // Sort patterns by priority
  const sortedPatterns = [...VARIABLE_PATTERNS].sort((a, b) => b.priority - a.priority);
  
  for (const pattern of sortedPatterns) {
    let found = false;
    
    // Try each path
    for (const path of pattern.paths) {
      const value = getNestedValue(response, path);
      
      if (value !== undefined && value !== null && value !== '') {
        // Apply transform if exists
        const finalValue = pattern.transform ? pattern.transform(value) : value;
        
        // Store with primary name
        extracted[pattern.name] = finalValue;
        
        // Also store with first alias for backward compat
        if (pattern.aliases.length > 0 && pattern.aliases[0] !== pattern.name) {
          extracted[pattern.aliases[0]] = finalValue;
        }
        
        found = true;
        break;
      }
    }
    
    // If not found but pattern is high priority, check for similar keys
    if (!found && pattern.priority > 70) {
      const keys = Object.keys(response);
      const fuzzyMatch = keys.find(key => 
        pattern.paths.some(p => key.toLowerCase().includes(p.toLowerCase().split('.')[0]))
      );
      
      if (fuzzyMatch && response[fuzzyMatch]) {
        const value = pattern.transform ? pattern.transform(response[fuzzyMatch]) : response[fuzzyMatch];
        extracted[pattern.name] = value;
      }
    }
  }
  
  return extracted;
}

/**
 * Analyze response structure to suggest variable names
 */
export function suggestVariableNames(response: any): Array<{ key: string; suggested: string; reason: string }> {
  const suggestions: Array<{ key: string; suggested: string; reason: string }> = [];
  
  if (!response || typeof response !== 'object') {
    return suggestions;
  }
  
  const analyze = (obj: any, prefix = '') => {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      // Suggest better names for common patterns
      if (key === 'data' && Array.isArray(value)) {
        suggestions.push({
          key: fullKey,
          suggested: 'items',
          reason: 'More descriptive than "data"',
        });
      }
      
      if (key === 'result' && typeof value === 'object' && !Array.isArray(value)) {
        suggestions.push({
          key: fullKey,
          suggested: 'response',
          reason: 'Clearer naming convention',
        });
      }
      
      // Detect IDs
      if (/^[a-f0-9]{24}$/.test(String(value)) || /^[0-9a-f-]{36}$/.test(String(value))) {
        if (!key.toLowerCase().includes('id')) {
          suggestions.push({
            key: fullKey,
            suggested: `${key}Id`,
            reason: 'Appears to be a UUID/ObjectId',
          });
        }
      }
      
      // Recurse into nested objects (limit depth)
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && prefix.split('.').length < 2) {
        analyze(value, fullKey);
      }
    }
  };
  
  analyze(response);
  return suggestions;
}

/**
 * Validate extracted variables meet expected types
 */
export function validateVariables(
  extracted: Record<string, any>,
  expected: { name: string; type: string; required: boolean }[]
): { valid: boolean; missing: string[]; typeMismatches: string[] } {
  const missing: string[] = [];
  const typeMismatches: string[] = [];
  
  for (const exp of expected) {
    const value = extracted[exp.name];
    
    if (value === undefined || value === null) {
      if (exp.required) {
        missing.push(exp.name);
      }
      continue;
    }
    
    // Type validation
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (exp.type !== actualType && exp.type !== 'any') {
      typeMismatches.push(`${exp.name} (expected ${exp.type}, got ${actualType})`);
    }
  }
  
  return {
    valid: missing.length === 0 && typeMismatches.length === 0,
    missing,
    typeMismatches,
  };
}

/**
 * Detect authentication method from response
 */
export function detectAuthMethod(response: any): 'bearer' | 'basic' | 'api_key' | 'session' | 'unknown' {
  if (!response) return 'unknown';
  
  const extracted = extractSmartVariables(response);
  
  if (extracted.token || extracted.access_token || extracted.jwt) {
    return 'bearer';
  }
  
  if (extracted.apiKey || extracted.api_key) {
    return 'api_key';
  }
  
  if (extracted.sessionId || extracted.session) {
    return 'session';
  }
  
  if (extracted.username && extracted.password) {
    return 'basic';
  }
  
  return 'unknown';
}

/**
 * Generate variable usage examples
 */
export function generateUsageExamples(variables: Record<string, any>): string[] {
  const examples: string[] = [];
  const vars = Object.entries(variables);
  
  for (const [key, value] of vars) {
    const pattern = VARIABLE_PATTERNS.find(p => p.name === key || p.aliases.includes(key));
    
    if (pattern?.type === 'auth') {
      examples.push(`Authorization: Bearer {{${key}}}`);
      examples.push(`curl -H "Authorization: Bearer {{${key}}}" ...`);
    }
    
    if (pattern?.type === 'id') {
      examples.push(`/api/resource/{{${key}}}`);
      examples.push(`GET /users/{{${key}}}/profile`);
    }
    
    if (pattern?.type === 'pagination') {
      examples.push(`?cursor={{${key}}}`);
      examples.push(`GET /items?page={{${key}}}`);
    }
  }
  
  return examples.slice(0, 3); // Return top 3 most relevant
}
