/**
 * Sanitization Utilities
 * 
 * Sanitizes sensitive data for export while preserving structure
 */

/**
 * Sanitize object for export (remove secrets, tokens, passwords)
 */
export function sanitizeForExport(obj: any, depth: number = 0, maxDepth: number = 5): any {
  if (depth > maxDepth) return '[Max Depth]';
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    // Check for JWT-like patterns
    if (obj.match(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/)) {
      return '[REDACTED_JWT]';
    }
    // Check for bearer tokens
    if (obj.startsWith('Bearer ') && obj.length > 20) {
      return 'Bearer [REDACTED]';
    }
    // Check for long hex strings (API keys)
    if (obj.match(/^[a-f0-9]{32,}$/i)) {
      return '[REDACTED_API_KEY]';
    }
    return obj;
  }
  
  if (typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForExport(item, depth + 1, maxDepth));
  }
  
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    
    // Redact sensitive keys
    if (keyLower.includes('password') ||
        keyLower.includes('secret') ||
        keyLower.includes('api_key') ||
        keyLower.includes('apikey') ||
        keyLower.includes('token') && !keyLower.includes('type') ||
        keyLower.includes('authorization') && typeof value === 'string' && value.length > 20) {
      sanitized[key] = '[REDACTED]';
      continue;
    }
    
    // Special handling for authorization headers
    if (keyLower === 'authorization' && typeof value === 'string') {
      if (value.startsWith('Bearer ')) {
        sanitized[key] = 'Bearer [REDACTED]';
        sanitized[`${key}_present`] = true;
        sanitized[`${key}_type`] = 'Bearer';
      } else if (value.startsWith('Basic ')) {
        sanitized[key] = 'Basic [REDACTED]';
        sanitized[`${key}_present`] = true;
        sanitized[`${key}_type`] = 'Basic';
      } else {
        sanitized[key] = '[REDACTED]';
        sanitized[`${key}_present`] = true;
      }
      continue;
    }
    
    // Special handling for cookies
    if (keyLower === 'cookie' && typeof value === 'string') {
      sanitized[key] = '[REDACTED_COOKIES]';
      sanitized[`${key}_present`] = value.length > 0;
      continue;
    }
    
    // Recursively sanitize nested objects
    sanitized[key] = sanitizeForExport(value, depth + 1, maxDepth);
  }
  
  return sanitized;
}

/**
 * Sanitize network request/response
 */
export function sanitizeNetworkData(data: {
  requestBody?: any;
  responseBody?: any;
  headers?: Record<string, string>;
}): {
  requestBody?: any;
  responseBody?: any;
  headers?: Record<string, string | boolean>;
} {
  const sanitized: any = {};
  
  if (data.requestBody) {
    sanitized.requestBody = sanitizeForExport(data.requestBody);
  }
  
  if (data.responseBody) {
    sanitized.responseBody = sanitizeForExport(data.responseBody);
  }
  
  if (data.headers) {
    sanitized.headers = {};
    for (const [key, value] of Object.entries(data.headers)) {
      const keyLower = key.toLowerCase();
      if (keyLower === 'authorization') {
        sanitized.headers[key] = value.startsWith('Bearer ') ? 'Bearer [REDACTED]' : '[REDACTED]';
        sanitized.headers[`${key}_present`] = true;
        sanitized.headers[`${key}_type`] = value.startsWith('Bearer ') ? 'Bearer' : 'Other';
      } else if (keyLower === 'cookie') {
        sanitized.headers[key] = '[REDACTED_COOKIES]';
        sanitized.headers[`${key}_present`] = value.length > 0;
      } else {
        sanitized.headers[key] = value;
      }
    }
  }
  
  return sanitized;
}
