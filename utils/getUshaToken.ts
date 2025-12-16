/**
 * Automatic USHA JWT Token Fetcher from Crokodial API
 * 
 * Fetches authenticated tokens automatically from crokodial.com
 * Caches tokens to avoid excessive API calls
 */

interface CrokodialTokenResponse {
  success: boolean;
  data: {
    token: string;
    timestamp: string;
    extensionId: string;
    isFresh: boolean;
    ageSeconds: number;
  };
  timestamp: string;
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
      console.error('❌ [USHA_TOKEN] Invalid response from Crokodial API:', data);
      return null;
    }

    const token = data.data.token;
    const ageSeconds = data.data.ageSeconds || 0;
    
    // Check if token is a test/placeholder token (not a real JWT)
    // Real JWT tokens are much longer and contain dots (header.payload.signature)
    const isTestToken = token === 'test-token-123' || 
                        token.length < 50 || 
                        !token.includes('.') ||
                        token.split('.').length !== 3;
    
    if (isTestToken) {
      console.warn(`⚠️ [USHA_TOKEN] Crokodial returned test/placeholder token, will use fallback`);
      return null; // Return null to trigger fallback to real token
    }
    
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
 * Priority order:
 * 1. Cached token (if still valid)
 * 2. Environment variable (USHA_JWT_TOKEN)
 * 3. Fresh fetch from Crokodial API
 * 4. Fallback hardcoded token (last resort)
 * 
 * @param providedToken - Optional token provided in request (highest priority)
 * @returns Valid JWT token string
 */
export async function getUshaToken(providedToken?: string | null): Promise<string> {
  // Priority 1: Use provided token if available
  if (providedToken && providedToken.trim()) {
    console.log('🔑 [USHA_TOKEN] Using provided token from request');
    return providedToken.trim();
  }

  // Priority 2: Check cache if still valid
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    const remainingMinutes = Math.floor((tokenCache.expiresAt - Date.now()) / 60000);
    console.log(`🔑 [USHA_TOKEN] Using cached token (expires in ${remainingMinutes}min)`);
    return tokenCache.token;
  }

  // Priority 3: Check environment variable
  const envToken = process.env.USHA_JWT_TOKEN;
  if (envToken && envToken.trim()) {
    console.log('🔑 [USHA_TOKEN] Using token from environment variable');
    return envToken.trim();
  }

  // Priority 4: Fetch fresh token from Crokodial
  const crokodialToken = await fetchTokenFromCrokodial();
  if (crokodialToken) {
    return crokodialToken;
  }

  // Priority 5: Fallback to hardcoded token (last resort)
  console.warn('⚠️ [USHA_TOKEN] All token sources failed, using fallback token');
  const FALLBACK_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlM2FkZjhjNC04ZWM2LTQ1YzctYTI3MC1iMmJmYjAyMThlNjAiLCJzdWIiOiI1RjlFMjBGQS1FMEQzLTQwQzQtQTUzMS0wREIzOTAwN0Q4REEiLCJ1bmlxdWVfbmFtZSI6IkxJTksuUEVMTE9XQHVzaGFkdmlzb3JzLmNvbSIsIk5hbWUiOiJMSU5LLlBFTExPV0B1c2hhZHZpc29ycy5jb20iLCJFbWFpbCI6IkxJTksuUEVMTE9XQHVzaGFkdmlzb3JzLmNvbSIsIkFnZW50TnVtYmVyIjoiMDAwNDQ0NDciLCJDdXJyZW50Q29udGV4dEFnZW50TnVtYmVyIjoiMDAwNDQ0NDciLCJDdXJyZW50Q29udGV4dEFnZW50SUQiOiI0MjY5MiIsIkN1cnJlbnRDb250ZXh0QWdlbmN5VGl0bGUiOiJXQSIsIklkIjoiNUY5RTIwRkEtRTBEMy00MEM0LUE1MzEtMERCMzkwMDdEOERBIiwiZXhwIjoxNzY1OTMwMTIxLCJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjUxMzcwIiwiYXVkIjoiaHR0cDovL2xvY2FsaG9zdDo1MTM3MCJ9.UVgVzF1QEKl8wSrjQji2qN3VEtoKx1wiID_ExqOApuM';
  return FALLBACK_TOKEN;
}

/**
 * Clears the token cache (useful for testing or forced refresh)
 */
export function clearTokenCache(): void {
  tokenCache = null;
  console.log('🔑 [USHA_TOKEN] Token cache cleared');
}
