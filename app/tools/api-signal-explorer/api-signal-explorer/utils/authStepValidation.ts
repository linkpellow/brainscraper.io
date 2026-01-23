/**
 * Auth Step Validation Utility
 * 
 * Provides production-ready validation to ensure locked steps
 * are actually authentication-related before declaring auth worker complete.
 */

import type { LockedStep } from '../types';

/**
 * Check if an endpoint is authentication-related
 */
function isAuthEndpoint(endpoint: string, method: string): boolean {
  const endpointLower = endpoint.toLowerCase();
  const methodUpper = method.toUpperCase();
  
  // Login/auth endpoints
  if (endpointLower.includes('login') ||
      endpointLower.includes('auth') ||
      endpointLower.includes('signin') ||
      endpointLower.includes('sign-in') ||
      endpointLower.includes('authenticate')) {
    return true;
  }
  
  // OAuth/OIDC endpoints
  if (endpointLower.includes('/oauth') ||
      endpointLower.includes('/authorize') ||
      endpointLower.includes('/token') ||
      endpointLower.includes('/.well-known/openid-configuration')) {
    return true;
  }
  
  // SAML endpoints
  if (endpointLower.includes('/saml')) {
    return true;
  }
  
  // Token validation/refresh endpoints
  if ((endpointLower.includes('token') || endpointLower.includes('refresh')) &&
      methodUpper === 'POST') {
    return true;
  }
  
  // Token validation endpoints
  if (endpointLower.includes('validatetoken') ||
      endpointLower.includes('validate-token') ||
      endpointLower.includes('validatemsaltoken')) {
    return true;
  }
  
  return false;
}

/**
 * Check if a step contains authentication tokens in response
 */
function hasAuthTokens(step: LockedStep): boolean {
  if (!step.response) return false;
  
  let body: any;
  try {
    body = typeof step.response === 'string' 
      ? JSON.parse(step.response) 
      : step.response;
  } catch {
    return false;
  }
  
  if (!body || typeof body !== 'object') return false;
  
  const bodyStr = JSON.stringify(body).toLowerCase();
  
  // Exclude error messages that mention tokens
  const isTokenError = bodyStr.includes('invalid token') ||
                      bodyStr.includes('token expired') ||
                      bodyStr.includes('token error') ||
                      bodyStr.includes('unauthorized') ||
                      bodyStr.includes('forbidden');
  
  if (isTokenError) {
    // Only valid if it also contains actual token fields (unlikely but possible)
    const hasTokenField = bodyStr.includes('"access_token"') ||
                         bodyStr.includes('"refresh_token"') ||
                         bodyStr.includes('"token"');
    if (!hasTokenField) {
      return false; // It's just an error message
    }
  }
  
  // Check for actual token fields (must be JSON keys, not just mentions)
  const tokenFields = [
    'access_token', 'accessToken', 'token',
    'refresh_token', 'refreshToken',
    'id_token', 'idToken',
  ];
  
  // Check if token fields exist as actual keys in the response
  const hasTokenKey = tokenFields.some(field => {
    // Check for JSON key pattern: "field": or "field":
    return bodyStr.includes(`"${field}"`) || bodyStr.includes(`"${field.toLowerCase()}"`);
  });
  
  // Also check for Bearer token in headers (if step has headers)
  // This would be in the request, not response, so we check the endpoint
  const endpointLower = (step.endpoint || '').toLowerCase();
  const isTokenEndpoint = endpointLower.includes('/token') || endpointLower.includes('/auth');
  
  return hasTokenKey || isTokenEndpoint;
}

/**
 * Validate that locked steps 1-4 are actually authentication-related
 * 
 * @param lockedSteps - Array of locked steps
 * @returns Object with validation result and details
 */
export function validateAuthSteps(lockedSteps: LockedStep[]): {
  isValid: boolean;
  authStepsFound: number;
  missingSteps: number[];
  invalidSteps: Array<{ stepNumber: number; endpoint: string; reason: string }>;
} {
  const authSteps = lockedSteps.filter(ls => ls.stepNumber <= 4);
  const authStepsFound = authSteps.length;
  const missingSteps = [1, 2, 3, 4].filter(num => !authSteps.some(ls => ls.stepNumber === num));
  
  const invalidSteps: Array<{ stepNumber: number; endpoint: string; reason: string }> = [];
  
  // Validate each auth step
  for (const step of authSteps) {
    const isAuth = isAuthEndpoint(step.endpoint, step.method);
    const hasTokens = hasAuthTokens(step);
    
    // Step 1 (auth-discovery): Must be a login/auth endpoint
    if (step.stepNumber === 1 && !isAuth) {
      invalidSteps.push({
        stepNumber: step.stepNumber,
        endpoint: step.endpoint,
        reason: 'Step 1 must be a login/authentication endpoint'
      });
    }
    
    // Step 2 (extract-tokens): Must have tokens in response OR be a token endpoint
    if (step.stepNumber === 2 && !hasTokens && !isAuth) {
      invalidSteps.push({
        stepNumber: step.stepNumber,
        endpoint: step.endpoint,
        reason: 'Step 2 must extract tokens (token in response or token endpoint)'
      });
    }
    
    // Step 3 (token-lifecycle): Should be related to token expiration/refresh
    if (step.stepNumber === 3 && !isAuth && !hasTokens) {
      // Step 3 is more lenient - just needs to be somewhat auth-related
      const endpointLower = step.endpoint.toLowerCase();
      if (!endpointLower.includes('token') && 
          !endpointLower.includes('refresh') && 
          !endpointLower.includes('expire') &&
          !endpointLower.includes('session')) {
        invalidSteps.push({
          stepNumber: step.stepNumber,
          endpoint: step.endpoint,
          reason: 'Step 3 should be related to token lifecycle (token, refresh, expire, or session)'
        });
      }
    }
    
    // Step 4 (permanent-creds): Completely optional - never mark as invalid
    // Step 4 is optional because the purpose of Auth Worker is to eliminate the need for permanent credentials
    // If it's locked but not auth-related, that's fine - user can skip it or it can be auto-detected
    // We don't add it to invalidSteps because it's not required
  }
  
  // Auth worker is valid if:
  // 1. At least steps 1-2 are present and valid (required)
  // 2. Steps 3-4 are either valid or missing (optional - step 4 is completely optional)
  const requiredStepsValid = 
    authSteps.some(ls => ls.stepNumber === 1 && isAuthEndpoint(ls.endpoint, ls.method)) &&
    authSteps.some(ls => ls.stepNumber === 2 && (hasAuthTokens(ls) || isAuthEndpoint(ls.endpoint, ls.method)));
  
  // Filter out step 4 from invalid steps (it's optional)
  const invalidStepsExcludingStep4 = invalidSteps.filter(s => s.stepNumber !== 4);
  
  // Missing steps should only count steps 1-3 (step 4 is optional)
  const missingRequiredSteps = missingSteps.filter(num => num !== 4);
  
  const isValid = requiredStepsValid && invalidStepsExcludingStep4.length === 0 && missingRequiredSteps.length <= 1;
  
  return {
    isValid,
    authStepsFound,
    missingSteps,
    invalidSteps,
  };
}
