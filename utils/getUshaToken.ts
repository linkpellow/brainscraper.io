/**
 * Automatic USHA JWT Token Fetcher
 * 
 * Supports multiple authentication methods in priority order:
 * Updated to use /account/refresh endpoint for token self-refresh
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
 * Gets a valid USHA JWT token with automatic fetching and caching
 * 
 * Priority order:
 * 1. Provided token (request parameter)
 * 2. Cached token (if still valid)
 * 3. Environment variable (USHA_JWT_TOKEN or COGNITO_ID_TOKEN)
 * 4. Cognito authentication (automatic refresh via COGNITO_REFRESH_TOKEN)
 * 5. Direct OAuth authentication (USHA_USERNAME/USHA_PASSWORD or USHA_CLIENT_ID/USHA_CLIENT_SECRET)
 * 
 * Throws error if all sources fail. Configure COGNITO_REFRESH_TOKEN for seamless automation.
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

  // Priority 3: Check environment variable (with expiration validation)
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
              console.log(`🔑 [USHA_TOKEN] Using token from environment variable (expires in ${expiresIn}min)`);
              // Cache it for future use
              tokenCache = {
                token,
                expiresAt: expiration,
                fetchedAt: now
              };
              return token;
            } else {
              console.warn(`⚠️ [USHA_TOKEN] Environment token expired ${Math.abs(expiresIn)} minutes ago, attempting refresh...`);
              // Token expired, try to refresh via direct auth
            }
          } else {
            // No expiration in token, assume valid
            console.log('🔑 [USHA_TOKEN] Using token from environment variable (no expiration in token)');
            return token;
          }
        }
      } catch (e) {
        // Couldn't decode, but format is valid, use it
      console.log('🔑 [USHA_TOKEN] Using token from environment variable');
      return token;
      }
    } else {
      console.warn('⚠️ [USHA_TOKEN] Environment token has invalid format, fetching fresh token');
      // Fall through to fetch fresh token
    }
  }

  // Priority 4: Try Cognito authentication (exchange Cognito ID token for USHA JWT)
  try {
    const cognitoAuth = await import('./cognitoAuth');
    console.log('🔑 [USHA_TOKEN] Attempting Cognito authentication...');
    const cognitoToken = await cognitoAuth.getCognitoIdToken(null, forceRefresh);
    // Note: Access token is not needed for USHA JWT exchange, ID token is sufficient
    const cognitoAccessToken: string | undefined = undefined;
    
    if (cognitoToken) {
      // Exchange Cognito ID token for USHA JWT token (try both ID and Access tokens)
      try {
        const exchangeModule = await import('./exchangeCognitoForUshaJwt');
        console.log('🔄 [USHA_TOKEN] Exchanging Cognito token for USHA JWT token...');
        // Note: cognitoAccessToken is undefined, so we only pass the ID token
        const ushaJwtToken = await exchangeModule.exchangeCognitoForUshaJwt(cognitoToken);
        
        if (ushaJwtToken) {
          // Cache the USHA JWT token
          try {
            const parts = ushaJwtToken.split('.');
            if (parts.length === 3) {
              const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
              if (payload.exp) {
                tokenCache = {
                  token: ushaJwtToken,
                  expiresAt: payload.exp * 1000,
                  fetchedAt: Date.now()
                };
              }
            }
          } catch (e) {
            // Couldn't decode expiration, but token is valid
          }
          console.log('✅ [USHA_TOKEN] Successfully exchanged Cognito token for USHA JWT');
          return ushaJwtToken;
        } else {
          console.log('⚠️ [USHA_TOKEN] Token exchange failed, trying Cognito Access Token...');
          // Try using Cognito Access Token instead of ID token
          if (cognitoAccessToken) {
            console.log('🔄 [USHA_TOKEN] Attempting to use Cognito Access Token directly...');
            return cognitoAccessToken;
          }
          console.log('⚠️ [USHA_TOKEN] No Access Token available, using Cognito ID token directly (may not work)');
          // Fallback: try using Cognito ID token directly (may not work)
          return cognitoToken;
        }
      } catch (e) {
        console.log('⚠️ [USHA_TOKEN] Token exchange error, trying Cognito Access Token...', e);
        // Try using Cognito Access Token instead
        if (cognitoAccessToken) {
          console.log('🔄 [USHA_TOKEN] Using Cognito Access Token as fallback...');
          return cognitoAccessToken;
        }
        // Fallback: try using Cognito ID token directly
        console.log('⚠️ [USHA_TOKEN] Using Cognito ID token directly (may not work)');
        return cognitoToken;
      }
    }
  } catch (e) {
    // Cognito auth not configured or failed, continue to fallback
    console.log('⚠️ [USHA_TOKEN] Cognito authentication not available, trying direct OAuth...');
  }

  // Priority 5: Try USHA refresh token (direct OAuth refresh)
  // This is the permanent solution - if we have a USHA refresh token, we can refresh USHA JWTs directly
  if (process.env.USHA_REFRESH_TOKEN) {
    try {
      const { getUshaTokenDirect } = await import('./ushaDirectAuth');
      console.log('🔑 [USHA_TOKEN] Attempting USHA refresh token authentication...');
      const directToken = await getUshaTokenDirect(null, forceRefresh);
      if (directToken) {
        console.log('✅ [USHA_TOKEN] Successfully obtained token via USHA refresh token');
        return directToken;
      }
    } catch (e) {
      console.log('⚠️ [USHA_TOKEN] USHA refresh token authentication failed, trying direct OAuth...');
    }
  }

  // Priority 6: Try direct OAuth authentication (username/password or client credentials)
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
    'Please configure one of the following:\n' +
    '  1. Cognito refresh token (RECOMMENDED): COGNITO_REFRESH_TOKEN\n' +
    '  2. Cognito credentials: COGNITO_USERNAME/COGNITO_PASSWORD\n' +
    '  3. Direct OAuth: USHA_USERNAME/USHA_PASSWORD or USHA_CLIENT_ID/USHA_CLIENT_SECRET\n' +
    '  4. Environment variable: USHA_JWT_TOKEN or COGNITO_ID_TOKEN'
  );
}

/**
 * Clears the token cache (useful for testing or forced refresh)
 */
export function clearTokenCache(): void {
  tokenCache = null;
  console.log('🔑 [USHA_TOKEN] Token cache cleared');
}
