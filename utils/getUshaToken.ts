/**
 * Automatic USHA JWT Token Fetcher
 * 
 * Supports multiple authentication methods in priority order:
 * 1. Provided token (request parameter)
 * 2. Cached token (if valid)
 * 3. Environment variable (USHA_JWT_TOKEN or COGNITO_ID_TOKEN)
 * 4. Cognito authentication (automatic refresh via COGNITO_REFRESH_TOKEN)
 * 5. Direct OAuth authentication (USHA_USERNAME/USHA_PASSWORD or USHA_CLIENT_ID/USHA_CLIENT_SECRET)
 * 
 * Configure COGNITO_REFRESH_TOKEN for seamless automatic token refresh.
 * System automatically handles token expiration and refresh without manual intervention.
 */

interface CachedToken {
  token: string;
  expiresAt: number; // Unix timestamp in milliseconds
  fetchedAt: number;
}

// In-memory cache (server-side only)
let tokenCache: CachedToken | null = null;

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
 * Refresh USHA JWT token using the refresh endpoint
 * 
 * @param existingToken - Current token to refresh
 * @returns New token or null if refresh failed
 */
async function refreshUshaToken(existingToken: string): Promise<string | null> {
  try {
    console.log('🔄 [USHA_TOKEN] Attempting to refresh token via refresh endpoint...');
    
    const response = await fetch('https://api-identity-agent.ushadvisors.com/account/refresh', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${existingToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      console.error(`❌ [USHA_TOKEN] Refresh failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    const newToken = data.tokenResult?.access_token;
    
    if (newToken && isValidJWTFormat(newToken)) {
      console.log('✅ [USHA_TOKEN] Token refreshed successfully');
      
      // Cache the new token with expiration
      try {
        const parts = newToken.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
          if (payload.exp) {
            tokenCache = {
              token: newToken,
              expiresAt: payload.exp * 1000,
              fetchedAt: Date.now()
            };
          } else if (data.tokenResult.expires_in) {
            // Use expires_in from response if token doesn't have exp
            tokenCache = {
              token: newToken,
              expiresAt: Date.now() + (data.tokenResult.expires_in * 1000),
              fetchedAt: Date.now()
            };
          }
        }
      } catch (e) {
        // Couldn't decode expiration, but token is valid - cache it anyway
        tokenCache = {
          token: newToken,
          expiresAt: Date.now() + (3600 * 1000), // Default to 1 hour
          fetchedAt: Date.now()
        };
      }
      
      return newToken;
    }
    
    console.error('❌ [USHA_TOKEN] Refresh response missing access_token');
    return null;
  } catch (error) {
    console.error('❌ [USHA_TOKEN] Refresh error:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Gets a valid USHA JWT token with automatic fetching and caching
 * 
 * Priority order:
 * 1. Provided token (request parameter)
 * 2. Cached token (if still valid, auto-refreshes when expired)
 * 3. Cognito authentication (uses COGNITO_REFRESH_TOKEN or COGNITO_USERNAME/PASSWORD) - RECOMMENDED
 * 4. Direct OAuth authentication (USHA_USERNAME/USHA_PASSWORD or USHA_CLIENT_ID/USHA_CLIENT_SECRET)
 * 5. Environment variable (USHA_JWT_TOKEN - temporary/optional, auto-refreshes when expired)
 * 
 * Once a token is obtained, it will automatically refresh via the refresh endpoint when expired.
 * Configure COGNITO_REFRESH_TOKEN for fully automated authentication with no manual tokens needed.
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
  if (!forceRefresh && tokenCache) {
    const now = Date.now();
    const timeUntilExpiry = tokenCache.expiresAt - now;
    const remainingMinutes = Math.floor(timeUntilExpiry / 60000);
    
    if (timeUntilExpiry > 0) {
      // Token is still valid
      // Proactively refresh if less than 30 minutes remaining (refresh requires valid token)
      const PROACTIVE_REFRESH_THRESHOLD = 30 * 60 * 1000; // 30 minutes in milliseconds
      
      if (timeUntilExpiry < PROACTIVE_REFRESH_THRESHOLD) {
        // Token expires soon, refresh proactively while it's still valid
        console.log(`⚠️ [USHA_TOKEN] Cached token expires in ${remainingMinutes}min, refreshing proactively...`);
        const refreshedToken = await refreshUshaToken(tokenCache.token);
        if (refreshedToken) {
          return refreshedToken;
        }
        // Refresh failed, but token is still valid - use it anyway
        console.log(`⚠️ [USHA_TOKEN] Proactive refresh failed, using existing token (expires in ${remainingMinutes}min)`);
        return tokenCache.token;
      } else {
        // Token has plenty of time left, use it
        console.log(`🔑 [USHA_TOKEN] Using cached token (expires in ${remainingMinutes}min)`);
        return tokenCache.token;
      }
    } else {
      // Token expired, try to refresh it (may fail since refresh requires valid token)
      console.log('⚠️ [USHA_TOKEN] Cached token expired, attempting refresh...');
      const refreshedToken = await refreshUshaToken(tokenCache.token);
      if (refreshedToken) {
        return refreshedToken;
      }
      // Refresh failed, clear cache and continue to other methods
      tokenCache = null;
    }
  }

  // Priority 3: Try Cognito authentication FIRST (before env token) - more reliable
  // (Moved up from Priority 4 to prioritize automated methods)
  
  // Priority 4: Try direct OAuth authentication (no middleman)
  try {
    const { getUshaTokenDirect } = await import('./ushaDirectAuth');
    console.log('🔑 [USHA_TOKEN] Attempting direct OAuth authentication...');
    const directToken = await getUshaTokenDirect(null, forceRefresh);
    if (directToken) {
      return directToken;
    }
  } catch (e) {
    // Direct auth not configured or failed
    console.log('⚠️ [USHA_TOKEN] Direct OAuth authentication not available');
  }

  // Priority 5: Check environment variable (with expiration validation and auto-refresh)
  // NOTE: This is optional - only needed if Cognito/OAuth are not configured
  const envToken = process.env.USHA_JWT_TOKEN;
  if (envToken && envToken.trim()) {
    const token = envToken.trim();
    if (isValidJWTFormat(token)) {
      // Check token expiration
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
          if (payload.exp) {
            const expiration = payload.exp * 1000;
            const now = Date.now();
            const expiresIn = Math.floor((expiration - now) / 1000 / 60);
            
            if (expiration > now) {
              const timeUntilExpiry = expiration - now;
              const PROACTIVE_REFRESH_THRESHOLD = 30 * 60 * 1000; // 30 minutes in milliseconds
              
              // Proactively refresh if less than 30 minutes remaining (refresh requires valid token)
              if (timeUntilExpiry < PROACTIVE_REFRESH_THRESHOLD) {
                console.log(`⚠️ [USHA_TOKEN] Environment token expires in ${expiresIn}min, refreshing proactively...`);
                const refreshedToken = await refreshUshaToken(token);
                if (refreshedToken) {
                  return refreshedToken;
                }
                // Refresh failed, but token is still valid - use it anyway
                console.log(`⚠️ [USHA_TOKEN] Proactive refresh failed, using environment token (expires in ${expiresIn}min)`);
              } else {
                console.log(`🔑 [USHA_TOKEN] Using token from environment variable (expires in ${expiresIn}min)`);
              }
              
              // Cache it for future use
              tokenCache = {
                token,
                expiresAt: expiration,
                fetchedAt: now
              };
              return token;
            } else {
              console.warn(`⚠️ [USHA_TOKEN] Environment token expired ${Math.abs(expiresIn)} minutes ago, attempting refresh...`);
              // Token expired, try to refresh it (may fail since refresh requires valid token)
              const refreshedToken = await refreshUshaToken(token);
              if (refreshedToken) {
                return refreshedToken;
              }
              // Refresh failed - expired tokens cannot be refreshed
              console.error(`❌ [USHA_TOKEN] Cannot refresh expired token. The refresh endpoint requires a valid (non-expired) USHA JWT token.`);
              console.error(`❌ [USHA_TOKEN] Please update USHA_JWT_TOKEN in your environment variables with a fresh token.`);
              console.error(`❌ [USHA_TOKEN] You can obtain a fresh token by logging into the USHA agent portal and extracting it from browser storage or network requests.`);
              // Continue to other methods (though they likely won't work either)
            }
          } else {
            // No expiration in token, assume valid but try to refresh if we have a cached expired token
            console.log('🔑 [USHA_TOKEN] Using token from environment variable (no expiration in token)');
            // Cache it with default expiration
            tokenCache = {
              token,
              expiresAt: Date.now() + (3600 * 1000), // Default to 1 hour
              fetchedAt: Date.now()
            };
            return token;
          }
        }
      } catch (e) {
        // Couldn't decode, but format is valid, use it
        console.log('🔑 [USHA_TOKEN] Using token from environment variable');
        // Cache it with default expiration
        tokenCache = {
          token,
          expiresAt: Date.now() + (3600 * 1000), // Default to 1 hour
          fetchedAt: Date.now()
        };
        return token;
      }
    } else {
      console.warn('⚠️ [USHA_TOKEN] Environment token has invalid format, fetching fresh token');
      // Fall through to fetch fresh token
    }
  }

  // Priority 3: Try Cognito authentication (uses refresh token or username/password)
  try {
    const { getCognitoIdToken } = await import('./cognitoAuth');
    console.log('🔑 [USHA_TOKEN] Attempting Cognito authentication...');
    const cognitoToken = await getCognitoIdToken(null, forceRefresh);
    if (cognitoToken) {
      // Try to use Cognito token directly with refresh endpoint to get USHA JWT
      // This is more reliable than token exchange
      console.log('🔄 [USHA_TOKEN] Attempting to get USHA JWT via refresh endpoint with Cognito token...');
      const ushaJwtToken = await refreshUshaToken(cognitoToken);
      
      if (ushaJwtToken) {
        console.log('✅ [USHA_TOKEN] Successfully obtained USHA JWT token via refresh endpoint');
        return ushaJwtToken;
      }
      
      // If refresh endpoint doesn't work with Cognito token, try exchange
      try {
        const { exchangeCognitoForUshaJwt } = await import('./exchangeCognitoForUshaJwt');
        console.log('🔄 [USHA_TOKEN] Trying Cognito token exchange...');
        const exchangedToken = await exchangeCognitoForUshaJwt(cognitoToken);
        
        if (exchangedToken) {
          // Cache the USHA JWT token
          try {
            const parts = exchangedToken.split('.');
            if (parts.length === 3) {
              const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
              if (payload.exp) {
                tokenCache = {
                  token: exchangedToken,
                  expiresAt: payload.exp * 1000,
                  fetchedAt: Date.now()
                };
              }
            }
          } catch (e) {
            // Couldn't decode expiration, but token is valid
          }
          console.log('✅ [USHA_TOKEN] Successfully exchanged Cognito token for USHA JWT');
          return exchangedToken;
        }
      } catch (e) {
        console.log('⚠️ [USHA_TOKEN] Token exchange also failed:', e);
      }
      
      // Last resort: try using Cognito ID token directly (may not work for DNC API)
      console.log('⚠️ [USHA_TOKEN] Using Cognito ID token directly (may not work for all APIs)');
      return cognitoToken;
    }
  } catch (e) {
    // Cognito auth not configured or failed, continue to fallback
    console.log('⚠️ [USHA_TOKEN] Cognito authentication not available, trying other methods...');
  }

  // All token sources failed - this is a critical error
  console.error('❌ [USHA_TOKEN] CRITICAL: All token sources failed!');
  throw new Error(
    'Failed to obtain valid USHA token. ' +
    'Please configure one of the following (in order of preference):\n' +
    '  1. Cognito refresh token (RECOMMENDED - fully automated): COGNITO_REFRESH_TOKEN\n' +
    '  2. Cognito credentials (auto-refreshes): COGNITO_USERNAME/COGNITO_PASSWORD\n' +
    '  3. Direct OAuth (auto-refreshes): USHA_USERNAME/USHA_PASSWORD or USHA_CLIENT_ID/USHA_CLIENT_SECRET\n' +
    '  4. Temporary token (optional - auto-refreshes when expired): USHA_JWT_TOKEN'
  );
}

/**
 * Clears the token cache (useful for testing or forced refresh)
 */
export function clearTokenCache(): void {
  tokenCache = null;
  console.log('🔑 [USHA_TOKEN] Token cache cleared');
}
