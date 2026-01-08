/**
 * Automatic USHA JWT Token Fetcher
 * 
 * Supports multiple authentication methods in priority order:
 * 1. Provided token (request parameter)
 * 2. Environment variable (USHA_JWT_TOKEN - user explicitly set, takes precedence over cache and file)
 * 3. Cached token (if valid, in-memory)
 * 4. Persistent file storage (survives restarts, auto-refreshes when expired)
 * 5. Cognito authentication (automatic refresh via COGNITO_REFRESH_TOKEN)
 * 6. Direct OAuth authentication (USHA_USERNAME/USHA_PASSWORD or USHA_CLIENT_ID/USHA_CLIENT_SECRET)
 * 
 * Tokens are automatically refreshed and persisted to disk, ensuring continuous operation
 * without manual intervention. Refreshed tokens survive server restarts.
 * 
 * IMPORTANT: When USHA_JWT_TOKEN is set in environment variables, it takes precedence
 * over any token stored in the persistent file. This ensures that explicitly configured
 * tokens are always used, even if a stale token exists in the file.
 */

import { getDataFilePath, safeReadFile, safeWriteFile, ensureDataDirectory } from './dataDirectory';
import { withLock } from './fileLock';

interface CachedToken {
  token: string;
  expiresAt: number; // Unix timestamp in milliseconds
  fetchedAt: number;
}

interface StoredToken {
  token: string;
  expiresAt: number; // Unix timestamp in milliseconds
  storedAt: number;
}

// In-memory cache (server-side only)
let tokenCache: CachedToken | null = null;

// Token file path in persistent storage
const TOKEN_FILE = 'usha-jwt-token.json';

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
 * Load token from persistent storage file
 */
function loadTokenFromFile(): StoredToken | null {
  try {
    const filePath = getDataFilePath(TOKEN_FILE);
    const content = safeReadFile(filePath);
    if (!content) {
      return null;
    }
    
    const stored: StoredToken = JSON.parse(content);
    
    // Validate token format
    if (!stored.token || !isValidJWTFormat(stored.token)) {
      console.warn('⚠️ [USHA_TOKEN] Stored token has invalid format, ignoring');
      return null;
    }
    
    return stored;
  } catch (error) {
    console.warn('⚠️ [USHA_TOKEN] Failed to load token from file:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Save token to persistent storage file (with file locking to prevent concurrent writes)
 */
async function saveTokenToFile(token: string, expiresAt: number): Promise<void> {
  try {
    ensureDataDirectory();
    const filePath = getDataFilePath(TOKEN_FILE);
    
    // Use file locking to prevent concurrent writes
    await withLock(filePath, async () => {
      const stored: StoredToken = {
        token,
        expiresAt,
        storedAt: Date.now()
      };
      
      safeWriteFile(filePath, JSON.stringify(stored, null, 2));
      console.log('💾 [USHA_TOKEN] Token saved to persistent storage');
    });
  } catch (error) {
    console.error('❌ [USHA_TOKEN] Failed to save token to file:', error instanceof Error ? error.message : 'Unknown error');
    // Don't throw - file save failure shouldn't break token usage
  }
}

/**
 * Refresh USHA JWT token using the refresh endpoint
 * Automatically saves refreshed token to persistent storage
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
      
      // Calculate expiration
      let expiresAt = Date.now() + (3600 * 1000); // Default to 1 hour
      try {
        const parts = newToken.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
          if (payload.exp) {
            expiresAt = payload.exp * 1000;
          } else if (data.tokenResult.expires_in) {
            expiresAt = Date.now() + (data.tokenResult.expires_in * 1000);
          }
        }
      } catch (e) {
        // Use default expiration
      }
      
      // Cache in memory
      tokenCache = {
        token: newToken,
        expiresAt,
        fetchedAt: Date.now()
      };
      
      // Save to persistent file (survives restarts)
      await saveTokenToFile(newToken, expiresAt);
      
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
 * 2. Environment variable (USHA_JWT_TOKEN - user explicitly set, takes precedence over cache and file)
 * 3. Cached token (in-memory, if still valid, auto-refreshes when expired)
 * 4. Persistent file storage (survives restarts, auto-refreshes when expired)
 * 5. Cognito authentication (uses COGNITO_REFRESH_TOKEN or COGNITO_USERNAME/PASSWORD) - RECOMMENDED
 * 6. Direct OAuth authentication (USHA_USERNAME/USHA_PASSWORD or USHA_CLIENT_ID/USHA_CLIENT_SECRET)
 * 
 * Once a token is obtained, it will automatically refresh via the refresh endpoint and persist to disk.
 * Refreshed tokens survive server restarts. When USHA_JWT_TOKEN is set in environment variables,
 * it takes precedence over the persistent file to ensure explicitly configured tokens are always used.
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

  // Priority 2: Check environment variable FIRST (user explicitly set it, takes precedence over cache and file)
  // This ensures that when USHA_JWT_TOKEN is configured, it's always used even if stale tokens exist in cache or file
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
              const PROACTIVE_REFRESH_THRESHOLD = 30 * 60 * 1000; // 30 minutes
              
              // Save to persistent storage immediately (so it survives restarts)
              await saveTokenToFile(token, expiration);
              
              // Update cache with environment token (overwrites any stale cache)
              tokenCache = {
                token,
                expiresAt: expiration,
                fetchedAt: now
              };
              
              if (timeUntilExpiry < PROACTIVE_REFRESH_THRESHOLD) {
                console.log(`⚠️ [USHA_TOKEN] Environment token expires in ${expiresIn}min, refreshing proactively...`);
                const refreshedToken = await refreshUshaToken(token);
                if (refreshedToken) {
                  return refreshedToken;
                }
                console.log(`⚠️ [USHA_TOKEN] Proactive refresh failed, using environment token (expires in ${expiresIn}min)`);
              } else {
                console.log(`🔑 [USHA_TOKEN] Using token from environment variable (expires in ${expiresIn}min) - saved to persistent storage and cache`);
              }
              
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
            }
          } else {
            // No expiration in token, assume valid
            const expiration = Date.now() + (3600 * 1000); // Default to 1 hour
            await saveTokenToFile(token, expiration);
            console.log('🔑 [USHA_TOKEN] Using token from environment variable (no expiration in token) - saved to persistent storage');
            tokenCache = {
              token,
              expiresAt: expiration,
              fetchedAt: Date.now()
            };
            return token;
          }
        }
      } catch (e) {
        // Couldn't decode, but format is valid
        const expiration = Date.now() + (3600 * 1000); // Default to 1 hour
        await saveTokenToFile(token, expiration);
        console.log('🔑 [USHA_TOKEN] Using token from environment variable - saved to persistent storage');
        tokenCache = {
          token,
          expiresAt: expiration,
          fetchedAt: Date.now()
        };
        return token;
      }
    } else {
      console.warn('⚠️ [USHA_TOKEN] Environment token has invalid format, checking other sources...');
    }
  }

  // Priority 3: Check cache if still valid (and not forcing refresh)
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

  // Priority 4: Load from persistent file (survives restarts)
  const storedToken = loadTokenFromFile();
  if (storedToken) {
    const now = Date.now();
    const timeUntilExpiry = storedToken.expiresAt - now;
    const remainingMinutes = Math.floor(timeUntilExpiry / 60000);
    
    if (timeUntilExpiry > 0) {
      // Restore to cache
      tokenCache = {
        token: storedToken.token,
        expiresAt: storedToken.expiresAt,
        fetchedAt: storedToken.storedAt
      };
      
      const PROACTIVE_REFRESH_THRESHOLD = 30 * 60 * 1000; // 30 minutes
      
      if (timeUntilExpiry < PROACTIVE_REFRESH_THRESHOLD) {
        console.log(`⚠️ [USHA_TOKEN] Stored token expires in ${remainingMinutes}min, refreshing proactively...`);
        const refreshedToken = await refreshUshaToken(storedToken.token);
        if (refreshedToken) {
          return refreshedToken;
        }
        console.log(`⚠️ [USHA_TOKEN] Proactive refresh failed, using stored token (expires in ${remainingMinutes}min)`);
        return storedToken.token;
      } else {
        console.log(`🔑 [USHA_TOKEN] Using token from persistent storage (expires in ${remainingMinutes}min)`);
        return storedToken.token;
      }
    } else {
      console.warn(`⚠️ [USHA_TOKEN] Stored token expired ${Math.abs(remainingMinutes)} minutes ago`);
      // Try to refresh it anyway (may fail since refresh requires valid token)
      const refreshedToken = await refreshUshaToken(storedToken.token);
      if (refreshedToken) {
        return refreshedToken;
      }
    }
  }

  // Priority 5: Try Cognito authentication (uses refresh token or username/password)
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

  // Priority 6: Try direct OAuth authentication (no middleman)
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
