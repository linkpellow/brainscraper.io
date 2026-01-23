/**
 * Auth Method Detection Patterns
 * Main entry point - routes to method-specific patterns
 */

import type { AuthMethod, AuthMethodPatterns } from '../../types';
import { oauthPatterns } from './oauth';
import { samlPatterns } from './saml';
import { cookiePatterns } from './cookie';
import { bearerPatterns } from './bearer';
import { basicDigestPatterns } from './basicDigest';
import { apiKeyPatterns } from './apiKey';
import { apiKeyHmacPatterns } from './apiKeyHmac';
import { autoPatterns } from './auto';

/**
 * Get detection patterns for a specific auth method
 */
export function getAuthMethodPatterns(authMethod: AuthMethod): AuthMethodPatterns {
  switch (authMethod) {
    case 'oauth':
      return oauthPatterns();
    case 'saml':
      return samlPatterns();
    case 'cookie':
      return cookiePatterns();
    case 'bearer':
      return bearerPatterns();
    case 'basic':
      return basicDigestPatterns();
    case 'api-key':
      return apiKeyPatterns();
    case 'other':
      // For "other", use auto-detection as fallback
      return autoPatterns();
    case 'auto':
    default:
      return autoPatterns();
  }
}
