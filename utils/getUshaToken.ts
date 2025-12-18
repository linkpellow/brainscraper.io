/**
 * Automatic USHA JWT Token Fetcher from Crokodial API
 * 
 * Backend validates tokens before returning them, so we trust tokens from the API.
 * Basic format validation is kept for user-provided tokens (env var, request params).
 */

interface CrokodialTokenResponse {
  success: boolean;
  data?: {
    token: string;
    timestamp: string;
    extensionId: string;
    isFresh: boolean;
    ageSeconds: number;
  };
  timestamp?: string;
  error?: string;
  refreshRequired?: boolean;
  refreshFlag?: boolean;
}

interface CachedToken {
  token: string;
  expiresAt: number; // Unix timestamp in milliseconds
  fetchedAt: number;
}

// In-memory cache (server-side only)
let tokenCache: CachedToken | null = null;

const CROKODIAL_API_KEY = '667afcac0137b28fe98fb6becbf684f355e38cba003436ab4ad695f7fbf42f';
const CROKODIAL_API_URL = 'https://crokodial.com/api/token';
const TOKEN_BUFFER_SECONDS = 60; // Refresh token 60 seconds before expiration

/**
 * Basic JWT format validation (not expiration check - backend handles that)
 * Returns true if token has valid JWT format, false otherwise
 */
function isValidJWTFormat(token: string): boolean {
  // JWT format: header.payload.signature (3 parts separated by dots)
  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }
  // Basic length check - real JWTs are much longer
  if (token.length < 50) {
    return false;
  }
  return true;
}

/**
 * Fetches a fresh token from Crokodial API
 */
async function fetchTokenFromCrokodial(): Promise<string | null> {
  try {
    console.log('🔑 [USHA_TOKEN] Fetching token from crokodial.com...');
    
    const response = await fetch(CROKODIAL_API_URL, {
      method: 'GET',
      headers: {
        'X-API-Key': CROKODIAL_API_KEY,
      },
      // Add cache control to prevent caching
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error(`❌ [USHA_TOKEN] Crokodial API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data: CrokodialTokenResponse = await response.json();
    
    if (!data.success || !data.data?.token) {
      if (data.error) {
        console.error(`❌ [USHA_TOKEN] Crokodial API error: ${data.error}`);
        if (data.refreshRequired || data.refreshFlag) {
          console.error('❌ [USHA_TOKEN] Backend token refresh required - token not available');
        }
      } else {
        console.error('❌ [USHA_TOKEN] Invalid response from Crokodial API:', data);
      }
      return null;
    }

    const token = data.data.token;
    const ageSeconds = data.data.ageSeconds || 0;
    
    // Check if token is a test/placeholder token (not a real JWT)
    // Backend validates expiration, but we still check format
    const isTestToken = token === 'test-token-123' || !isValidJWTFormat(token);
    
    if (isTestToken) {
      console.warn(`⚠️ [USHA_TOKEN] Crokodial returned test/placeholder token`);
      return null; // Return null to trigger error (no fallback)
    }
    
    // Backend validates token expiration, so we trust it
    
    // Calculate expiration time
    // If token is very old (ageSeconds > 1 hour), don't cache it - fetch fresh next time
    // Otherwise, estimate remaining lifetime (JWT tokens typically last hours)
    // Default to 1 hour expiration if ageSeconds not provided or invalid
    let estimatedLifetimeSeconds: number;
    if (ageSeconds > 3600) {
      // Token is already very old, cache for only 5 minutes (will refresh soon)
      estimatedLifetimeSeconds = 300;
    } else if (ageSeconds > 0) {
      // Token is relatively fresh, estimate remaining time (assume 1 hour total lifetime)
      estimatedLifetimeSeconds = Math.max(3600 - ageSeconds, 300);
    } else {
      // No age info, assume 1 hour lifetime
      estimatedLifetimeSeconds = 3600;
    }
    
    const expiresAt = Date.now() + (estimatedLifetimeSeconds * 1000) - (TOKEN_BUFFER_SECONDS * 1000);
    
    // Cache the token
    tokenCache = {
      token,
      expiresAt,
      fetchedAt: Date.now(),
    };

    console.log(`✅ [USHA_TOKEN] Successfully fetched token from Crokodial (age: ${ageSeconds}s, expires in ~${Math.floor(estimatedLifetimeSeconds / 60)}min)`);
    return token;
  } catch (error) {
    console.error('❌ [USHA_TOKEN] Error fetching token from Crokodial:', error);
    return null;
  }
}

/**
 * Gets a valid USHA JWT token with automatic fetching and caching
 * 
 * Backend (Crokodial API) validates tokens before returning them, so we trust API tokens.
 * Basic format validation is kept for user-provided tokens (env var, request params).
 * 
 * Priority order:
 * 1. Cached token (if still within cache expiration window)
 * 2. Environment variable (USHA_JWT_TOKEN) - basic format check
 * 3. Fresh fetch from Crokodial API - backend validates, we trust it
 * 
 * Throws error if all sources fail (no hardcoded fallback for security/maintainability)
 * 
 * @param providedToken - Optional token provided in request (highest priority)
 * @param forceRefresh - Force token refresh even if cached token exists
 * @returns Valid JWT token string
 */
export async function getUshaToken(providedToken?: string | null, forceRefresh: boolean = false): Promise<string> {
  // Priority 1: Use provided token if available (basic format check)
  if (providedToken && providedToken.trim()) {
    const token = providedToken.trim();
    if (isValidJWTFormat(token)) {
      console.log('🔑 [USHA_TOKEN] Using provided token from request');
      return token;
    } else {
      console.warn('⚠️ [USHA_TOKEN] Provided token has invalid format, fetching fresh token');
      // Fall through to fetch fresh token
    }
  }

  // Priority 2: Check cache if still valid (and not forcing refresh)
  if (!forceRefresh && tokenCache && tokenCache.expiresAt > Date.now()) {
    const remainingMinutes = Math.floor((tokenCache.expiresAt - Date.now()) / 60000);
    console.log(`🔑 [USHA_TOKEN] Using cached token (expires in ${remainingMinutes}min)`);
    return tokenCache.token;
  }

  // Priority 3: Check environment variable (basic format check)
  const envToken = process.env.USHA_JWT_TOKEN;
  if (envToken && envToken.trim()) {
    const token = envToken.trim();
    if (isValidJWTFormat(token)) {
      console.log('🔑 [USHA_TOKEN] Using token from environment variable');
      return token;
    } else {
      console.warn('⚠️ [USHA_TOKEN] Environment token has invalid format, fetching fresh token');
      // Fall through to fetch fresh token
    }
  }

  // Priority 4: Fetch fresh token from Crokodial (backend validates, we trust it)
  console.log('🔑 [USHA_TOKEN] Fetching fresh token from Crokodial API...');
  const crokodialToken = await fetchTokenFromCrokodial();
  if (crokodialToken) {
    return crokodialToken;
  }

  // All token sources failed - this is a critical error
  // No fallback token - we require proper configuration (env var or working Crokodial API)
  console.error('❌ [USHA_TOKEN] CRITICAL: All token sources failed!');
  throw new Error(
    'Failed to obtain valid USHA token. ' +
    'Please ensure USHA_JWT_TOKEN environment variable is set with a valid token, ' +
    'or that the Crokodial API is accessible and returning valid tokens.'
  );
}

/**
 * Clears the token cache (useful for testing or forced refresh)
 */
export function clearTokenCache(): void {
  tokenCache = null;
  console.log('🔑 [USHA_TOKEN] Token cache cleared');
}
